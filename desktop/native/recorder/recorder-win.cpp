#include "recorder.h"

namespace neud::recorder {

namespace {

class WindowsDiskRecorder final : public DiskRecorder {
 public:
  bool open(const OpenParams &params, std::string *error) override {
    (void)params;
    if (error) {
      *error =
          "Windows Record to Disk encoding is not enabled yet. "
          "ProRes requires an approved LGPL/non-GPL encoder distribution; "
          "Media Foundation H.264 support is planned.";
    }
    return false;
  }
  bool appendFrame(
      const uint8_t *,
      size_t,
      int,
      int,
      int64_t,
      std::string *error) override {
    if (error) *error = "Windows disk recorder is unavailable.";
    return false;
  }
  bool finalize(std::string *error) override {
    if (error) *error = "Windows disk recorder is unavailable.";
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
       "ProRes encoding on Windows requires an approved redistributable encoder "
       "(LGPL FFmpeg encode is a separate licensing decision from decode-only).",
       "unavailable",
       "Blocked pending explicit encoder license approval."},
      {CodecId::ProRes422HQ,
       "prores-422hq-mov",
       "ProRes 422 HQ",
       false,
       false,
       "ProRes encoding on Windows requires an approved redistributable encoder.",
       "unavailable",
       "Blocked pending explicit encoder license approval."},
      {CodecId::H264,
       "h264-mp4",
       "H.264",
       false,
       false,
       "Media Foundation H.264 recording is not wired yet.",
       "Media Foundation (planned)",
       "System MF H.264 — implementation pending."},
  };
}

std::unique_ptr<DiskRecorder> CreatePlatformDiskRecorder() {
  return std::unique_ptr<DiskRecorder>(new WindowsDiskRecorder());
}

}  // namespace neud::recorder
