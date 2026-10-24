/**
 * Windows ProRes (and other) decode via redistributable LGPL FFmpeg shared libs.
 * Compile only when NEUD_WITH_FFMPEG=1 and FFMPEG_DIR points at an LGPL shared build.
 * See docs/licensing/ffmpeg-lgpl.md.
 *
 * Emits straight BGRA (alpha preserved for ProRes 4444). Supports source dimensions
 * including 3840×2160 without forced downscale.
 */

#include "video-decoder.h"

#if defined(_WIN32) && defined(NEUD_WITH_FFMPEG)

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/avutil.h>
#include <libavutil/imgutils.h>
#include <libswscale/swscale.h>
}

#include <atomic>
#include <chrono>
#include <cstring>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace neud::video {
namespace {

class FFmpegVideoDecoder final : public VideoDecoder {
 public:
  ~FFmpegVideoDecoder() override { close(); }

  bool open(const std::string &filePath, MediaInfo *outInfo, std::string *error) override {
    close();
    if (avformat_open_input(&format_, filePath.c_str(), nullptr, nullptr) < 0) {
      if (error) *error = "Unable to open media file.";
      return false;
    }
    if (avformat_find_stream_info(format_, nullptr) < 0) {
      if (error) *error = "Unable to read media stream info.";
      close();
      return false;
    }
    videoStream_ = av_find_best_stream(format_, AVMEDIA_TYPE_VIDEO, -1, -1, nullptr, 0);
    if (videoStream_ < 0) {
      if (error) *error = "No video stream found.";
      close();
      return false;
    }
    AVStream *stream = format_->streams[videoStream_];
    const AVCodec *codec = avcodec_find_decoder(stream->codecpar->codec_id);
    if (!codec) {
      if (error) *error = "No decoder available for this codec.";
      close();
      return false;
    }
    codec_ = avcodec_alloc_context3(codec);
    if (!codec_ || avcodec_parameters_to_context(codec_, stream->codecpar) < 0) {
      if (error) *error = "Unable to configure decoder.";
      close();
      return false;
    }
    if (avcodec_open2(codec_, codec, nullptr) < 0) {
      if (error) *error = "Unable to open decoder.";
      close();
      return false;
    }

    frame_ = av_frame_alloc();
    packet_ = av_packet_alloc();
    if (!frame_ || !packet_) {
      if (error) *error = "Unable to allocate decode buffers.";
      close();
      return false;
    }

    info_.width = codec_->width;
    info_.height = codec_->height;
    info_.hasAlpha =
        codec_->pix_fmt == AV_PIX_FMT_YUVA444P10LE || codec_->pix_fmt == AV_PIX_FMT_YUVA444P ||
        codec_->pix_fmt == AV_PIX_FMT_YUVA422P10LE || codec_->pix_fmt == AV_PIX_FMT_BGRA ||
        codec_->pix_fmt == AV_PIX_FMT_RGBA;
    info_.codecLabel = codec->name ? codec->name : "ffmpeg";
    if (stream->avg_frame_rate.den > 0) {
      info_.frameRate = av_q2d(stream->avg_frame_rate);
    } else if (stream->r_frame_rate.den > 0) {
      info_.frameRate = av_q2d(stream->r_frame_rate);
    }
    if (format_->duration > 0) {
      info_.durationSeconds = static_cast<double>(format_->duration) / AV_TIME_BASE;
    }

    sws_ = sws_getContext(
        info_.width,
        info_.height,
        codec_->pix_fmt,
        info_.width,
        info_.height,
        AV_PIX_FMT_BGRA,
        SWS_BILINEAR,
        nullptr,
        nullptr,
        nullptr);
    if (!sws_) {
      if (error) *error = "Unable to create color converter (swscale).";
      close();
      return false;
    }

    const int stride = info_.width * 4;
    bgra_.assign(static_cast<size_t>(stride) * static_cast<size_t>(info_.height), 0);
    state_ = PlaybackState::Opened;
    if (outInfo) *outInfo = info_;
    emitState(state_, "");
    return true;
  }

  void play() override {
    std::lock_guard<std::mutex> lock(mutex_);
    if (state_ == PlaybackState::Error || state_ == PlaybackState::Idle) return;
    if (state_ == PlaybackState::Ended || state_ == PlaybackState::Stopped) {
      seekStartUnlocked();
    }
    playing_ = true;
    state_ = PlaybackState::Playing;
    emitState(state_, "");
    if (!worker_.joinable()) {
      worker_ = std::thread([this]() { decodeLoop(); });
    }
  }

  void pause() override {
    std::lock_guard<std::mutex> lock(mutex_);
    if (state_ != PlaybackState::Playing) return;
    playing_ = false;
    state_ = PlaybackState::Paused;
    emitState(state_, "");
  }

  void stop() override {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      playing_ = false;
      stopRequested_ = true;
      state_ = PlaybackState::Stopped;
      emitState(state_, "");
    }
    if (worker_.joinable()) worker_.join();
    stopRequested_ = false;
    std::lock_guard<std::mutex> lock(mutex_);
    seekStartUnlocked();
  }

  void restart() override {
    stop();
    play();
  }

  void setLoop(bool enabled) override { loop_ = enabled; }
  bool loop() const override { return loop_; }
  PlaybackState state() const override { return state_; }
  MediaInfo info() const override { return info_; }
  void setFrameCallback(FrameCallback cb) override { frameCb_ = std::move(cb); }
  void setStateCallback(StateCallback cb) override { stateCb_ = std::move(cb); }

  void close() override {
    stop();
    std::lock_guard<std::mutex> lock(mutex_);
    if (sws_) {
      sws_freeContext(sws_);
      sws_ = nullptr;
    }
    if (packet_) {
      av_packet_free(&packet_);
      packet_ = nullptr;
    }
    if (frame_) {
      av_frame_free(&frame_);
      frame_ = nullptr;
    }
    if (codec_) {
      avcodec_free_context(&codec_);
      codec_ = nullptr;
    }
    if (format_) {
      avformat_close_input(&format_);
      format_ = nullptr;
    }
    videoStream_ = -1;
    state_ = PlaybackState::Idle;
  }

 private:
  void emitState(PlaybackState state, const std::string &error) {
    if (stateCb_) stateCb_(state, error);
  }

  void seekStartUnlocked() {
    if (!format_ || videoStream_ < 0) return;
    av_seek_frame(format_, videoStream_, 0, AVSEEK_FLAG_BACKWARD);
    if (codec_) avcodec_flush_buffers(codec_);
  }

  void decodeLoop() {
    using clock = std::chrono::steady_clock;
    auto nextPresent = clock::now();
    const double fps = info_.frameRate > 1.0 ? info_.frameRate : 30.0;
    const auto frameDuration = std::chrono::duration_cast<clock::duration>(
        std::chrono::duration<double>(1.0 / fps));

    while (!stopRequested_) {
      if (!playing_) {
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
        continue;
      }

      int read = av_read_frame(format_, packet_);
      if (read < 0) {
        if (loop_) {
          std::lock_guard<std::mutex> lock(mutex_);
          seekStartUnlocked();
          continue;
        }
        playing_ = false;
        state_ = PlaybackState::Ended;
        emitState(state_, "");
        break;
      }
      if (packet_->stream_index != videoStream_) {
        av_packet_unref(packet_);
        continue;
      }
      if (avcodec_send_packet(codec_, packet_) < 0) {
        av_packet_unref(packet_);
        continue;
      }
      av_packet_unref(packet_);

      while (avcodec_receive_frame(codec_, frame_) == 0) {
        uint8_t *dstSlices[4] = {bgra_.data(), nullptr, nullptr, nullptr};
        int dstStride[4] = {info_.width * 4, 0, 0, 0};
        sws_scale(
            sws_,
            frame_->data,
            frame_->linesize,
            0,
            info_.height,
            dstSlices,
            dstStride);

        DecodedFrame out;
        out.width = info_.width;
        out.height = info_.height;
        out.stride = info_.width * 4;
        out.ptsUs = frame_->pts != AV_NOPTS_VALUE
                        ? static_cast<int64_t>(
                              frame_->pts * av_q2d(format_->streams[videoStream_]->time_base) *
                              1'000'000.0)
                        : 0;
        out.bgra = bgra_.data();
        out.byteLength = bgra_.size();
        if (frameCb_) frameCb_(out);

        nextPresent += frameDuration;
        std::this_thread::sleep_until(nextPresent);
        if (stopRequested_ || !playing_) break;
      }
    }
  }

  std::mutex mutex_;
  AVFormatContext *format_ = nullptr;
  AVCodecContext *codec_ = nullptr;
  AVFrame *frame_ = nullptr;
  AVPacket *packet_ = nullptr;
  SwsContext *sws_ = nullptr;
  int videoStream_ = -1;
  MediaInfo info_{};
  std::vector<uint8_t> bgra_;
  FrameCallback frameCb_;
  StateCallback stateCb_;
  std::atomic<bool> playing_{false};
  std::atomic<bool> stopRequested_{false};
  std::atomic<bool> loop_{false};
  std::atomic<PlaybackState> state_{PlaybackState::Idle};
  std::thread worker_;
};

}  // namespace

#define NEUD_VIDEO_HAS_PLATFORM_DECODER 1
std::unique_ptr<VideoDecoder> CreatePlatformVideoDecoder() {
  return std::unique_ptr<VideoDecoder>(new FFmpegVideoDecoder());
}

}  // namespace neud::video

#endif  // _WIN32 && NEUD_WITH_FFMPEG
