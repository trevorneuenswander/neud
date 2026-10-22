#pragma once

#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <vector>

namespace neud::recorder {

enum class CodecId : int {
  ProRes4444 = 0,
  ProRes422HQ = 1,
  H264 = 2,
};

struct CodecAvailability {
  CodecId codec;
  std::string id;
  std::string label;
  bool supportsAlpha;
  bool available;
  std::string reason;
  std::string encoder;
  std::string licenseNote;
};

struct OpenParams {
  std::string filePath;
  int width = 1920;
  int height = 1080;
  CodecId codec = CodecId::ProRes4444;
  int fpsNumerator = 30000;
  int fpsDenominator = 1001;
  bool preserveAlpha = true;
  uint8_t backgroundR = 0;
  uint8_t backgroundG = 0;
  uint8_t backgroundB = 0;
};

class DiskRecorder {
 public:
  virtual ~DiskRecorder() = default;
  virtual bool open(const OpenParams &params, std::string *error) = 0;
  virtual bool appendFrame(
      const uint8_t *bgra,
      size_t byteLength,
      int width,
      int height,
      int64_t ptsUs,
      std::string *error) = 0;
  virtual bool finalize(std::string *error) = 0;
  virtual void close() = 0;
  virtual int64_t encodedFrames() const = 0;
  virtual int64_t droppedFrames() const = 0;
};

std::vector<CodecAvailability> ListCodecAvailability();
std::unique_ptr<DiskRecorder> CreatePlatformDiskRecorder();

}  // namespace neud::recorder
