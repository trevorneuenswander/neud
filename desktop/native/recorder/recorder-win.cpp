/**
 * Windows Record to Disk — H.264 MP4 via Media Foundation Sink Writer.
 * ProRes encode remains unavailable (separate licensing decision).
 */

#include "recorder.h"

#if defined(_WIN32)

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <mferror.h>
#include <codecapi.h>
#include <wmcodecdsp.h>

#include <atomic>
#include <cmath>
#include <cstring>
#include <mutex>
#include <string>
#include <vector>

#pragma comment(lib, "mfplat.lib")
#pragma comment(lib, "mfreadwrite.lib")
#pragma comment(lib, "mfuuid.lib")
#pragma comment(lib, "Ole32.lib")

namespace neud::recorder {
namespace {

std::wstring Utf8ToWide(const std::string &utf8) {
  if (utf8.empty()) return L"";
  const int size = MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), -1, nullptr, 0);
  if (size <= 0) return L"";
  std::wstring wide(static_cast<size_t>(size - 1), L'\0');
  MultiByteToWideChar(CP_UTF8, 0, utf8.c_str(), -1, wide.data(), size);
  return wide;
}

void FlattenBgraToBgrx(
    const uint8_t *bgra,
    size_t byteLength,
    int width,
    int height,
    uint8_t backgroundR,
    uint8_t backgroundG,
    uint8_t backgroundB,
    std::vector<uint8_t> *out) {
  const size_t expected = static_cast<size_t>(width) * static_cast<size_t>(height) * 4u;
  out->assign(expected, 0);
  if (!bgra || byteLength < expected) return;
  for (size_t i = 0; i + 3 < expected; i += 4) {
    const uint8_t b = bgra[i];
    const uint8_t g = bgra[i + 1];
    const uint8_t r = bgra[i + 2];
    const uint8_t a = bgra[i + 3];
    if (a >= 255) {
      (*out)[i] = b;
      (*out)[i + 1] = g;
      (*out)[i + 2] = r;
      (*out)[i + 3] = 255;
    } else if (a == 0) {
      (*out)[i] = backgroundB;
      (*out)[i + 1] = backgroundG;
      (*out)[i + 2] = backgroundR;
      (*out)[i + 3] = 255;
    } else {
      const float af = a / 255.0f;
      const float inv = 1.0f - af;
      (*out)[i] = static_cast<uint8_t>(std::lround(b * af + backgroundB * inv));
      (*out)[i + 1] = static_cast<uint8_t>(std::lround(g * af + backgroundG * inv));
      (*out)[i + 2] = static_cast<uint8_t>(std::lround(r * af + backgroundR * inv));
      (*out)[i + 3] = 255;
    }
  }
}

class MediaFoundationH264Recorder final : public DiskRecorder {
 public:
  ~MediaFoundationH264Recorder() override { close(); }

  bool open(const OpenParams &params, std::string *error) override {
    close();
    if (params.codec != CodecId::H264) {
      if (error) {
        *error =
            "ProRes encoding on Windows requires an approved redistributable encoder "
            "(LGPL FFmpeg encode is a separate licensing decision from decode-only).";
      }
      return false;
    }
    if (params.width < 16 || params.height < 16 || (params.width % 2) || (params.height % 2)) {
      if (error) *error = "H.264 recording requires even dimensions of at least 16×16.";
      return false;
    }

    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    const bool coInitHere = SUCCEEDED(hr) || hr == S_FALSE || hr == RPC_E_CHANGED_MODE;
    if (FAILED(hr) && hr != RPC_E_CHANGED_MODE) {
      if (error) *error = "Unable to initialize COM for Media Foundation.";
      return false;
    }
    comInitialized_ = (hr == S_OK);

    hr = MFStartup(MF_VERSION, MFSTARTUP_FULL);
    if (FAILED(hr)) {
      if (error) *error = "Media Foundation startup failed.";
      teardownCom();
      return false;
    }
    mfStarted_ = true;

    const std::wstring path = Utf8ToWide(params.filePath);
    if (path.empty()) {
      if (error) *error = "Invalid destination path.";
      close();
      return false;
    }

    IMFSinkWriter *writer = nullptr;
    hr = MFCreateSinkWriterFromURL(path.c_str(), nullptr, nullptr, &writer);
    if (FAILED(hr) || !writer) {
      if (error) *error = "Unable to create Media Foundation sink writer for MP4.";
      close();
      return false;
    }

    IMFMediaType *outType = nullptr;
    hr = MFCreateMediaType(&outType);
    if (FAILED(hr) || !outType) {
      writer->Release();
      if (error) *error = "Unable to create H.264 output media type.";
      close();
      return false;
    }
    outType->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
    outType->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_H264);
    outType->SetUINT32(MF_MT_AVG_BITRATE, static_cast<UINT32>(params.width * params.height * 4));
    outType->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
    MFSetAttributeSize(outType, MF_MT_FRAME_SIZE, params.width, params.height);
    MFSetAttributeRatio(
        outType,
        MF_MT_FRAME_RATE,
        static_cast<UINT32>(params.fpsNumerator),
        static_cast<UINT32>(std::max(1, params.fpsDenominator)));
    MFSetAttributeRatio(outType, MF_MT_PIXEL_ASPECT_RATIO, 1, 1);

    DWORD streamIndex = 0;
    hr = writer->AddStream(outType, &streamIndex);
    outType->Release();
    if (FAILED(hr)) {
      writer->Release();
      if (error) *error = "Unable to add H.264 stream to sink writer.";
      close();
      return false;
    }

    IMFMediaType *inType = nullptr;
    hr = MFCreateMediaType(&inType);
    if (FAILED(hr) || !inType) {
      writer->Release();
      if (error) *error = "Unable to create input media type.";
      close();
      return false;
    }
    inType->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
    inType->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_RGB32);
    inType->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
    MFSetAttributeSize(inType, MF_MT_FRAME_SIZE, params.width, params.height);
    MFSetAttributeRatio(
        inType,
        MF_MT_FRAME_RATE,
        static_cast<UINT32>(params.fpsNumerator),
        static_cast<UINT32>(std::max(1, params.fpsDenominator)));
    MFSetAttributeRatio(inType, MF_MT_PIXEL_ASPECT_RATIO, 1, 1);
    inType->SetUINT32(MF_MT_DEFAULT_STRIDE, params.width * 4);

    hr = writer->SetInputMediaType(streamIndex, inType, nullptr);
    inType->Release();
    if (FAILED(hr)) {
      writer->Release();
      if (error) *error = "Unable to set RGB32 input type for H.264 encoding.";
      close();
      return false;
    }

    hr = writer->BeginWriting();
    if (FAILED(hr)) {
      writer->Release();
      if (error) *error = "Media Foundation BeginWriting failed.";
      close();
      return false;
    }

    writer_ = writer;
    streamIndex_ = streamIndex;
    width_ = params.width;
    height_ = params.height;
    fpsNum_ = params.fpsNumerator;
    fpsDen_ = std::max(1, params.fpsDenominator);
    backgroundR_ = params.backgroundR;
    backgroundG_ = params.backgroundG;
    backgroundB_ = params.backgroundB;
    frameDurationHns_ = static_cast<LONGLONG>(
        (10000000.0 * static_cast<double>(fpsDen_)) / static_cast<double>(std::max(1, fpsNum_)));
    encodedFrames_ = 0;
    droppedFrames_ = 0;
    nextPtsHns_ = 0;
    opened_ = true;
    (void)coInitHere;
    return true;
  }

  bool appendFrame(
      const uint8_t *bgra,
      size_t byteLength,
      int width,
      int height,
      int64_t ptsUs,
      std::string *error) override {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!opened_ || !writer_) {
      if (error) *error = "Windows disk recorder is not open.";
      return false;
    }
    if (width != width_ || height != height_) {
      droppedFrames_++;
      if (error) *error = "Frame dimensions do not match the open recording session.";
      return false;
    }

    FlattenBgraToBgrx(
        bgra, byteLength, width, height, backgroundR_, backgroundG_, backgroundB_, &scratch_);

    // MF RGB32 expects bottom-up DIBs for some pipelines; reverse rows for top-down BGRA source.
    const int stride = width * 4;
    std::vector<uint8_t> bottomUp(scratch_.size());
    for (int y = 0; y < height; ++y) {
      const uint8_t *src = scratch_.data() + static_cast<size_t>(y) * stride;
      uint8_t *dst = bottomUp.data() + static_cast<size_t>(height - 1 - y) * stride;
      memcpy(dst, src, static_cast<size_t>(stride));
    }

    IMFMediaBuffer *buffer = nullptr;
    HRESULT hr = MFCreateMemoryBuffer(static_cast<DWORD>(bottomUp.size()), &buffer);
    if (FAILED(hr) || !buffer) {
      droppedFrames_++;
      if (error) *error = "Unable to allocate Media Foundation frame buffer.";
      return false;
    }
    BYTE *data = nullptr;
    hr = buffer->Lock(&data, nullptr, nullptr);
    if (FAILED(hr) || !data) {
      buffer->Release();
      droppedFrames_++;
      if (error) *error = "Unable to lock Media Foundation frame buffer.";
      return false;
    }
    memcpy(data, bottomUp.data(), bottomUp.size());
    buffer->Unlock();
    buffer->SetCurrentLength(static_cast<DWORD>(bottomUp.size()));

    IMFSample *sample = nullptr;
    hr = MFCreateSample(&sample);
    if (FAILED(hr) || !sample) {
      buffer->Release();
      droppedFrames_++;
      if (error) *error = "Unable to create Media Foundation sample.";
      return false;
    }
    sample->AddBuffer(buffer);
    buffer->Release();

    LONGLONG ptsHns =
        ptsUs > 0 ? static_cast<LONGLONG>(ptsUs * 10) : nextPtsHns_;
    sample->SetSampleTime(ptsHns);
    sample->SetSampleDuration(frameDurationHns_);

    hr = writer_->WriteSample(streamIndex_, sample);
    sample->Release();
    if (FAILED(hr)) {
      droppedFrames_++;
      if (error) *error = "Media Foundation WriteSample failed.";
      return false;
    }

    nextPtsHns_ = ptsHns + frameDurationHns_;
    encodedFrames_++;
    return true;
  }

  bool finalize(std::string *error) override {
    std::lock_guard<std::mutex> lock(mutex_);
    if (!opened_ || !writer_) {
      if (error) *error = "Windows disk recorder is not open.";
      return false;
    }
    const HRESULT hr = writer_->Finalize();
    if (FAILED(hr)) {
      if (error) *error = "Media Foundation Finalize failed; recording file may be incomplete.";
      return false;
    }
    writer_->Release();
    writer_ = nullptr;
    opened_ = false;
    teardownMf();
    teardownCom();
    return true;
  }

  void close() override {
    std::lock_guard<std::mutex> lock(mutex_);
    if (writer_) {
      writer_->Release();
      writer_ = nullptr;
    }
    opened_ = false;
    teardownMf();
    teardownCom();
  }

  int64_t encodedFrames() const override { return encodedFrames_.load(); }
  int64_t droppedFrames() const override { return droppedFrames_.load(); }

 private:
  void teardownMf() {
    if (mfStarted_) {
      MFShutdown();
      mfStarted_ = false;
    }
  }

  void teardownCom() {
    if (comInitialized_) {
      CoUninitialize();
      comInitialized_ = false;
    }
  }

  std::mutex mutex_;
  IMFSinkWriter *writer_ = nullptr;
  DWORD streamIndex_ = 0;
  bool opened_ = false;
  bool mfStarted_ = false;
  bool comInitialized_ = false;
  int width_ = 0;
  int height_ = 0;
  int fpsNum_ = 30000;
  int fpsDen_ = 1001;
  uint8_t backgroundR_ = 0;
  uint8_t backgroundG_ = 0;
  uint8_t backgroundB_ = 0;
  LONGLONG frameDurationHns_ = 333667;
  LONGLONG nextPtsHns_ = 0;
  std::atomic<int64_t> encodedFrames_{0};
  std::atomic<int64_t> droppedFrames_{0};
  std::vector<uint8_t> scratch_;
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
       true,
       "",
       "Media Foundation",
       "System Media Foundation H.264 encoder (no FFmpeg redistribute)."},
  };
}

std::unique_ptr<DiskRecorder> CreatePlatformDiskRecorder() {
  return std::unique_ptr<DiskRecorder>(new MediaFoundationH264Recorder());
}

}  // namespace neud::recorder

#endif  // _WIN32
