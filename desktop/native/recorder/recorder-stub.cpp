#include "recorder.h"

#if !defined(NEUD_RECORDER_HAS_PLATFORM)

namespace neud::recorder {

namespace {

class StubDiskRecorder final : public DiskRecorder {
 public:
  bool open(const OpenParams &, std::string *error) override {
    if (error) *error = "Disk recording is unavailable on this platform.";
    return false;
  }
  bool appendFrame(
      const uint8_t *,
      size_t,
      int,
      int,
      int64_t,
      std::string *error) override {
    if (error) *error = "Disk recording is unavailable on this platform.";
    return false;
  }
  bool finalize(std::string *error) override {
    if (error) *error = "Disk recording is unavailable on this platform.";
    return false;
  }
  void close() override {}
  int64_t encodedFrames() const override { return 0; }
  int64_t droppedFrames() const override { return 0; }
};

}  // namespace

std::vector<CodecAvailability> ListCodecAvailability() {
  return {
      {CodecId::ProRes4444,
       "prores-4444-mov",
       "ProRes 4444",
       true,
       false,
       "Unsupported platform.",
       "none",
       "No recorder backend."},
      {CodecId::ProRes422HQ,
       "prores-422hq-mov",
       "ProRes 422 HQ",
       false,
       false,
       "Unsupported platform.",
       "none",
       "No recorder backend."},
      {CodecId::H264,
       "h264-mp4",
       "H.264",
       false,
       false,
       "Unsupported platform.",
       "none",
       "No recorder backend."},
  };
}

std::unique_ptr<DiskRecorder> CreatePlatformDiskRecorder() {
  return std::unique_ptr<DiskRecorder>(new StubDiskRecorder());
}

}  // namespace neud::recorder

#endif
