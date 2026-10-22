#include "video-decoder.h"

namespace neud::video {
namespace {

class StubVideoDecoder final : public VideoDecoder {
 public:
  bool open(const std::string &, MediaInfo *, std::string *error) override {
    if (error) {
      *error =
          "Native ProRes video decoding is not available on this platform build. "
          "macOS uses AVFoundation; Windows requires a bundled LGPL FFmpeg build.";
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

#if !defined(NEUD_VIDEO_HAS_PLATFORM_DECODER)
std::unique_ptr<VideoDecoder> CreatePlatformVideoDecoder() {
  return std::unique_ptr<VideoDecoder>(new StubVideoDecoder());
}
#endif  // !NEUD_VIDEO_HAS_PLATFORM_DECODER

}  // namespace neud::video
