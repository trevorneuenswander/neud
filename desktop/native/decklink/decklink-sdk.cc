#include "decklink-api.h"

#include "DeckLinkAPI.h"
#include "DeckLinkAPIVersion.h"

#if defined(__APPLE__)
#include <CoreFoundation/CFPlugInCOM.h>
#include <CoreFoundation/CoreFoundation.h>
#else
#include <Windows.h>
#include <oleauto.h>
#include "decklink-dispatch-win.h"
#endif

#if defined(_WIN32)
using DeckLinkBool = BOOL;
static constexpr DeckLinkBool kDeckLinkFalse = FALSE;
static constexpr DeckLinkBool kDeckLinkTrue = TRUE;
#else
using DeckLinkBool = bool;
static constexpr DeckLinkBool kDeckLinkFalse = false;
static constexpr DeckLinkBool kDeckLinkTrue = true;
#endif

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstring>
#include <mutex>
#include <sstream>
#include <string>
#include <vector>

// SDK 16.0 signatures used here (Mac/include):
//   IDeckLink::GetModelName(CFStringRef*)
//   IDeckLinkDisplayMode::GetName(CFStringRef*)
//   IDeckLinkOutput::DoesSupportVideoMode(..., BMDPixelFormat, ..., bool* supported)
//   frame->QueryInterface(IID_IDeckLinkVideoBuffer) -> StartAccess / GetBytes / EndAccess
//   REFIID is CFUUIDBytes; compare with memcmp via operator==
//   IID_IUnknown = CFUUIDGetUUIDBytes(IUnknownUUID)

#if defined(__APPLE__)
#define NEUD_IID_IUNKNOWN CFUUIDGetUUIDBytes(IUnknownUUID)

bool operator==(const REFIID& lhs, const REFIID& rhs) {
  return std::memcmp(&lhs, &rhs, sizeof(REFIID)) == 0;
}
#endif

namespace {

std::mutex gStateLock;
std::vector<uint8_t> gLatestBgra;
// DeckLink mode raster (ScheduleVideoFrame dimensions). Never overwritten by Chromium paint size.
int gModeWidth = 0;
int gModeHeight = 0;
int gRowBytes = 0;
int gRendererWidth = 0;
int gRendererHeight = 0;
IDeckLink* gDevice = nullptr;
IDeckLinkOutput* gOutput = nullptr;
IDeckLinkKeyer* gKeyer = nullptr;
IDeckLinkDisplayMode* gMode = nullptr;
bool gExternalKeying = false;
uint8_t gKeyerLevel = 255;
bool gKeyerEnabled = false;
BMDTimeValue gFrameDuration = 0;
BMDTimeScale gTimeScale = 0;
BMDTimeValue gNextStreamTime = 0;
std::atomic<int64_t> gScheduled{0};
std::atomic<int64_t> gCompleted{0};
std::atomic<int64_t> gDropped{0};
std::atomic<int64_t> gLate{0};
std::atomic<int64_t> gUnderruns{0};
std::atomic<int> gQueue{0};
bool gPlaying = false;
std::string gNativeError;
std::string gLastCompletionResult;
std::string gDeviceModel;
std::string gPersistentId;
std::string gDisplayModeId;
std::string gDisplayModeName;
int64_t gEndpointIndex = 0;
int64_t gPlaybackStartedAtMs = 0;
// Keep SDK-created frames alive for the output session (Create → Schedule → Completed recycle).
std::vector<IDeckLinkMutableVideoFrame*> gOwnedFrames;
std::string gLastScheduleDiagnostic;

void ResetCountersLocked() {
  gScheduled = 0;
  gCompleted = 0;
  gDropped = 0;
  gLate = 0;
  gUnderruns = 0;
  gQueue = 0;
  gNextStreamTime = 0;
  gNativeError.clear();
  gLastCompletionResult.clear();
  gPlaybackStartedAtMs = 0;
  gLastScheduleDiagnostic.clear();
}

void ReleaseOwnedFramesLocked() {
  for (IDeckLinkMutableVideoFrame* frame : gOwnedFrames) {
    if (frame) frame->Release();
  }
  gOwnedFrames.clear();
}

void ReleaseKeyerLocked() {
  if (gKeyer) {
    gKeyer->Disable();
    gKeyer->Release();
    gKeyer = nullptr;
  }
  gKeyerEnabled = false;
  gExternalKeying = false;
  gKeyerLevel = 255;
}

void ReleaseOutputLocked() {
  if (gOutput && gPlaying) {
    gOutput->StopScheduledPlayback(0, nullptr, 0);
    gOutput->SetScheduledFrameCompletionCallback(nullptr);
    gOutput->DisableVideoOutput();
  } else if (gOutput) {
    gOutput->SetScheduledFrameCompletionCallback(nullptr);
    gOutput->DisableVideoOutput();
  }
  gPlaying = false;
  ReleaseOwnedFramesLocked();
  ReleaseKeyerLocked();
  if (gMode) {
    gMode->Release();
    gMode = nullptr;
  }
  if (gOutput) {
    gOutput->Release();
    gOutput = nullptr;
  }
  if (gDevice) {
    gDevice->Release();
    gDevice = nullptr;
  }
  gQueue = 0;
  gDeviceModel.clear();
  gPersistentId.clear();
  gDisplayModeId.clear();
  gDisplayModeName.clear();
  gEndpointIndex = 0;
  gFrameDuration = 0;
  gTimeScale = 0;
  gRowBytes = 0;
  gModeWidth = 0;
  gModeHeight = 0;
}

#if defined(__APPLE__)
std::string CfStringToUtf8(CFStringRef value) {
  if (!value) return "";
  CFIndex length = CFStringGetLength(value);
  CFIndex maxSize = CFStringGetMaximumSizeForEncoding(length, kCFStringEncodingUTF8) + 1;
  if (maxSize < 1) return "";
  std::string buffer(static_cast<size_t>(maxSize), '\0');
  if (!CFStringGetCString(value, buffer.data(), maxSize, kCFStringEncodingUTF8)) {
    return "";
  }
  buffer.resize(std::strlen(buffer.c_str()));
  return buffer;
}

std::string TakeCfString(CFStringRef value) {
  std::string utf8 = CfStringToUtf8(value);
  if (value) CFRelease(value);
  return utf8;
}
#endif

std::string Escape(const std::string& value) {
  std::string out;
  for (char character : value) {
    if (character == '\\' || character == '"') out.push_back('\\');
    out.push_back(character);
  }
  return out;
}

std::string ModeId(BMDDisplayMode mode) {
  std::ostringstream stream;
  stream << static_cast<uint32_t>(mode);
  return stream.str();
}

std::string HResultName(HRESULT hr) {
  if (hr == S_OK) return "S_OK";
  if (hr == S_FALSE) return "S_FALSE";
  if (hr == E_FAIL) return "E_FAIL";
  if (hr == E_ACCESSDENIED) return "E_ACCESSDENIED";
  if (hr == E_INVALIDARG) return "E_INVALIDARG";
  if (hr == E_OUTOFMEMORY) return "E_OUTOFMEMORY";
  if (hr == E_POINTER) return "E_POINTER";
  if (hr == E_NOTIMPL) return "E_NOTIMPL";
  if (hr == E_NOINTERFACE) return "E_NOINTERFACE";
  return "OTHER";
}

std::string HResultHex(HRESULT hr) {
  std::ostringstream stream;
  stream << "0x";
  stream.width(8);
  stream.fill('0');
  stream << std::hex << static_cast<uint32_t>(hr);
  return stream.str();
}

std::string FailJson(const char* code, const char* error, const char* stage, const char* method = nullptr,
                     HRESULT hr = S_OK, const std::string& extraJson = "") {
  std::ostringstream json;
  json << "{\"ok\":false,\"code\":\"" << code << "\",\"error\":\"" << Escape(error)
       << "\",\"stage\":\"" << Escape(stage) << "\"";
  if (method && method[0] != '\0') {
    json << ",\"method\":\"" << Escape(method) << "\"";
    json << ",\"hresult\":" << static_cast<int32_t>(hr);
    json << ",\"hresultHex\":\"" << HResultHex(hr) << "\"";
    json << ",\"hresultName\":\"" << HResultName(hr) << "\"";
    json << ",\"nativeError\":\"" << Escape(method) << " " << HResultName(hr) << " " << HResultHex(hr) << "\"";
  }
  if (!extraJson.empty()) {
    json << "," << extraJson;
  }
  json << "}";
  return json.str();
}

std::string OperatorErrorForSchedule(HRESULT hr) {
  if (hr == E_ACCESSDENIED) return "DeckLink video output is not enabled.";
  if (hr == E_INVALIDARG) return "DeckLink rejected the scheduled frame attributes.";
  if (hr == E_OUTOFMEMORY) return "DeckLink scheduled frame queue is full.";
  return "Scheduled playback failed";
}

std::string DeviceModelName(IDeckLink* device) {
#if defined(__APPLE__)
  CFStringRef cfName = nullptr;
  if (device->GetModelName(&cfName) == S_OK) {
    return TakeCfString(cfName);
  }
  return "";
#else
  BSTR modelBstr = nullptr;
  std::string modelName;
  if (device->GetModelName(&modelBstr) == S_OK && modelBstr) {
    int length = WideCharToMultiByte(CP_UTF8, 0, modelBstr, -1, nullptr, 0, nullptr, nullptr);
    if (length > 1) {
      modelName.resize(static_cast<size_t>(length - 1));
      WideCharToMultiByte(CP_UTF8, 0, modelBstr, -1, modelName.data(), length, nullptr, nullptr);
    }
    SysFreeString(modelBstr);
  }
  return modelName;
#endif
}

std::string DisplayModeName(IDeckLinkDisplayMode* mode) {
#if defined(__APPLE__)
  CFStringRef cfModeName = nullptr;
  if (mode->GetName(&cfModeName) == S_OK) {
    return TakeCfString(cfModeName);
  }
  return "";
#else
  BSTR modeBstr = nullptr;
  std::string modeName;
  if (mode->GetName(&modeBstr) == S_OK && modeBstr) {
    int length = WideCharToMultiByte(CP_UTF8, 0, modeBstr, -1, nullptr, 0, nullptr, nullptr);
    if (length > 1) {
      modeName.resize(static_cast<size_t>(length - 1));
      WideCharToMultiByte(CP_UTF8, 0, modeBstr, -1, modeName.data(), length, nullptr, nullptr);
    }
    SysFreeString(modeBstr);
  }
  return modeName;
#endif
}

std::string CompletionResultName(BMDOutputFrameCompletionResult result) {
  switch (result) {
    case bmdOutputFrameCompleted:
      return "completed";
    case bmdOutputFrameDisplayedLate:
      return "displayed-late";
    case bmdOutputFrameDropped:
      return "dropped";
    case bmdOutputFrameFlushed:
      return "flushed";
    default:
      return "unknown";
  }
}

bool ModeSupportsPixelFormat(IDeckLinkOutput* output, BMDDisplayMode mode, BMDPixelFormat pixelFormat) {
  DeckLinkBool supported = kDeckLinkFalse;
  HRESULT hr = output->DoesSupportVideoMode(
      bmdVideoConnectionUnspecified,
      mode,
      pixelFormat,
      bmdNoVideoOutputConversion,
      bmdSupportedVideoModeDefault,
      nullptr,
      &supported);
  return hr == S_OK && supported == kDeckLinkTrue;
}

bool ModeSupportsBgra(IDeckLinkOutput* output, BMDDisplayMode mode) {
  return ModeSupportsPixelFormat(output, mode, bmdFormat8BitBGRA);
}

bool ModeSupportsKeyingFlag(IDeckLinkOutput* output, BMDDisplayMode mode, BMDPixelFormat pixelFormat) {
  DeckLinkBool supported = kDeckLinkFalse;
  HRESULT hr = output->DoesSupportVideoMode(
      bmdVideoConnectionUnspecified,
      mode,
      pixelFormat,
      bmdNoVideoOutputConversion,
      bmdSupportedVideoModeKeying,
      nullptr,
      &supported);
  return hr == S_OK && supported == kDeckLinkTrue;
}

bool AttrFlag(IDeckLinkProfileAttributes* attributes, BMDDeckLinkAttributeID id) {
  if (!attributes) return false;
  DeckLinkBool value = kDeckLinkFalse;
  return attributes->GetFlag(id, &value) == S_OK && value == kDeckLinkTrue;
}

int64_t AttrInt(IDeckLinkProfileAttributes* attributes, BMDDeckLinkAttributeID id) {
  if (!attributes) return 0;
  int64_t value = 0;
  if (attributes->GetInt(id, &value) != S_OK) return 0;
  return value;
}

// Chromium offscreen paint is premultiplied BGRA. Over opaque black:
//   Cout = Cpremul; Aout = 255. Do not multiply RGB by alpha again.
inline void WritePremultipliedOverBlackPixel(const uint8_t* srcPixel, uint8_t* dstPixel) {
  const uint8_t alpha = srcPixel[3];
  if (alpha == 0) {
    dstPixel[0] = 0;
    dstPixel[1] = 0;
    dstPixel[2] = 0;
    dstPixel[3] = 255;
    return;
  }
  dstPixel[0] = srcPixel[0];
  dstPixel[1] = srcPixel[1];
  dstPixel[2] = srcPixel[2];
  dstPixel[3] = 255;
}

// DeckLink KeyerOutput sample feeds QImage::Format_ARGB32 (straight alpha) as BGRA.
// Convert Chromium premul → straight for IDeckLinkKeyer external keying; preserve A.
inline void WriteStraightFromPremultipliedPixel(const uint8_t* srcPixel, uint8_t* dstPixel) {
  const uint8_t alpha = srcPixel[3];
  if (alpha == 0) {
    dstPixel[0] = 0;
    dstPixel[1] = 0;
    dstPixel[2] = 0;
    dstPixel[3] = 0;
    return;
  }
  if (alpha == 255) {
    dstPixel[0] = srcPixel[0];
    dstPixel[1] = srcPixel[1];
    dstPixel[2] = srcPixel[2];
    dstPixel[3] = 255;
    return;
  }
  dstPixel[0] = static_cast<uint8_t>(std::min(255, (static_cast<int>(srcPixel[0]) * 255 + alpha / 2) / alpha));
  dstPixel[1] = static_cast<uint8_t>(std::min(255, (static_cast<int>(srcPixel[1]) * 255 + alpha / 2) / alpha));
  dstPixel[2] = static_cast<uint8_t>(std::min(255, (static_cast<int>(srcPixel[2]) * 255 + alpha / 2) / alpha));
  dstPixel[3] = alpha;
}

void FitKeyFillStraightFromPremul(
    const uint8_t* src,
    int srcWidth,
    int srcHeight,
    uint8_t* dst,
    int dstWidth,
    int dstHeight,
    int dstRowBytes) {
  // Transparent letterbox (A=0) so Key SDI stays black outside the graphic.
  std::memset(dst, 0, static_cast<size_t>(dstRowBytes) * static_cast<size_t>(dstHeight));
  if (!src || srcWidth < 1 || srcHeight < 1 || dstWidth < 1 || dstHeight < 1) return;

  const int srcRowBytes = srcWidth * 4;
  if (srcWidth == dstWidth && srcHeight == dstHeight) {
    for (int row = 0; row < dstHeight; row += 1) {
      const uint8_t* srcLine = src + static_cast<size_t>(row) * static_cast<size_t>(srcRowBytes);
      uint8_t* dstLine = dst + static_cast<size_t>(row) * static_cast<size_t>(dstRowBytes);
      for (int column = 0; column < dstWidth; column += 1) {
        const size_t index = static_cast<size_t>(column) * 4;
        WriteStraightFromPremultipliedPixel(srcLine + index, dstLine + index);
      }
    }
    return;
  }

  const double scale = std::min(static_cast<double>(dstWidth) / static_cast<double>(srcWidth),
                                static_cast<double>(dstHeight) / static_cast<double>(srcHeight));
  const int fittedWidth = std::max(1, static_cast<int>(srcWidth * scale + 0.5));
  const int fittedHeight = std::max(1, static_cast<int>(srcHeight * scale + 0.5));
  const int offsetX = (dstWidth - fittedWidth) / 2;
  const int offsetY = (dstHeight - fittedHeight) / 2;

  for (int row = 0; row < fittedHeight; row += 1) {
    const double srcY = (static_cast<double>(row) + 0.5) * static_cast<double>(srcHeight) /
                            static_cast<double>(fittedHeight) -
                        0.5;
    const int y0 = std::max(0, std::min(srcHeight - 1, static_cast<int>(std::floor(srcY))));
    const int y1 = std::max(0, std::min(srcHeight - 1, y0 + 1));
    const double fy = srcY - y0;
    uint8_t* dstLine = dst + static_cast<size_t>(offsetY + row) * static_cast<size_t>(dstRowBytes) +
                       static_cast<size_t>(offsetX) * 4;
    for (int column = 0; column < fittedWidth; column += 1) {
      const double srcX = (static_cast<double>(column) + 0.5) * static_cast<double>(srcWidth) /
                              static_cast<double>(fittedWidth) -
                          0.5;
      const int x0 = std::max(0, std::min(srcWidth - 1, static_cast<int>(std::floor(srcX))));
      const int x1 = std::max(0, std::min(srcWidth - 1, x0 + 1));
      const double fx = srcX - x0;
      const size_t dstIndex = static_cast<size_t>(column) * 4;
      uint8_t sampled[4];
      for (int channel = 0; channel < 4; channel += 1) {
        const double v00 = src[static_cast<size_t>(y0) * static_cast<size_t>(srcRowBytes) +
                               static_cast<size_t>(x0) * 4 + static_cast<size_t>(channel)];
        const double v10 = src[static_cast<size_t>(y0) * static_cast<size_t>(srcRowBytes) +
                               static_cast<size_t>(x1) * 4 + static_cast<size_t>(channel)];
        const double v01 = src[static_cast<size_t>(y1) * static_cast<size_t>(srcRowBytes) +
                               static_cast<size_t>(x0) * 4 + static_cast<size_t>(channel)];
        const double v11 = src[static_cast<size_t>(y1) * static_cast<size_t>(srcRowBytes) +
                               static_cast<size_t>(x1) * 4 + static_cast<size_t>(channel)];
        const double value =
            v00 * (1.0 - fx) * (1.0 - fy) + v10 * fx * (1.0 - fy) + v01 * (1.0 - fx) * fy + v11 * fx * fy;
        sampled[channel] = static_cast<uint8_t>(std::max(0.0, std::min(255.0, value + 0.5)));
      }
      WriteStraightFromPremultipliedPixel(sampled, dstLine + dstIndex);
    }
  }
}

void FitCompositeFill(
    const uint8_t* src,
    int srcWidth,
    int srcHeight,
    uint8_t* dst,
    int dstWidth,
    int dstHeight,
    int dstRowBytes) {
  // Opaque black letterbox/pillarbox (Fill-only SDI expects opaque frames).
  for (int row = 0; row < dstHeight; row += 1) {
    uint8_t* dstLine = dst + static_cast<size_t>(row) * static_cast<size_t>(dstRowBytes);
    for (int column = 0; column < dstWidth; column += 1) {
      const size_t index = static_cast<size_t>(column) * 4;
      dstLine[index] = 0;
      dstLine[index + 1] = 0;
      dstLine[index + 2] = 0;
      dstLine[index + 3] = 255;
    }
  }
  if (!src || srcWidth < 1 || srcHeight < 1 || dstWidth < 1 || dstHeight < 1) return;

  const int srcRowBytes = srcWidth * 4;
  // 1:1 path — preferred when Chromium already painted at the DeckLink target raster.
  if (srcWidth == dstWidth && srcHeight == dstHeight) {
    for (int row = 0; row < dstHeight; row += 1) {
      const uint8_t* srcLine = src + static_cast<size_t>(row) * static_cast<size_t>(srcRowBytes);
      uint8_t* dstLine = dst + static_cast<size_t>(row) * static_cast<size_t>(dstRowBytes);
      for (int column = 0; column < dstWidth; column += 1) {
        const size_t index = static_cast<size_t>(column) * 4;
        WritePremultipliedOverBlackPixel(srcLine + index, dstLine + index);
      }
    }
    return;
  }

  // Contain-fit fallback (letterbox/pillarbox over black) with bilinear sampling.
  const double scale = std::min(static_cast<double>(dstWidth) / static_cast<double>(srcWidth),
                                static_cast<double>(dstHeight) / static_cast<double>(srcHeight));
  const int fittedWidth = std::max(1, static_cast<int>(srcWidth * scale + 0.5));
  const int fittedHeight = std::max(1, static_cast<int>(srcHeight * scale + 0.5));
  const int offsetX = (dstWidth - fittedWidth) / 2;
  const int offsetY = (dstHeight - fittedHeight) / 2;

  for (int row = 0; row < fittedHeight; row += 1) {
    const double srcY = (static_cast<double>(row) + 0.5) * static_cast<double>(srcHeight) /
                            static_cast<double>(fittedHeight) -
                        0.5;
    const int y0 = std::max(0, std::min(srcHeight - 1, static_cast<int>(std::floor(srcY))));
    const int y1 = std::max(0, std::min(srcHeight - 1, y0 + 1));
    const double fy = srcY - y0;
    uint8_t* dstLine = dst + static_cast<size_t>(offsetY + row) * static_cast<size_t>(dstRowBytes) +
                       static_cast<size_t>(offsetX) * 4;
    for (int column = 0; column < fittedWidth; column += 1) {
      const double srcX = (static_cast<double>(column) + 0.5) * static_cast<double>(srcWidth) /
                              static_cast<double>(fittedWidth) -
                          0.5;
      const int x0 = std::max(0, std::min(srcWidth - 1, static_cast<int>(std::floor(srcX))));
      const int x1 = std::max(0, std::min(srcWidth - 1, x0 + 1));
      const double fx = srcX - x0;
      const size_t dstIndex = static_cast<size_t>(column) * 4;
      uint8_t sampled[4];
      for (int channel = 0; channel < 4; channel += 1) {
        const double v00 = src[static_cast<size_t>(y0) * static_cast<size_t>(srcRowBytes) +
                               static_cast<size_t>(x0) * 4 + static_cast<size_t>(channel)];
        const double v10 = src[static_cast<size_t>(y0) * static_cast<size_t>(srcRowBytes) +
                               static_cast<size_t>(x1) * 4 + static_cast<size_t>(channel)];
        const double v01 = src[static_cast<size_t>(y1) * static_cast<size_t>(srcRowBytes) +
                               static_cast<size_t>(x0) * 4 + static_cast<size_t>(channel)];
        const double v11 = src[static_cast<size_t>(y1) * static_cast<size_t>(srcRowBytes) +
                               static_cast<size_t>(x1) * 4 + static_cast<size_t>(channel)];
        const double value =
            v00 * (1.0 - fx) * (1.0 - fy) + v10 * fx * (1.0 - fy) + v01 * (1.0 - fx) * fy + v11 * fx * fy;
        sampled[channel] = static_cast<uint8_t>(std::max(0.0, std::min(255.0, value + 0.5)));
      }
      // Sampled buffer is still premultiplied; over black keep RGB, force opaque alpha.
      WritePremultipliedOverBlackPixel(sampled, dstLine + dstIndex);
    }
  }
}

struct FillAccessResult {
  bool ok = false;
  bool bufferAccessStarted = false;
  bool bufferAccessEnded = false;
  HRESULT queryHr = E_FAIL;
  HRESULT startHr = E_FAIL;
  HRESULT getBytesHr = E_FAIL;
  HRESULT endHr = S_OK;
};

FillAccessResult FillVideoFrame(IDeckLinkVideoFrame* frame) {
  FillAccessResult result;
  if (!frame) return result;
  IDeckLinkVideoBuffer* buffer = nullptr;
  result.queryHr = frame->QueryInterface(IID_IDeckLinkVideoBuffer, reinterpret_cast<void**>(&buffer));
  if (result.queryHr != S_OK || !buffer) return result;

  result.startHr = buffer->StartAccess(bmdBufferAccessWrite);
  if (result.startHr == S_OK) {
    result.bufferAccessStarted = true;
    void* bytes = nullptr;
    result.getBytesHr = buffer->GetBytes(&bytes);
    if (result.getBytesHr == S_OK && bytes) {
      const int rowBytes = static_cast<int>(frame->GetRowBytes());
      const int height = static_cast<int>(frame->GetHeight());
      const int width = static_cast<int>(frame->GetWidth());
      uint8_t* dst = static_cast<uint8_t*>(bytes);
      if (gLatestBgra.empty() || gRendererWidth < 1 || gRendererHeight < 1) {
        std::memset(dst, 0, static_cast<size_t>(rowBytes) * static_cast<size_t>(height));
      } else if (gExternalKeying) {
        // Native external keying: preserve alpha; convert premul → straight for DeckLink keyer.
        FitKeyFillStraightFromPremul(gLatestBgra.data(), gRendererWidth, gRendererHeight, dst, width, height,
                                     rowBytes);
      } else {
        FitCompositeFill(gLatestBgra.data(), gRendererWidth, gRendererHeight, dst, width, height, rowBytes);
      }
      result.ok = true;
    }
  }
  if (result.bufferAccessStarted) {
    result.endHr = buffer->EndAccess(bmdBufferAccessWrite);
    result.bufferAccessEnded = true;
  }
  buffer->Release();
  return result;
}

std::string FrameSnapshotJson(IDeckLinkVideoFrame* frame, int frameIndex, BMDTimeValue displayTime,
                              BMDTimeValue displayDuration, BMDTimeScale timeScale, bool bufferAccessStarted,
                              bool bufferAccessEnded) {
  std::ostringstream json;
  json << "\"frameIndex\":" << frameIndex << ",\"frameNonNull\":" << (frame ? "true" : "false");
  if (frame) {
    json << ",\"frameWidth\":" << frame->GetWidth() << ",\"frameHeight\":" << frame->GetHeight()
         << ",\"frameRowBytes\":" << frame->GetRowBytes() << ",\"actualFramePixelFormatEnum\":"
         << static_cast<uint32_t>(frame->GetPixelFormat()) << ",\"requestedPixelFormatEnum\":"
         << static_cast<uint32_t>(bmdFormat8BitBGRA) << ",\"frameFlags\":" << static_cast<uint32_t>(frame->GetFlags());
  }
  json << ",\"modeWidth\":" << gModeWidth << ",\"modeHeight\":" << gModeHeight << ",\"computedRowBytes\":"
       << gRowBytes << ",\"rendererWidth\":" << gRendererWidth << ",\"rendererHeight\":" << gRendererHeight
       << ",\"displayTime\":" << displayTime << ",\"displayDuration\":" << displayDuration
       << ",\"timeScale\":" << timeScale << ",\"bufferAccessStarted\":"
       << (bufferAccessStarted ? "true" : "false") << ",\"bufferAccessEnded\":"
       << (bufferAccessEnded ? "true" : "false");
  return json.str();
}

struct ScheduleResult {
  bool ok = false;
  HRESULT hr = E_FAIL;
  FillAccessResult fill;
  std::string diagnostic;
};

ScheduleResult ScheduleFilledFrame(IDeckLinkOutput* output, IDeckLinkVideoFrame* frame, int frameIndex) {
  ScheduleResult result;
  if (!output || !frame) {
    result.hr = E_POINTER;
    result.diagnostic = FrameSnapshotJson(frame, frameIndex, gNextStreamTime, gFrameDuration, gTimeScale, false, false);
    return result;
  }
  result.fill = FillVideoFrame(frame);
  if (!result.fill.ok) {
    gUnderruns += 1;
    gNativeError = "Output timing underrun";
  }
  // Buffer write access must be closed before ScheduleVideoFrame (SDK 16).
  const BMDTimeValue displayTime = gNextStreamTime;
  result.diagnostic = FrameSnapshotJson(frame, frameIndex, displayTime, gFrameDuration, gTimeScale,
                                        result.fill.bufferAccessStarted, result.fill.bufferAccessEnded);
  if (!result.fill.bufferAccessEnded && result.fill.bufferAccessStarted) {
    result.hr = E_FAIL;
    gNativeError = "DeckLink buffer write access was not ended before ScheduleVideoFrame";
    return result;
  }
  result.hr = output->ScheduleVideoFrame(frame, displayTime, gFrameDuration, gTimeScale);
  gLastScheduleDiagnostic = result.diagnostic + ",\"scheduleHresult\":" + std::to_string(static_cast<int32_t>(result.hr)) +
                            ",\"scheduleHresultHex\":\"" + HResultHex(result.hr) + "\",\"scheduleHresultName\":\"" +
                            HResultName(result.hr) + "\"";
  if (result.hr != S_OK) {
    gNativeError = OperatorErrorForSchedule(result.hr);
    return result;
  }
  gNextStreamTime += gFrameDuration;
  gScheduled += 1;
  gQueue += 1;
  result.ok = true;
  return result;
}

class DeckLinkCallback final : public IDeckLinkVideoOutputCallback {
 public:
  HRESULT ScheduledFrameCompleted(IDeckLinkVideoFrame* completedFrame, BMDOutputFrameCompletionResult result) override {
    gLastCompletionResult = CompletionResultName(result);
    if (result == bmdOutputFrameDisplayedLate) gLate += 1;
    else if (result == bmdOutputFrameDropped) gDropped += 1;
    else if (result == bmdOutputFrameCompleted) gCompleted += 1;
    if (gQueue > 0) gQueue -= 1;
    if (!gPlaying || completedFrame == nullptr) return S_OK;
    std::lock_guard<std::mutex> lock(gStateLock);
    if (!gOutput) return S_OK;
    // Never block waiting for Chromium. Reuse completed frame + latest pushed pixels.
    ScheduleResult scheduled = ScheduleFilledFrame(gOutput, completedFrame, -1);
    if (!scheduled.ok) {
      gUnderruns += 1;
      if (gNativeError.empty()) gNativeError = "Output timing underrun";
    }
    return S_OK;
  }

  HRESULT ScheduledPlaybackHasStopped() override {
    gPlaying = false;
    return S_OK;
  }

  HRESULT QueryInterface(REFIID iid, LPVOID* ppv) override {
    if (ppv == nullptr) return E_POINTER;
#if defined(__APPLE__)
    if (iid == IID_IDeckLinkVideoOutputCallback || iid == NEUD_IID_IUNKNOWN) {
#else
    if (iid == IID_IDeckLinkVideoOutputCallback || iid == IID_IUnknown) {
#endif
      *ppv = this;
      AddRef();
      return S_OK;
    }
    *ppv = nullptr;
    return E_NOINTERFACE;
  }
  ULONG AddRef() override { return ++refs_; }
  ULONG Release() override { return --refs_; }

 private:
  std::atomic<ULONG> refs_{1};
};

DeckLinkCallback gCallback;

bool SupportsPlayback(IDeckLink* device) {
  IDeckLinkProfileAttributes* attributes = nullptr;
  if (device->QueryInterface(IID_IDeckLinkProfileAttributes, reinterpret_cast<void**>(&attributes)) != S_OK) {
    return false;
  }
  int64_t support = 0;
  attributes->GetInt(BMDDeckLinkVideoIOSupport, &support);
  attributes->Release();
  return (support & bmdDeviceSupportsPlayback) != 0;
}

std::string CompiledSdkVersion() {
#ifdef BLACKMAGIC_DECKLINK_API_VERSION_STRING
  return BLACKMAGIC_DECKLINK_API_VERSION_STRING;
#else
  return "unknown";
#endif
}

std::string RuntimeSdkVersion() {
  IDeckLinkAPIInformation* info = CreateDeckLinkAPIInformationInstance();
  if (!info) return "";
  int64_t version = 0;
  HRESULT got = info->GetInt(BMDDeckLinkAPIVersion, &version);
  info->Release();
  if (got != S_OK || version == 0) return CompiledSdkVersion();
  std::ostringstream stream;
  stream << ((version >> 24) & 0xff) << "." << ((version >> 16) & 0xff) << "."
         << ((version >> 8) & 0xff);
  return stream.str();
}

std::string ComputedFpsForDisplayOnly(BMDTimeValue duration, BMDTimeScale scale) {
  if (duration <= 0 || scale <= 0) return "";
  if (scale == 60000 && duration == 1001) return "59.94";
  if (scale == 30000 && duration == 1001) return "29.97";
  if (scale == 24000 && duration == 1001) return "23.98";
  if (scale % duration == 0) {
    std::ostringstream stream;
    stream << (scale / duration);
    return stream.str();
  }
  const double fps = static_cast<double>(scale) / static_cast<double>(duration);
  std::ostringstream stream;
  stream.setf(std::ios::fixed);
  stream.precision(2);
  stream << fps;
  return stream.str();
}

}  // namespace

DeckLinkAvailability DeckLinkProbe() {
  IDeckLinkIterator* iterator = CreateDeckLinkIteratorInstance();
  if (!iterator) {
    return {
        false,
        CompiledSdkVersion(),
        // Diagnostics. Operator UI maps to EXTERNAL_DESKTOP_VIDEO_UNAVAILABLE.
        "Desktop Video runtime unavailable (CreateDeckLinkIteratorInstance failed).",
    };
  }
  iterator->Release();
  std::string runtime = RuntimeSdkVersion();
  return {true, runtime.empty() ? CompiledSdkVersion() : runtime, ""};
}

std::string DeckLinkDiscoverJson() {
  IDeckLinkIterator* iterator = CreateDeckLinkIteratorInstance();
  if (!iterator) return "[]";
  std::ostringstream json;
  json << "[";
  bool first = true;
  IDeckLink* device = nullptr;
  while (iterator->Next(&device) == S_OK) {
    if (!SupportsPlayback(device)) {
      device->Release();
      continue;
    }
    IDeckLinkProfileAttributes* attributes = nullptr;
    int64_t persistentId = 0;
    int64_t subIndex = 0;
    int64_t numberOfSubDevices = 0;
    int64_t deviceGroupId = 0;
    bool supportsInternalKeying = false;
    bool supportsExternalKeying = false;
    bool supportsDualLinkSdi = false;
    bool hasReferenceInput = false;
    bool supportsSyncPlaybackGroup = false;
    bool hasKeyerInterface = false;
    if (device->QueryInterface(IID_IDeckLinkProfileAttributes, reinterpret_cast<void**>(&attributes)) == S_OK) {
      persistentId = AttrInt(attributes, BMDDeckLinkPersistentID);
      subIndex = AttrInt(attributes, BMDDeckLinkSubDeviceIndex);
      numberOfSubDevices = AttrInt(attributes, BMDDeckLinkNumberOfSubDevices);
      deviceGroupId = AttrInt(attributes, BMDDeckLinkDeviceGroupID);
      supportsInternalKeying = AttrFlag(attributes, BMDDeckLinkSupportsInternalKeying);
      supportsExternalKeying = AttrFlag(attributes, BMDDeckLinkSupportsExternalKeying);
      supportsDualLinkSdi = AttrFlag(attributes, BMDDeckLinkSupportsDualLinkSDI);
      hasReferenceInput = AttrFlag(attributes, BMDDeckLinkHasReferenceInput);
      supportsSyncPlaybackGroup = AttrFlag(attributes, BMDDeckLinkSupportsSynchronizeToPlaybackGroup);
      attributes->Release();
    }

    IDeckLinkKeyer* keyer = nullptr;
    if (device->QueryInterface(IID_IDeckLinkKeyer, reinterpret_cast<void**>(&keyer)) == S_OK && keyer) {
      hasKeyerInterface = true;
      keyer->Release();
    }

    std::string modelName = DeviceModelName(device);

    IDeckLinkOutput* output = nullptr;
    if (device->QueryInterface(IID_IDeckLinkOutput, reinterpret_cast<void**>(&output)) != S_OK) {
      device->Release();
      continue;
    }
    IDeckLinkDisplayModeIterator* modes = nullptr;
    output->GetDisplayModeIterator(&modes);
    if (!first) json << ",";
    first = false;
    // nativeExternalKey: SupportsExternalKeying + IDeckLinkKeyer (HD Mini SDI A/B Fill+Key).
    // pairedPorts: independently scheduleable subdevices (>=2). Prefer native when available.
    const bool nativeExternalKeyCandidate = supportsExternalKeying && hasKeyerInterface;
    const bool pairedPortsCandidate = numberOfSubDevices >= 2;
    const bool physicalKeyFillCandidate = nativeExternalKeyCandidate || pairedPortsCandidate;
    json << "{\"persistentId\":\"" << persistentId << "\",\"modelName\":\"" << Escape(modelName)
         << "\",\"endpointName\":\"Output " << (subIndex + 1) << "\",\"endpointIndex\":" << subIndex
         << ",\"available\":true"
         << ",\"capabilities\":{"
         << "\"supportsInternalKeying\":" << (supportsInternalKeying ? "true" : "false")
         << ",\"supportsExternalKeying\":" << (supportsExternalKeying ? "true" : "false")
         << ",\"supportsDualLinkSdi\":" << (supportsDualLinkSdi ? "true" : "false")
         << ",\"hasReferenceInput\":" << (hasReferenceInput ? "true" : "false")
         << ",\"supportsSynchronizeToPlaybackGroup\":" << (supportsSyncPlaybackGroup ? "true" : "false")
         << ",\"hasKeyerInterface\":" << (hasKeyerInterface ? "true" : "false")
         << ",\"numberOfSubDevices\":" << numberOfSubDevices
         << ",\"deviceGroupId\":" << deviceGroupId
         << ",\"nativeExternalKeyCandidate\":" << (nativeExternalKeyCandidate ? "true" : "false")
         << ",\"pairedPortsCandidate\":" << (pairedPortsCandidate ? "true" : "false")
         << ",\"physicalKeyFillCandidate\":" << (physicalKeyFillCandidate ? "true" : "false")
         << "},\"modes\":[";
    bool firstMode = true;
    if (modes) {
      IDeckLinkDisplayMode* mode = nullptr;
      while (modes->Next(&mode) == S_OK) {
        const BMDDisplayMode displayMode = mode->GetDisplayMode();
        BMDTimeValue duration = 0;
        BMDTimeScale scale = 0;
        mode->GetFrameRate(&duration, &scale);
        BMDFieldDominance field = mode->GetFieldDominance();
        const char* fieldName = "unknown";
        bool interlaced = field != bmdProgressiveFrame && field != bmdProgressiveSegmentedFrame;
        if (field == bmdProgressiveFrame || field == bmdProgressiveSegmentedFrame) fieldName = "progressive";
        else if (field == bmdUpperFieldFirst) fieldName = "upper";
        else if (field == bmdLowerFieldFirst) fieldName = "lower";

        std::string modeName = DisplayModeName(mode);
        const bool supportsBgra = ModeSupportsBgra(output, displayMode);
        const bool supportsKeyingBgra = ModeSupportsKeyingFlag(output, displayMode, bmdFormat8BitBGRA);
        const bool supportsKeying8BitYUV = ModeSupportsKeyingFlag(output, displayMode, bmdFormat8BitYUV);
        const bool supports8BitYUV = ModeSupportsPixelFormat(output, displayMode, bmdFormat8BitYUV);
        const bool supports10BitYUV = ModeSupportsPixelFormat(output, displayMode, bmdFormat10BitYUV);
        if (!firstMode) json << ",";
        firstMode = false;
        json << "{\"id\":\"" << ModeId(displayMode) << "\",\"name\":\"" << Escape(modeName)
             << "\",\"width\":" << mode->GetWidth() << ",\"height\":" << mode->GetHeight()
             << ",\"frameRateNumerator\":" << scale << ",\"frameRateDenominator\":" << duration
             << ",\"frameDuration\":" << duration << ",\"frameTimescale\":" << scale
             << ",\"interlaced\":" << (interlaced ? "true" : "false") << ",\"fieldDominance\":\"" << fieldName
             << "\",\"pixelFormats\":[";
        bool firstPixel = true;
        if (supportsBgra) {
          json << "\"bgra8\"";
          firstPixel = false;
        }
        if (supports8BitYUV) {
          if (!firstPixel) json << ",";
          json << "\"yuv8\"";
          firstPixel = false;
        }
        if (supports10BitYUV) {
          if (!firstPixel) json << ",";
          json << "\"yuv10\"";
        }
        json << "],\"supportsKeyingBgra\":" << (supportsKeyingBgra ? "true" : "false")
             << ",\"supportsKeyingYuv8\":" << (supportsKeying8BitYUV ? "true" : "false") << "}";
        mode->Release();
      }
      modes->Release();
    }
    json << "]}";
    output->Release();
    device->Release();
  }
  iterator->Release();
  json << "]";
  return json.str();
}

std::string DeckLinkStartJson(const std::string& endpointId, const std::string& modeId, int preroll,
                              bool externalKeying) {
  std::lock_guard<std::mutex> lock(gStateLock);
  ReleaseOutputLocked();
  ResetCountersLocked();
  IDeckLinkIterator* iterator = CreateDeckLinkIteratorInstance();
  if (!iterator) {
    return FailJson("sdk-unavailable",
                    "Blackmagic DeckLink is unavailable. Install Blackmagic Desktop Video and restart NEUD.",
                    "resolve-sdk");
  }
  IDeckLink* device = nullptr;
  IDeckLinkOutput* output = nullptr;
  while (iterator->Next(&device) == S_OK) {
    IDeckLinkProfileAttributes* attributes = nullptr;
    int64_t persistentId = 0;
    int64_t subIndex = 0;
    bool supportsExternalKeying = false;
    if (device->QueryInterface(IID_IDeckLinkProfileAttributes, reinterpret_cast<void**>(&attributes)) == S_OK) {
      attributes->GetInt(BMDDeckLinkPersistentID, &persistentId);
      attributes->GetInt(BMDDeckLinkSubDeviceIndex, &subIndex);
      supportsExternalKeying = AttrFlag(attributes, BMDDeckLinkSupportsExternalKeying);
      attributes->Release();
    }
    std::ostringstream id;
    id << "decklink:" << persistentId << ":" << subIndex;
    if (id.str() != endpointId) {
      device->Release();
      continue;
    }
    if (device->QueryInterface(IID_IDeckLinkOutput, reinterpret_cast<void**>(&output)) != S_OK) {
      device->Release();
      iterator->Release();
      return FailJson("device-unavailable", "DeckLink device unavailable", "resolve-endpoint");
    }
    IDeckLinkDisplayModeIterator* modes = nullptr;
    output->GetDisplayModeIterator(&modes);
    IDeckLinkDisplayMode* selected = nullptr;
    if (modes) {
      IDeckLinkDisplayMode* mode = nullptr;
      while (modes->Next(&mode) == S_OK) {
        if (ModeId(mode->GetDisplayMode()) == modeId) {
          selected = mode;
          break;
        }
        mode->Release();
      }
      modes->Release();
    }
    if (!selected) {
      output->Release();
      device->Release();
      iterator->Release();
      return FailJson("mode-unavailable", "Configured video mode is no longer available.",
                     "resolve-display-mode");
    }

    const BMDDisplayMode selectedMode = selected->GetDisplayMode();
    // KeyerOutput sample queries modes with bmdSupportedVideoModeKeying for keying.
    const BMDSupportedVideoModeFlags supportFlags =
        externalKeying ? bmdSupportedVideoModeKeying : bmdSupportedVideoModeDefault;
    DeckLinkBool supported = kDeckLinkFalse;
    HRESULT supportHr = output->DoesSupportVideoMode(
        bmdVideoConnectionUnspecified, selectedMode, bmdFormat8BitBGRA, bmdNoVideoOutputConversion,
        supportFlags, nullptr, &supported);
    if (supportHr != S_OK || supported != kDeckLinkTrue) {
      // Fall back to default flag for devices that only advertise keying via attributes.
      if (externalKeying) {
        supportHr = output->DoesSupportVideoMode(bmdVideoConnectionUnspecified, selectedMode, bmdFormat8BitBGRA,
                                                 bmdNoVideoOutputConversion, bmdSupportedVideoModeDefault, nullptr,
                                                 &supported);
      }
    }
    if (supportHr != S_OK || supported != kDeckLinkTrue) {
      selected->Release();
      output->Release();
      device->Release();
      iterator->Release();
      return FailJson("pixel-format-unsupported",
                     "BGRA 8-bit is not supported for the selected DeckLink video mode.",
                     "query-pixel-format-support", "DoesSupportVideoMode", supportHr);
    }

    HRESULT enabled = output->EnableVideoOutput(selectedMode, bmdVideoOutputFlagDefault);
    if (enabled != S_OK) {
      selected->Release();
      output->Release();
      device->Release();
      iterator->Release();
      return FailJson("enable-failed", "Unable to enable video output", "enable-video-output",
                     "EnableVideoOutput", enabled);
    }

    // Assign output before preroll. ScheduleFilledFrame requires a live output pointer.
    gOutput = output;
    gDevice = device;
    gMode = selected;
    gExternalKeying = false;
    gKeyerEnabled = false;
    gKeyerLevel = 255;

    if (externalKeying) {
      if (!supportsExternalKeying) {
        ReleaseOutputLocked();
        iterator->Release();
        return FailJson("keyer-unsupported", "This External Device does not support native Key + Fill.",
                        "query-external-keying");
      }
      IDeckLinkKeyer* keyer = nullptr;
      HRESULT keyerQi = device->QueryInterface(IID_IDeckLinkKeyer, reinterpret_cast<void**>(&keyer));
      if (keyerQi != S_OK || !keyer) {
        ReleaseOutputLocked();
        iterator->Release();
        return FailJson("keyer-unavailable", "Unable to access the device Key + Fill interface.",
                        "query-keyer-interface", "QueryInterface(IDeckLinkKeyer)", keyerQi);
      }
      // KeyerOutput sample: EnableVideoOutput then keyer->Enable(isExternal=true) then SetLevel.
      HRESULT keyerEn = keyer->Enable(true);
      if (keyerEn != S_OK) {
        keyer->Release();
        ReleaseOutputLocked();
        iterator->Release();
        return FailJson("keyer-enable-failed", "Unable to enable Key + Fill on this device.",
                        "enable-external-keyer", "IDeckLinkKeyer::Enable", keyerEn);
      }
      // SetLevel range is uint8_t 0–255 (KeyerOutput alpha slider). Full key range = 255.
      HRESULT levelHr = keyer->SetLevel(255);
      if (levelHr != S_OK) {
        keyer->Disable();
        keyer->Release();
        ReleaseOutputLocked();
        iterator->Release();
        return FailJson("keyer-level-failed", "Unable to set Key + Fill key level.", "set-keyer-level",
                        "IDeckLinkKeyer::SetLevel", levelHr);
      }
      gKeyer = keyer;
      gExternalKeying = true;
      gKeyerEnabled = true;
      gKeyerLevel = 255;
    }

    selected->GetFrameRate(&gFrameDuration, &gTimeScale);
    gModeWidth = static_cast<int>(selected->GetWidth());
    gModeHeight = static_cast<int>(selected->GetHeight());
    gDeviceModel = DeviceModelName(device);
    gPersistentId = std::to_string(persistentId);
    gEndpointIndex = subIndex;
    gDisplayModeId = ModeId(selectedMode);
    gDisplayModeName = DisplayModeName(selected);
    int32_t rowBytes = 0;
    HRESULT rowHr = output->RowBytesForPixelFormat(bmdFormat8BitBGRA, gModeWidth, &rowBytes);
    if (rowHr != S_OK || rowBytes <= 0) {
      ReleaseOutputLocked();
      iterator->Release();
      return FailJson("enable-failed", "Unable to resolve DeckLink rowBytes for BGRA.", "resolve-row-bytes",
                     "RowBytesForPixelFormat", rowHr);
    }
    gRowBytes = rowBytes;

    HRESULT callbackHr = output->SetScheduledFrameCompletionCallback(&gCallback);
    if (callbackHr != S_OK) {
      ReleaseOutputLocked();
      iterator->Release();
      return FailJson("playback-failed", "Unable to set DeckLink frame completion callback",
                     "set-completion-callback", "SetScheduledFrameCompletionCallback", callbackHr);
    }

    gNextStreamTime = 0;
    int queued = preroll < 1 ? 1 : preroll;
    std::ostringstream prerollTimes;
    prerollTimes << "\"prerollDisplayTimes\":[";
    for (int index = 0; index < queued; index += 1) {
      IDeckLinkMutableVideoFrame* frame = nullptr;
      HRESULT created = output->CreateVideoFrame(gModeWidth, gModeHeight, gRowBytes, bmdFormat8BitBGRA,
                                                 bmdFrameFlagDefault, &frame);
      if (created != S_OK || frame == nullptr) {
        ReleaseOutputLocked();
        iterator->Release();
        return FailJson("enable-failed", "Unable to create DeckLink video frame", "create-video-frame",
                        "CreateVideoFrame", created,
                        "\"modeWidth\":" + std::to_string(gModeWidth) + ",\"modeHeight\":" +
                            std::to_string(gModeHeight) + ",\"computedRowBytes\":" + std::to_string(gRowBytes) +
                            ",\"requestedPixelFormatEnum\":" + std::to_string(static_cast<uint32_t>(bmdFormat8BitBGRA)));
      }

      // MetalOutput sample: Rec.601 for SD (720-wide), Rec.709 otherwise.
      // Rec.709 on 525i/625i makes ScheduleVideoFrame return E_INVALIDARG (0x80000003).
      IDeckLinkVideoFrameMutableMetadataExtensions* meta = nullptr;
      if (frame->QueryInterface(IID_IDeckLinkVideoFrameMutableMetadataExtensions, reinterpret_cast<void**>(&meta)) ==
          S_OK) {
        const BMDColorspace colorspace = gModeWidth == 720 ? bmdColorspaceRec601 : bmdColorspaceRec709;
        meta->SetInt(bmdDeckLinkFrameMetadataColorspace, static_cast<int64_t>(colorspace));
        meta->Release();
      }

      if (frame->GetWidth() != gModeWidth || frame->GetHeight() != gModeHeight ||
          frame->GetPixelFormat() != bmdFormat8BitBGRA) {
        std::ostringstream mismatch;
        mismatch << "\"frameWidth\":" << frame->GetWidth() << ",\"frameHeight\":" << frame->GetHeight()
                 << ",\"modeWidth\":" << gModeWidth << ",\"modeHeight\":" << gModeHeight
                 << ",\"actualFramePixelFormatEnum\":" << static_cast<uint32_t>(frame->GetPixelFormat())
                 << ",\"requestedPixelFormatEnum\":" << static_cast<uint32_t>(bmdFormat8BitBGRA)
                 << ",\"attributesMatch\":false";
        frame->Release();
        ReleaseOutputLocked();
        iterator->Release();
        return FailJson("frame-attribute-mismatch", "DeckLink frame attributes do not match the selected mode.",
                        "validate-frame-attributes", "CreateVideoFrame", created, mismatch.str());
      }

      // Retain ownership for the session. ScheduleVideoFrame also AddRefs; we ReleaseOwnedFrames on Stop.
      gOwnedFrames.push_back(frame);

      const BMDTimeValue expectedTime = static_cast<BMDTimeValue>(index) * gFrameDuration;
      ScheduleResult scheduled = ScheduleFilledFrame(output, frame, index);
      if (index > 0) prerollTimes << ",";
      prerollTimes << expectedTime;
      if (!scheduled.ok) {
        const char* code =
            scheduled.hr == E_INVALIDARG
                ? "frame-attribute-invalid"
                : scheduled.hr == E_ACCESSDENIED
                      ? "output-not-enabled"
                      : scheduled.hr == E_OUTOFMEMORY ? "schedule-queue-full" : "playback-failed";
        iterator->Release();
        std::string detail = scheduled.diagnostic;
        const std::string fail = FailJson(code, OperatorErrorForSchedule(scheduled.hr).c_str(), "schedule-preroll",
                                          "ScheduleVideoFrame", scheduled.hr, detail);
        ReleaseOutputLocked();
        return fail;
      }
    }
    prerollTimes << "]";

    HRESULT playback = output->StartScheduledPlayback(0, gTimeScale, 1.0);
    if (playback != S_OK) {
      iterator->Release();
      const std::string fail =
          FailJson("playback-failed", "Scheduled playback failed", "start-scheduled-playback",
                   "StartScheduledPlayback", playback);
      ReleaseOutputLocked();
      return fail;
    }
    gPlaying = true;
    gPlaybackStartedAtMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                               std::chrono::system_clock::now().time_since_epoch())
                               .count();
    // device/output/mode already retained in globals.
    iterator->Release();
    std::ostringstream ok;
    ok << "{\"ok\":true,\"stage\":\"live\",\"deviceModel\":\"" << Escape(gDeviceModel)
       << "\",\"persistentId\":\"" << Escape(gPersistentId) << "\",\"endpointIndex\":" << gEndpointIndex
       << ",\"displayModeId\":\"" << Escape(gDisplayModeId) << "\",\"displayModeName\":\""
       << Escape(gDisplayModeName) << "\",\"width\":" << gModeWidth << ",\"height\":" << gModeHeight
       << ",\"frameDuration\":" << gFrameDuration << ",\"frameTimescale\":" << gTimeScale
       << ",\"computedFpsForDisplayOnly\":\"" << Escape(ComputedFpsForDisplayOnly(gFrameDuration, gTimeScale))
       << "\",\"pixelFormat\":\"bgra8\",\"requestedPixelFormatEnum\":"
       << static_cast<uint32_t>(bmdFormat8BitBGRA) << ",\"rowBytes\":" << gRowBytes
       << ",\"scheduledFrames\":" << gScheduled.load() << ",\"playbackStartedAt\":" << gPlaybackStartedAtMs
       << ",\"presentationMode\":\"" << (gExternalKeying ? "keyFill" : "fill") << "\""
       << ",\"keyFillTransport\":\"" << (gExternalKeying ? "nativeExternalKey" : "") << "\""
       << ",\"keyerEnabled\":" << (gKeyerEnabled ? "true" : "false")
       << ",\"keyerLevel\":" << static_cast<int>(gKeyerLevel)
       << ",\"sourceAlphaRepresentation\":\"premultiplied\""
       << ",\"deckLinkFrameAlphaRepresentation\":\""
       << (gExternalKeying ? "straight" : "opaque-black-composite") << "\""
       << "," << prerollTimes.str() << "}";
    return ok.str();
  }
  iterator->Release();
  return FailJson("device-unavailable", "DeckLink device unavailable", "resolve-endpoint");
}

void DeckLinkPushFrame(const uint8_t* bgra, size_t size, int width, int height) {
  std::lock_guard<std::mutex> lock(gStateLock);
  if (!bgra || width < 1 || height < 1) return;
  // Store Chromium paint dimensions separately. Never overwrite DeckLink mode raster size.
  gRendererWidth = width;
  gRendererHeight = height;
  gLatestBgra.assign(bgra, bgra + size);
}

void DeckLinkStop() {
  std::lock_guard<std::mutex> lock(gStateLock);
  if (gOutput && gPlaying) {
    gOutput->StopScheduledPlayback(0, nullptr, gTimeScale);
    gPlaying = false;
  }
  ReleaseOutputLocked();
  ResetCountersLocked();
}

std::string DeckLinkMetricsJson() {
  std::ostringstream json;
  json << "{\"scheduledFrames\":" << gScheduled.load() << ",\"completedFrames\":" << gCompleted.load()
       << ",\"droppedFrames\":" << gDropped.load() << ",\"lateFrames\":" << gLate.load()
       << ",\"underruns\":" << gUnderruns.load() << ",\"queueDepth\":" << gQueue.load()
       << ",\"deviceModel\":\"" << Escape(gDeviceModel) << "\",\"persistentId\":\"" << Escape(gPersistentId)
       << "\",\"endpointIndex\":" << gEndpointIndex << ",\"displayModeId\":\"" << Escape(gDisplayModeId)
       << "\",\"displayModeName\":\"" << Escape(gDisplayModeName) << "\",\"width\":" << gModeWidth
       << ",\"height\":" << gModeHeight << ",\"frameDuration\":" << gFrameDuration
       << ",\"frameTimescale\":" << gTimeScale << ",\"computedFpsForDisplayOnly\":\""
       << Escape(ComputedFpsForDisplayOnly(gFrameDuration, gTimeScale))
       << "\",\"pixelFormat\":\"bgra8\",\"rendererWidth\":" << gRendererWidth
       << ",\"rendererHeight\":" << gRendererHeight << ",\"rowBytes\":" << gRowBytes
       << ",\"playbackStartedAt\":" << gPlaybackStartedAtMs << ",\"lastCompletionResult\":\""
       << Escape(gLastCompletionResult) << "\",\"lastError\":\"" << Escape(gNativeError)
       << "\",\"playbackStarted\":" << (gPlaying ? "true" : "false")
       << ",\"outputEnabled\":" << (gOutput != nullptr ? "true" : "false")
       << ",\"presentationMode\":\"" << (gExternalKeying ? "keyFill" : "fill") << "\""
       << ",\"keyFillTransport\":\"" << (gExternalKeying ? "nativeExternalKey" : "") << "\""
       << ",\"keyerInterfaceAvailable\":" << (gKeyer != nullptr ? "true" : "false")
       << ",\"keyerEnabled\":" << (gKeyerEnabled ? "true" : "false")
       << ",\"keyerLevel\":" << static_cast<int>(gKeyerLevel)
       << ",\"sourceAlphaRepresentation\":\"premultiplied\""
       << ",\"deckLinkFrameAlphaRepresentation\":\""
       << (gExternalKeying ? "straight" : "opaque-black-composite") << "\""
       << ",\"compiledSdkVersion\":\"" << Escape(CompiledSdkVersion()) << "\",\"stub\":false";
  if (!gNativeError.empty()) {
    json << ",\"nativeError\":\"" << Escape(gNativeError) << "\"";
  }
  if (!gLastScheduleDiagnostic.empty()) {
    json << ",\"lastScheduleDiagnostic\":{" << gLastScheduleDiagnostic << "}";
  }
  json << "}";
  return json.str();
}

std::string DeckLinkAdapterInfoJson() {
  DeckLinkAvailability availability = DeckLinkProbe();
  std::ostringstream json;
  json << "{\"stub\":false,\"compiledSdkVersion\":\"" << Escape(CompiledSdkVersion())
       << "\",\"sdkAvailable\":" << (availability.sdkAvailable ? "true" : "false")
       << ",\"runtimeSdkVersion\":\"" << Escape(availability.sdkVersion) << "\"}";
  return json.str();
}

std::string DeckLinkValidateFrameForModeJson(const std::string& endpointId, const std::string& modeId) {
  IDeckLinkIterator* iterator = CreateDeckLinkIteratorInstance();
  if (!iterator) {
    return FailJson("sdk-unavailable", "Blackmagic DeckLink is unavailable.", "validate-frame");
  }
  IDeckLink* device = nullptr;
  while (iterator->Next(&device) == S_OK) {
    IDeckLinkProfileAttributes* attributes = nullptr;
    int64_t persistentId = 0;
    int64_t subIndex = 0;
    if (device->QueryInterface(IID_IDeckLinkProfileAttributes, reinterpret_cast<void**>(&attributes)) == S_OK) {
      attributes->GetInt(BMDDeckLinkPersistentID, &persistentId);
      attributes->GetInt(BMDDeckLinkSubDeviceIndex, &subIndex);
      attributes->Release();
    }
    std::ostringstream id;
    id << "decklink:" << persistentId << ":" << subIndex;
    if (id.str() != endpointId) {
      device->Release();
      continue;
    }
    IDeckLinkOutput* output = nullptr;
    if (device->QueryInterface(IID_IDeckLinkOutput, reinterpret_cast<void**>(&output)) != S_OK) {
      device->Release();
      iterator->Release();
      return FailJson("device-unavailable", "DeckLink device unavailable", "validate-frame");
    }
    IDeckLinkDisplayModeIterator* modes = nullptr;
    output->GetDisplayModeIterator(&modes);
    IDeckLinkDisplayMode* selected = nullptr;
    if (modes) {
      IDeckLinkDisplayMode* mode = nullptr;
      while (modes->Next(&mode) == S_OK) {
        if (ModeId(mode->GetDisplayMode()) == modeId) {
          selected = mode;
          break;
        }
        mode->Release();
      }
      modes->Release();
    }
    if (!selected) {
      output->Release();
      device->Release();
      iterator->Release();
      return FailJson("mode-unavailable", "Configured video mode is no longer available.",
                     "validate-frame");
    }
    const int modeWidth = static_cast<int>(selected->GetWidth());
    const int modeHeight = static_cast<int>(selected->GetHeight());
    HRESULT enabled = output->EnableVideoOutput(selected->GetDisplayMode(), bmdVideoOutputFlagDefault);
    if (enabled != S_OK) {
      selected->Release();
      output->Release();
      device->Release();
      iterator->Release();
      return FailJson("enable-failed", "Unable to enable video output", "validate-frame", "EnableVideoOutput",
                     enabled);
    }
    int32_t rowBytes = 0;
    output->RowBytesForPixelFormat(bmdFormat8BitBGRA, modeWidth, &rowBytes);
    IDeckLinkMutableVideoFrame* frame = nullptr;
    HRESULT created =
        output->CreateVideoFrame(modeWidth, modeHeight, rowBytes, bmdFormat8BitBGRA, bmdFrameFlagDefault, &frame);
    std::ostringstream json;
    if (created != S_OK || !frame) {
      output->DisableVideoOutput();
      selected->Release();
      output->Release();
      device->Release();
      iterator->Release();
      return FailJson("enable-failed", "Unable to create DeckLink video frame", "validate-frame",
                     "CreateVideoFrame", created);
    }
    const bool match = frame->GetWidth() == modeWidth && frame->GetHeight() == modeHeight &&
                       frame->GetPixelFormat() == bmdFormat8BitBGRA && frame->GetRowBytes() == rowBytes;
    // Developer-only sync probe: same frame, not production architecture.
    HRESULT syncHr = output->DisplayVideoFrameSync(frame);
    json << "{\"ok\":true,\"width\":" << frame->GetWidth() << ",\"height\":" << frame->GetHeight()
         << ",\"rowBytes\":" << frame->GetRowBytes() << ",\"pixelFormat\":"
         << static_cast<uint32_t>(frame->GetPixelFormat()) << ",\"flags\":" << static_cast<uint32_t>(frame->GetFlags())
         << ",\"modeWidth\":" << modeWidth << ",\"modeHeight\":" << modeHeight
         << ",\"attributesMatch\":" << (match ? "true" : "false")
         << ",\"displayVideoFrameSyncHresult\":" << static_cast<int32_t>(syncHr)
         << ",\"displayVideoFrameSyncHresultHex\":\"" << HResultHex(syncHr)
         << "\",\"displayVideoFrameSyncHresultName\":\"" << HResultName(syncHr) << "\"}";
    frame->Release();
    output->DisableVideoOutput();
    selected->Release();
    output->Release();
    device->Release();
    iterator->Release();
    return json.str();
  }
  iterator->Release();
  return FailJson("device-unavailable", "DeckLink device unavailable", "validate-frame");
}
