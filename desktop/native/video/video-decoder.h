#pragma once

#include <cstdint>
#include <functional>
#include <memory>
#include <string>

namespace neud::video {

enum class PlaybackState : int {
  Idle = 0,
  Opened = 1,
  Playing = 2,
  Paused = 3,
  Stopped = 4,
  Ended = 5,
  Error = 6,
};

struct MediaInfo {
  int width = 0;
  int height = 0;
  double durationSeconds = 0;
  double frameRate = 0;
  bool hasAlpha = false;
  std::string codecLabel;
};

struct DecodedFrame {
  int width = 0;
  int height = 0;
  int stride = 0;
  /** Presentation timestamp in microseconds. */
  int64_t ptsUs = 0;
  /**
   * BGRA8 pixels. Alpha is straight (non-premultiplied).
   * Buffer length is stride * height. Valid only for the duration of the
   * FrameCallback invocation unless the consumer copies it.
   */
  const uint8_t *bgra = nullptr;
  size_t byteLength = 0;
};

using FrameCallback = std::function<void(const DecodedFrame &frame)>;
using StateCallback = std::function<void(PlaybackState state, const std::string &error)>;

class VideoDecoder {
 public:
  virtual ~VideoDecoder() = default;

  virtual bool open(const std::string &filePath, MediaInfo *outInfo, std::string *error) = 0;
  virtual void play() = 0;
  virtual void pause() = 0;
  virtual void stop() = 0;
  virtual void restart() = 0;
  virtual void setLoop(bool enabled) = 0;
  virtual bool loop() const = 0;
  virtual PlaybackState state() const = 0;
  virtual MediaInfo info() const = 0;
  virtual void setFrameCallback(FrameCallback cb) = 0;
  virtual void setStateCallback(StateCallback cb) = 0;
  virtual void close() = 0;
};

/** Platform factory — macOS AVFoundation, Windows FFmpeg (LGPL), else stub. */
std::unique_ptr<VideoDecoder> CreatePlatformVideoDecoder();

}  // namespace neud::video
