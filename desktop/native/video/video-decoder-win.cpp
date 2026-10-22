/**
 * Windows ProRes decoder entry point.
 *
 * Full LGPL FFmpeg implementation is compiled when NEUD_WITH_FFMPEG=1 and
 * FFMPEG_DIR points at an LGPL shared build (see docs/licensing/ffmpeg-lgpl.md).
 * Default Windows builds use a clear unavailable stub so packaging never
 * silently links GPL FFmpeg or flattens alpha.
 */

#include "video-decoder.h"

#if defined(_WIN32)

#if defined(NEUD_WITH_FFMPEG)
// Optional: include the FFmpeg-backed translation unit via the build system
// (video-decoder-win-ffmpeg.cpp) instead of this file when vendorizing FFmpeg.
#error "Compile video-decoder-win-ffmpeg.cpp when NEUD_WITH_FFMPEG=1"
#else

namespace neud::video {
namespace {

class WindowsUnavailableDecoder final : public VideoDecoder {
 public:
  bool open(const std::string &, MediaInfo *, std::string *error) override {
    if (error) {
      *error =
          "Windows ProRes playback requires redistributable LGPL FFmpeg shared "
          "libraries (avformat/avcodec/avutil/swscale) bundled with NEUD. "
          "See docs/licensing/ffmpeg-lgpl.md. FFmpeg is not present in this build.";
    }
    state_ = PlaybackState::Error;
    return false;
  }
  void play() override {}
  void pause() override {}
  void stop() override {}
  void restart() override {}
  void setLoop(bool enabled) override { loop_ = enabled; }
  bool loop() const override { return loop_; }
  PlaybackState state() const override { return state_; }
  MediaInfo info() const override { return {}; }
  void setFrameCallback(FrameCallback) override {}
  void setStateCallback(StateCallback) override {}
  void close() override { state_ = PlaybackState::Idle; }

 private:
  PlaybackState state_ = PlaybackState::Idle;
  bool loop_ = true;
};

}  // namespace

#define NEUD_VIDEO_HAS_PLATFORM_DECODER 1
std::unique_ptr<VideoDecoder> CreatePlatformVideoDecoder() {
  return std::unique_ptr<VideoDecoder>(new WindowsUnavailableDecoder());
}

}  // namespace neud::video

#endif  // NEUD_WITH_FFMPEG
#endif  // _WIN32
