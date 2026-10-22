#import <AVFoundation/AVFoundation.h>
#import <CoreVideo/CoreVideo.h>
#include "recorder.h"

#include <atomic>
#include <cmath>
#include <mutex>

namespace neud::recorder {
namespace {

class AvFoundationDiskRecorder final : public DiskRecorder {
 public:
  ~AvFoundationDiskRecorder() override { close(); }

  bool open(const OpenParams &params, std::string *error) override {
    close();
    @autoreleasepool {
      if (params.width < 16 || params.height < 16) {
        if (error) *error = "Invalid recording dimensions.";
        return false;
      }
      NSURL *url = [NSURL fileURLWithPath:[NSString stringWithUTF8String:params.filePath.c_str()]];
      if (!url) {
        if (error) *error = "Invalid destination path.";
        return false;
      }

      NSError *nsError = nil;
      AVAssetWriter *writer =
          [[AVAssetWriter alloc] initWithURL:url fileType:AVFileTypeQuickTimeMovie error:&nsError];
      if (params.codec == CodecId::H264) {
        writer = [[AVAssetWriter alloc] initWithURL:url fileType:AVFileTypeMPEG4 error:&nsError];
      }
      if (!writer) {
        if (error) {
          *error = nsError ? std::string(nsError.localizedDescription.UTF8String)
                           : "Unable to create asset writer.";
        }
        return false;
      }

      NSString *codecKey = AVVideoCodecTypeAppleProRes4444;
      bool wantsAlpha = params.preserveAlpha && params.codec == CodecId::ProRes4444;
      if (params.codec == CodecId::ProRes422HQ) {
        codecKey = AVVideoCodecTypeAppleProRes422HQ;
        wantsAlpha = false;
      } else if (params.codec == CodecId::H264) {
        codecKey = AVVideoCodecTypeH264;
        wantsAlpha = false;
      }

      NSDictionary *compression = @{};
      if (params.codec == CodecId::H264) {
        compression = @{
          AVVideoAverageBitRateKey : @(params.width * params.height * 4),
          AVVideoProfileLevelKey : AVVideoProfileLevelH264HighAutoLevel,
        };
      }

      NSDictionary *settings = @{
        AVVideoCodecKey : codecKey,
        AVVideoWidthKey : @(params.width),
        AVVideoHeightKey : @(params.height),
        AVVideoCompressionPropertiesKey : compression,
      };

      AVAssetWriterInput *input =
          [[AVAssetWriterInput alloc] initWithMediaType:AVMediaTypeVideo outputSettings:settings];
      input.expectsMediaDataInRealTime = YES;
      if (![writer canAddInput:input]) {
        if (error) *error = "Unable to attach video input to asset writer.";
        return false;
      }
      [writer addInput:input];

      NSDictionary *attrs = @{
        (id)kCVPixelBufferPixelFormatTypeKey : @(wantsAlpha ? kCVPixelFormatType_32BGRA
                                                            : kCVPixelFormatType_32BGRA),
        (id)kCVPixelBufferWidthKey : @(params.width),
        (id)kCVPixelBufferHeightKey : @(params.height),
        (id)kCVPixelBufferCGImageCompatibilityKey : @YES,
        (id)kCVPixelBufferCGBitmapContextCompatibilityKey : @YES,
      };
      AVAssetWriterInputPixelBufferAdaptor *adaptor =
          [[AVAssetWriterInputPixelBufferAdaptor alloc] initWithAssetWriterInput:input
                                                     sourcePixelBufferAttributes:attrs];

      if (![writer startWriting]) {
        if (error) {
          *error = writer.error
                       ? std::string(writer.error.localizedDescription.UTF8String)
                       : "Asset writer failed to start.";
        }
        return false;
      }
      [writer startSessionAtSourceTime:kCMTimeZero];

      std::lock_guard<std::mutex> lock(mutex_);
      writer_ = writer;
      input_ = input;
      adaptor_ = adaptor;
      width_ = params.width;
      height_ = params.height;
      fpsNum_ = params.fpsNumerator > 0 ? params.fpsNumerator : 30;
      fpsDen_ = params.fpsDenominator > 0 ? params.fpsDenominator : 1;
      preserveAlpha_ = wantsAlpha;
      bgR_ = params.backgroundR;
      bgG_ = params.backgroundG;
      bgB_ = params.backgroundB;
      encoded_ = 0;
      dropped_ = 0;
      opened_ = true;
      return true;
    }
  }

  bool appendFrame(
      const uint8_t *bgra,
      size_t byteLength,
      int width,
      int height,
      int64_t ptsUs,
      std::string *error) override {
    @autoreleasepool {
      AVAssetWriterInput *input = nil;
      AVAssetWriterInputPixelBufferAdaptor *adaptor = nil;
      int targetW = 0;
      int targetH = 0;
      bool preserveAlpha = true;
      uint8_t bgR = 0;
      uint8_t bgG = 0;
      uint8_t bgB = 0;
      int fpsNum = 30;
      int fpsDen = 1;
      {
        std::lock_guard<std::mutex> lock(mutex_);
        if (!opened_ || !writer_ || !input_ || !adaptor_) {
          if (error) *error = "Recorder is not open.";
          return false;
        }
        input = input_;
        adaptor = adaptor_;
        targetW = width_;
        targetH = height_;
        preserveAlpha = preserveAlpha_;
        bgR = bgR_;
        bgG = bgG_;
        bgB = bgB_;
        fpsNum = fpsNum_;
        fpsDen = fpsDen_;
      }

      if (!bgra || width < 1 || height < 1 || byteLength < (size_t)width * (size_t)height * 4) {
        dropped_ += 1;
        if (error) *error = "Invalid frame buffer.";
        return false;
      }
      if (!input.readyForMoreMediaData) {
        dropped_ += 1;
        return true;
      }

      CVPixelBufferRef pixelBuffer = nullptr;
      CVReturn cvStatus = CVPixelBufferPoolCreatePixelBuffer(
          nullptr, adaptor.pixelBufferPool, &pixelBuffer);
      if (cvStatus != kCVReturnSuccess || !pixelBuffer) {
        // Fallback allocate.
        NSDictionary *attrs = @{
          (id)kCVPixelBufferPixelFormatTypeKey : @(kCVPixelFormatType_32BGRA),
          (id)kCVPixelBufferWidthKey : @(targetW),
          (id)kCVPixelBufferHeightKey : @(targetH),
        };
        cvStatus = CVPixelBufferCreate(
            kCFAllocatorDefault,
            targetW,
            targetH,
            kCVPixelFormatType_32BGRA,
            (__bridge CFDictionaryRef)attrs,
            &pixelBuffer);
        if (cvStatus != kCVReturnSuccess || !pixelBuffer) {
          dropped_ += 1;
          if (error) *error = "Unable to allocate pixel buffer.";
          return false;
        }
      }

      CVPixelBufferLockBaseAddress(pixelBuffer, 0);
      uint8_t *dst = (uint8_t *)CVPixelBufferGetBaseAddress(pixelBuffer);
      size_t dstStride = CVPixelBufferGetBytesPerRow(pixelBuffer);
      const size_t srcStride = (size_t)width * 4;
      const int copyW = width < targetW ? width : targetW;
      const int copyH = height < targetH ? height : targetH;
      for (int y = 0; y < targetH; y++) {
        uint8_t *row = dst + (size_t)y * dstStride;
        if (y >= copyH) {
          for (int x = 0; x < targetW; x++) {
            row[x * 4 + 0] = bgB;
            row[x * 4 + 1] = bgG;
            row[x * 4 + 2] = bgR;
            row[x * 4 + 3] = 255;
          }
          continue;
        }
        const uint8_t *src = bgra + (size_t)y * srcStride;
        for (int x = 0; x < targetW; x++) {
          if (x >= copyW) {
            row[x * 4 + 0] = bgB;
            row[x * 4 + 1] = bgG;
            row[x * 4 + 2] = bgR;
            row[x * 4 + 3] = 255;
            continue;
          }
          const uint8_t b = src[x * 4 + 0];
          const uint8_t g = src[x * 4 + 1];
          const uint8_t r = src[x * 4 + 2];
          const uint8_t a = src[x * 4 + 3];
          if (preserveAlpha) {
            row[x * 4 + 0] = b;
            row[x * 4 + 1] = g;
            row[x * 4 + 2] = r;
            row[x * 4 + 3] = a;
          } else {
            // Straight alpha composite over solid background.
            const float af = a / 255.0f;
            row[x * 4 + 0] = (uint8_t)std::lround(b * af + bgB * (1.0f - af));
            row[x * 4 + 1] = (uint8_t)std::lround(g * af + bgG * (1.0f - af));
            row[x * 4 + 2] = (uint8_t)std::lround(r * af + bgR * (1.0f - af));
            row[x * 4 + 3] = 255;
          }
        }
      }
      CVPixelBufferUnlockBaseAddress(pixelBuffer, 0);

      CMTime pts;
      if (ptsUs > 0) {
        pts = CMTimeMake(ptsUs, 1'000'000);
      } else {
        pts = CMTimeMake(encoded_ * fpsDen, fpsNum);
      }
      BOOL ok = [adaptor appendPixelBuffer:pixelBuffer withPresentationTime:pts];
      CVPixelBufferRelease(pixelBuffer);
      if (!ok) {
        dropped_ += 1;
        if (error) *error = "Failed to append pixel buffer.";
        return false;
      }
      encoded_ += 1;
      return true;
    }
  }

  bool finalize(std::string *error) override {
    @autoreleasepool {
      AVAssetWriter *writer = nil;
      AVAssetWriterInput *input = nil;
      {
        std::lock_guard<std::mutex> lock(mutex_);
        writer = writer_;
        input = input_;
      }
      if (!writer) {
        if (error) *error = "Recorder is not open.";
        return false;
      }
      [input markAsFinished];
      dispatch_semaphore_t sem = dispatch_semaphore_create(0);
      __block BOOL finishedOk = NO;
      __block NSString *failMessage = nil;
      [writer finishWritingWithCompletionHandler:^{
        finishedOk = writer.status == AVAssetWriterStatusCompleted;
        if (!finishedOk && writer.error) {
          failMessage = writer.error.localizedDescription;
        }
        dispatch_semaphore_signal(sem);
      }];
      dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, (int64_t)30 * NSEC_PER_SEC));
      {
        std::lock_guard<std::mutex> lock(mutex_);
        writer_ = nil;
        input_ = nil;
        adaptor_ = nil;
        opened_ = false;
      }
      if (!finishedOk) {
        if (error) {
          *error = failMessage ? std::string(failMessage.UTF8String)
                               : "Recording finalization failed or timed out.";
        }
        return false;
      }
      return true;
    }
  }

  void close() override {
    @autoreleasepool {
      std::lock_guard<std::mutex> lock(mutex_);
      if (writer_ && writer_.status == AVAssetWriterStatusWriting) {
        [writer_ cancelWriting];
      }
      writer_ = nil;
      input_ = nil;
      adaptor_ = nil;
      opened_ = false;
    }
  }

  int64_t encodedFrames() const override { return encoded_; }
  int64_t droppedFrames() const override { return dropped_; }

 private:
  std::mutex mutex_;
  AVAssetWriter *writer_ = nil;
  AVAssetWriterInput *input_ = nil;
  AVAssetWriterInputPixelBufferAdaptor *adaptor_ = nil;
  int width_ = 0;
  int height_ = 0;
  int fpsNum_ = 30;
  int fpsDen_ = 1;
  bool preserveAlpha_ = true;
  uint8_t bgR_ = 0;
  uint8_t bgG_ = 0;
  uint8_t bgB_ = 0;
  std::atomic<int64_t> encoded_{0};
  std::atomic<int64_t> dropped_{0};
  bool opened_ = false;
};

}  // namespace

std::vector<CodecAvailability> ListCodecAvailability() {
  return {
      {CodecId::ProRes4444,
       "prores-4444-mov",
       "ProRes 4444",
       true,
       true,
       "",
       "AVFoundation / VideoToolbox",
       "Apple system frameworks (no FFmpeg)."},
      {CodecId::ProRes422HQ,
       "prores-422hq-mov",
       "ProRes 422 HQ",
       false,
       true,
       "",
       "AVFoundation / VideoToolbox",
       "Apple system frameworks (no FFmpeg)."},
      {CodecId::H264,
       "h264-mp4",
       "H.264",
       false,
       true,
       "",
       "AVFoundation / VideoToolbox",
       "Apple system frameworks (no FFmpeg)."},
  };
}

std::unique_ptr<DiskRecorder> CreatePlatformDiskRecorder() {
  return std::unique_ptr<DiskRecorder>(new AvFoundationDiskRecorder());
}

}  // namespace neud::recorder
