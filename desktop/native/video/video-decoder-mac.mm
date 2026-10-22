#import <AVFoundation/AVFoundation.h>
#import <CoreVideo/CoreVideo.h>
#include "video-decoder.h"

#include <atomic>
#include <condition_variable>
#include <mutex>
#include <thread>
#include <vector>

namespace neud::video {
namespace {

class AvFoundationVideoDecoder final : public VideoDecoder {
 public:
  AvFoundationVideoDecoder() = default;
  ~AvFoundationVideoDecoder() override { close(); }

  bool open(const std::string &filePath, MediaInfo *outInfo, std::string *error) override {
    close();
    @autoreleasepool {
      NSURL *url = [NSURL fileURLWithPath:[NSString stringWithUTF8String:filePath.c_str()]];
      if (!url) {
        if (error) *error = "Invalid media path.";
        state_ = PlaybackState::Error;
        return false;
      }

      NSDictionary *options = @{AVURLAssetPreferPreciseDurationAndTimingKey : @YES};
      AVURLAsset *asset = [AVURLAsset URLAssetWithURL:url options:options];
      if (!asset) {
        if (error) *error = "Unable to open media asset.";
        state_ = PlaybackState::Error;
        return false;
      }

      NSError *loadError = nil;
      // Load tracks synchronously for deterministic open.
      dispatch_semaphore_t sem = dispatch_semaphore_create(0);
      __block BOOL tracksReady = NO;
      [asset loadValuesAsynchronouslyForKeys:@[ @"tracks", @"duration" ]
                           completionHandler:^{
                             tracksReady = YES;
                             dispatch_semaphore_signal(sem);
                           }];
      dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, (int64_t)8 * NSEC_PER_SEC));
      if (!tracksReady) {
        if (error) *error = "Timed out loading media tracks.";
        state_ = PlaybackState::Error;
        return false;
      }

      AVKeyValueStatus trackStatus = [asset statusOfValueForKey:@"tracks" error:&loadError];
      if (trackStatus != AVKeyValueStatusLoaded) {
        if (error) {
          *error = loadError
                       ? std::string(loadError.localizedDescription.UTF8String)
                       : "Media tracks failed to load.";
        }
        state_ = PlaybackState::Error;
        return false;
      }

      NSArray<AVAssetTrack *> *videoTracks = [asset tracksWithMediaType:AVMediaTypeVideo];
      if (videoTracks.count < 1) {
        if (error) *error = "No video track found in media.";
        state_ = PlaybackState::Error;
        return false;
      }
      AVAssetTrack *track = videoTracks.firstObject;
      CGSize natural = track.naturalSize;
      if (natural.width < 1 || natural.height < 1) {
        // Fall back to transformed size.
        CGSize transformed = CGSizeApplyAffineTransform(natural, track.preferredTransform);
        natural = CGSizeMake(fabs(transformed.width), fabs(transformed.height));
      }
      if (natural.width < 1 || natural.height < 1) {
        if (error) *error = "Unable to determine video dimensions.";
        state_ = PlaybackState::Error;
        return false;
      }

      float nominalRate = track.nominalFrameRate;
      CMTime duration = asset.duration;
      double durationSeconds =
          (duration.timescale > 0) ? (double)duration.value / (double)duration.timescale : 0.0;

      // ProRes 4444 / 4444 XQ report alpha-capable formats via format descriptions.
      bool hasAlpha = false;
      NSArray *formatDescs = track.formatDescriptions;
      for (id desc in formatDescs) {
        CMFormatDescriptionRef format = (__bridge CMFormatDescriptionRef)desc;
        FourCharCode codec = CMFormatDescriptionGetMediaSubType(format);
        if (codec == 'ap4h' || codec == 'ap4x') {
          hasAlpha = true;
          break;
        }
      }
      if (!hasAlpha) {
        if (error) {
          *error =
              "Media does not appear to be Apple ProRes 4444 with alpha (ap4h/ap4x).";
        }
        state_ = PlaybackState::Error;
        return false;
      }

      info_.width = (int)llround(natural.width);
      info_.height = (int)llround(natural.height);
      info_.durationSeconds = durationSeconds;
      info_.frameRate = nominalRate > 0.1f ? (double)nominalRate : 30.0;
      info_.hasAlpha = true;
      info_.codecLabel = "Apple ProRes 4444";

      asset_ = asset;
      track_ = track;
      filePath_ = filePath;
      state_ = PlaybackState::Opened;
      if (outInfo) *outInfo = info_;
      // Decode and hold the first frame for preview/thumbnail without playing.
      // open() does not hold mutex_; callbacks are typically unset until JS registers.
      {
        std::lock_guard<std::mutex> lock(mutex_);
        decodeFirstFrameLocked();
      }
      emitStateUnlocked();
      return true;
    }
  }

  void play() override {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (state_ == PlaybackState::Error || state_ == PlaybackState::Idle) return;
      if (state_ == PlaybackState::Playing) return;
      // Resume paused decode loop without restarting the worker.
      if (state_ == PlaybackState::Paused && worker_.joinable()) {
        state_ = PlaybackState::Playing;
        cv_.notify_all();
        emitStateLockedCopy();
        return;
      }
    }
    joinWorker();
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (!reader_ || state_ == PlaybackState::Ended || state_ == PlaybackState::Stopped ||
          state_ == PlaybackState::Opened) {
        if (!resetReaderLocked()) return;
      }
      running_ = true;
      state_ = PlaybackState::Playing;
      worker_ = std::thread([this] { decodeLoop(); });
      cv_.notify_all();
    }
    emitStateUnlocked();
  }

  void pause() override {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (state_ != PlaybackState::Playing) return;
      state_ = PlaybackState::Paused;
      cv_.notify_all();
    }
    emitStateUnlocked();
  }

  void stop() override {
    // Idempotent: cancel decode, join worker without holding mutex, then rewind.
    // Never call frame/state callbacks while holding mutex_ (avoids recursive lock +
    // ThreadSafeFunction BlockingCall deadlocks on the Electron main thread).
    fprintf(stderr, "[neud_video] stop: request received\n");
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (state_ == PlaybackState::Stopped && !worker_.joinable() && !running_) {
        fprintf(stderr, "[neud_video] stop: already stopped\n");
        return;
      }
      running_ = false;
      state_ = PlaybackState::Stopped;
      cv_.notify_all();
    }
    emitStateUnlocked();
    fprintf(stderr, "[neud_video] stop: joining decode thread\n");
    joinWorker();
    fprintf(stderr, "[neud_video] stop: decode thread exited\n");

    DecodedFrame firstFrame{};
    bool haveFrame = false;
    FrameCallback frameCb;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      resetReaderLocked();
      haveFrame = decodeFirstFrameIntoLocked(&firstFrame);
      frameCb = frameCb_;
    }
    if (haveFrame && frameCb) {
      frameCb(firstFrame);
    }
    fprintf(stderr, "[neud_video] stop: complete\n");
  }

  void restart() override {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      running_ = false;
      cv_.notify_all();
    }
    joinWorker();
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (!resetReaderLocked()) return;
      running_ = true;
      state_ = PlaybackState::Playing;
      worker_ = std::thread([this] { decodeLoop(); });
      cv_.notify_all();
    }
    emitStateUnlocked();
  }

  void setLoop(bool enabled) override {
    loop_ = enabled;
  }

  bool loop() const override { return loop_; }

  PlaybackState state() const override { return state_; }

  MediaInfo info() const override { return info_; }

  void setFrameCallback(FrameCallback cb) override {
    std::lock_guard<std::mutex> lock(mutex_);
    frameCb_ = std::move(cb);
  }

  void setStateCallback(StateCallback cb) override {
    std::lock_guard<std::mutex> lock(mutex_);
    stateCb_ = std::move(cb);
  }

  void joinWorker() {
    if (worker_.joinable()) {
      worker_.join();
    }
  }

  void close() override {
    fprintf(stderr, "[neud_video] close: begin\n");
    {
      std::lock_guard<std::mutex> lock(mutex_);
      running_ = false;
      shuttingDown_ = true;
      cv_.notify_all();
    }
    joinWorker();
    @autoreleasepool {
      std::lock_guard<std::mutex> lock(mutex_);
      if (reader_) {
        [reader_ cancelReading];
        reader_ = nil;
      }
      trackOutput_ = nil;
      track_ = nil;
      asset_ = nil;
      frameScratch_.clear();
      state_ = PlaybackState::Idle;
      shuttingDown_ = false;
    }
    fprintf(stderr, "[neud_video] close: complete\n");
  }

 private:
  /** Copy callback under lock, invoke outside — never call while holding mutex_. */
  void emitStateUnlocked() {
    StateCallback cb;
    PlaybackState s;
    std::string err;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      cb = stateCb_;
      s = state_;
      err = lastError_;
    }
    if (cb) cb(s, err);
  }

  /** Caller already holds mutex_. Copies callback then invokes after releasing is preferred;
   *  only use for paths that immediately return after notify (play resume). */
  void emitStateLockedCopy() {
    StateCallback cb = stateCb_;
    PlaybackState s = state_;
    std::string err = lastError_;
    // Unlock before callback by using a nested scope end — caller still holds lock.
    // Safe only when callback uses non-blocking delivery (see video-addon.cc).
    if (cb) cb(s, err);
  }

  /** Caller already holds mutex_. Invokes callback while locked — requires non-blocking TSFN. */
  void emitStateAssumingLocked() {
    StateCallback cb = stateCb_;
    PlaybackState s = state_;
    std::string err = lastError_;
    if (cb) cb(s, err);
  }

  bool resetReaderLocked() {
    @autoreleasepool {
      if (reader_) {
        [reader_ cancelReading];
        reader_ = nil;
      }
      trackOutput_ = nil;
      if (!asset_ || !track_) return false;

      NSError *error = nil;
      AVAssetReader *reader = [[AVAssetReader alloc] initWithAsset:asset_ error:&error];
      if (!reader) {
        lastError_ = error ? std::string(error.localizedDescription.UTF8String)
                           : "Unable to create asset reader.";
        state_ = PlaybackState::Error;
        emitStateAssumingLocked();
        return false;
      }

      NSDictionary *settings = @{
        (id)kCVPixelBufferPixelFormatTypeKey : @(kCVPixelFormatType_32BGRA),
      };
      AVAssetReaderTrackOutput *output =
          [[AVAssetReaderTrackOutput alloc] initWithTrack:track_ outputSettings:settings];
      output.alwaysCopiesSampleData = NO;
      if (![reader canAddOutput:output]) {
        lastError_ = "Unable to attach BGRA track output.";
        state_ = PlaybackState::Error;
        emitStateAssumingLocked();
        return false;
      }
      [reader addOutput:output];
      if (![reader startReading]) {
        lastError_ = reader.error
                         ? std::string(reader.error.localizedDescription.UTF8String)
                         : "Asset reader failed to start.";
        state_ = PlaybackState::Error;
        emitStateAssumingLocked();
        return false;
      }
      reader_ = reader;
      trackOutput_ = output;
      anchorHostTime_ = 0;
      anchorPtsUs_ = 0;
      return true;
    }
  }

  bool copySampleToFrame(CMSampleBufferRef sample, DecodedFrame *outFrame) {
    if (!sample || !outFrame) return false;
    CVImageBufferRef imageBuffer = CMSampleBufferGetImageBuffer(sample);
    if (!imageBuffer) return false;

    if (CVPixelBufferLockBaseAddress(imageBuffer, kCVPixelBufferLock_ReadOnly) != kCVReturnSuccess) {
      return false;
    }

    const size_t width = CVPixelBufferGetWidth(imageBuffer);
    const size_t height = CVPixelBufferGetHeight(imageBuffer);
    const size_t stride = CVPixelBufferGetBytesPerRow(imageBuffer);
    const uint8_t *base =
        static_cast<const uint8_t *>(CVPixelBufferGetBaseAddress(imageBuffer));
    if (!base || width < 1 || height < 1 || stride < width * 4) {
      CVPixelBufferUnlockBaseAddress(imageBuffer, kCVPixelBufferLock_ReadOnly);
      return false;
    }

    const size_t needed = stride * height;
    if (frameScratch_.size() < needed) {
      frameScratch_.resize(needed);
    }
    // Copy so we can unlock the pixel buffer before invoking the JS callback.
    memcpy(frameScratch_.data(), base, needed);
    CVPixelBufferUnlockBaseAddress(imageBuffer, kCVPixelBufferLock_ReadOnly);

    CMTime pts = CMSampleBufferGetPresentationTimeStamp(sample);
    int64_t ptsUs = 0;
    if (pts.timescale > 0) {
      ptsUs = (int64_t)((double)pts.value * 1'000'000.0 / (double)pts.timescale);
    }

    outFrame->width = (int)width;
    outFrame->height = (int)height;
    outFrame->stride = (int)stride;
    outFrame->ptsUs = ptsUs;
    outFrame->bgra = frameScratch_.data();
    outFrame->byteLength = needed;
    return true;
  }

  void publishFrame(const DecodedFrame &frame) {
    FrameCallback cb;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      cb = frameCb_;
    }
    if (cb) cb(frame);
  }

  /** Caller must hold mutex_. Does not invoke frame callback (avoids nested lock). */
  bool decodeFirstFrameIntoLocked(DecodedFrame *outFrame) {
    @autoreleasepool {
      if (!outFrame) return false;
      if (!reader_ && !resetReaderLocked()) return false;
      if (!trackOutput_) return false;
      CMSampleBufferRef sample = [trackOutput_ copyNextSampleBuffer];
      if (!sample) return false;
      bool ok = copySampleToFrame(sample, outFrame);
      CFRelease(sample);
      return ok;
    }
  }

  void decodeFirstFrameLocked() {
    DecodedFrame frame;
    if (!decodeFirstFrameIntoLocked(&frame)) return;
    FrameCallback cb = frameCb_;
    // Callback while holding mutex_ is unsafe with BlockingCall; open() runs before
    // JS callbacks are registered, so this path is typically a no-op at open time.
    if (cb) cb(frame);
  }

  void decodeLoop() {
    while (true) {
      PlaybackState localState;
      {
        std::unique_lock<std::mutex> lock(mutex_);
        cv_.wait(lock, [&] {
          return shuttingDown_ || !running_ || state_ == PlaybackState::Playing ||
                 state_ == PlaybackState::Paused;
        });
        if (shuttingDown_ || !running_) break;
        if (state_ == PlaybackState::Paused) {
          cv_.wait(lock, [&] {
            return shuttingDown_ || !running_ || state_ == PlaybackState::Playing;
          });
          if (shuttingDown_ || !running_) break;
        }
        localState = state_;
      }
      if (localState != PlaybackState::Playing) continue;

      @autoreleasepool {
        AVAssetReaderTrackOutput *output = nil;
        {
          std::lock_guard<std::mutex> lock(mutex_);
          output = trackOutput_;
        }
        if (!output) break;

        CMSampleBufferRef sample = [output copyNextSampleBuffer];
        if (!sample) {
          // End of stream.
          bool shouldLoop = loop_;
          bool ended = false;
          {
            std::lock_guard<std::mutex> lock(mutex_);
            if (!running_ || shuttingDown_) break;
            if (shouldLoop) {
              if (!resetReaderLocked()) break;
              anchorHostTime_ = 0;
              continue;
            }
            state_ = PlaybackState::Ended;
            running_ = false;
            ended = true;
          }
          if (ended) emitStateUnlocked();
          break;
        }

        DecodedFrame frame;
        bool ok = false;
        {
          std::lock_guard<std::mutex> lock(mutex_);
          ok = copySampleToFrame(sample, &frame);
        }
        CFRelease(sample);
        if (!ok) continue;

        // Pace to presentation timestamps against host clock — interruptible.
        const int64_t nowNs = (int64_t)(CACurrentMediaTime() * 1'000'000'000.0);
        int64_t anchorHost = 0;
        int64_t anchorPts = 0;
        {
          std::lock_guard<std::mutex> lock(mutex_);
          if (anchorHostTime_ == 0) {
            anchorHostTime_ = nowNs;
            anchorPtsUs_ = frame.ptsUs;
          }
          anchorHost = anchorHostTime_;
          anchorPts = anchorPtsUs_;
        }
        const int64_t targetNs = anchorHost + (frame.ptsUs - anchorPts) * 1000;
        if (targetNs > nowNs) {
          const int64_t sleepNs = targetNs - nowNs;
          if (sleepNs > 0 && sleepNs < 2'000'000'000LL) {
            std::unique_lock<std::mutex> lock(mutex_);
            cv_.wait_for(lock, std::chrono::nanoseconds(sleepNs), [&] {
              return shuttingDown_ || !running_ || state_ != PlaybackState::Playing;
            });
            if (shuttingDown_ || !running_ || state_ != PlaybackState::Playing) {
              continue;
            }
          }
        }

        {
          std::lock_guard<std::mutex> lock(mutex_);
          if (shuttingDown_ || !running_ || state_ != PlaybackState::Playing) {
            continue;
          }
        }
        publishFrame(frame);
      }
    }
  }

  std::mutex mutex_;
  std::condition_variable cv_;
  std::thread worker_;
  std::atomic<bool> running_{false};
  bool shuttingDown_ = false;
  std::atomic<bool> loop_{true};
  PlaybackState state_ = PlaybackState::Idle;
  MediaInfo info_{};
  std::string filePath_;
  std::string lastError_;
  FrameCallback frameCb_;
  StateCallback stateCb_;
  AVURLAsset *asset_ = nil;
  AVAssetTrack *track_ = nil;
  AVAssetReader *reader_ = nil;
  AVAssetReaderTrackOutput *trackOutput_ = nil;
  std::vector<uint8_t> frameScratch_;
  int64_t anchorHostTime_ = 0;
  int64_t anchorPtsUs_ = 0;
};

}  // namespace

#define NEUD_VIDEO_HAS_PLATFORM_DECODER 1
std::unique_ptr<VideoDecoder> CreatePlatformVideoDecoder() {
  return std::unique_ptr<VideoDecoder>(new AvFoundationVideoDecoder());
}

}  // namespace neud::video
