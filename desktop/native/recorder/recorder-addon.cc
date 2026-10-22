#include <napi.h>
#include "recorder.h"

#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace {

using neud::recorder::CodecAvailability;
using neud::recorder::CodecId;
using neud::recorder::CreatePlatformDiskRecorder;
using neud::recorder::DiskRecorder;
using neud::recorder::ListCodecAvailability;
using neud::recorder::OpenParams;

struct Session {
  std::unique_ptr<DiskRecorder> recorder;
};

std::mutex gMutex;
std::unordered_map<std::string, std::shared_ptr<Session>> gSessions;
uint64_t gNextId = 1;

CodecId CodecFromString(const std::string &id) {
  if (id == "prores-422hq-mov") return CodecId::ProRes422HQ;
  if (id == "h264-mp4") return CodecId::H264;
  return CodecId::ProRes4444;
}

Napi::Object CodecToObject(Napi::Env env, const CodecAvailability &codec) {
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("format", codec.id);
  obj.Set("label", codec.label);
  obj.Set("supportsAlpha", codec.supportsAlpha);
  obj.Set("available", codec.available);
  obj.Set("reason", codec.reason);
  obj.Set("encoder", codec.encoder);
  obj.Set("licenseNote", codec.licenseNote);
  return obj;
}

Napi::Value ListCodecs(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Array arr = Napi::Array::New(env);
  auto codecs = ListCodecAvailability();
  for (size_t i = 0; i < codecs.size(); i++) {
    arr.Set((uint32_t)i, CodecToObject(env, codecs[i]));
  }
  return arr;
}

Napi::Value Open(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "open(options) required").ThrowAsJavaScriptException();
    return env.Null();
  }
  Napi::Object opts = info[0].As<Napi::Object>();
  OpenParams params;
  params.filePath = opts.Get("filePath").ToString().Utf8Value();
  params.width = opts.Has("width") ? opts.Get("width").ToNumber().Int32Value() : 1920;
  params.height = opts.Has("height") ? opts.Get("height").ToNumber().Int32Value() : 1080;
  params.codec = CodecFromString(
      opts.Has("format") ? opts.Get("format").ToString().Utf8Value() : "prores-4444-mov");
  params.fpsNumerator =
      opts.Has("fpsNumerator") ? opts.Get("fpsNumerator").ToNumber().Int32Value() : 30000;
  params.fpsDenominator =
      opts.Has("fpsDenominator") ? opts.Get("fpsDenominator").ToNumber().Int32Value() : 1001;
  params.preserveAlpha =
      opts.Has("preserveAlpha") ? opts.Get("preserveAlpha").ToBoolean().Value() : true;
  params.backgroundR =
      opts.Has("backgroundR") ? (uint8_t)opts.Get("backgroundR").ToNumber().Uint32Value() : 0;
  params.backgroundG =
      opts.Has("backgroundG") ? (uint8_t)opts.Get("backgroundG").ToNumber().Uint32Value() : 0;
  params.backgroundB =
      opts.Has("backgroundB") ? (uint8_t)opts.Get("backgroundB").ToNumber().Uint32Value() : 0;

  auto session = std::make_shared<Session>();
  session->recorder = CreatePlatformDiskRecorder();
  std::string error;
  if (!session->recorder->open(params, &error)) {
    Napi::Object fail = Napi::Object::New(env);
    fail.Set("ok", false);
    fail.Set("error", error.empty() ? "Unable to open recorder." : error);
    return fail;
  }

  std::string id;
  {
    std::lock_guard<std::mutex> lock(gMutex);
    id = "r" + std::to_string(gNextId++);
    gSessions[id] = session;
  }

  Napi::Object ok = Napi::Object::New(env);
  ok.Set("ok", true);
  ok.Set("sessionId", id);
  return ok;
}

std::shared_ptr<Session> RequireSession(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "sessionId required").ThrowAsJavaScriptException();
    return nullptr;
  }
  std::lock_guard<std::mutex> lock(gMutex);
  auto it = gSessions.find(info[0].As<Napi::String>().Utf8Value());
  return it == gSessions.end() ? nullptr : it->second;
}

Napi::Value AppendFrame(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  auto session = RequireSession(info);
  if (!session) {
    Napi::Error::New(env, "Unknown recorder session").ThrowAsJavaScriptException();
    return env.Null();
  }
  if (info.Length() < 2 || !info[1].IsObject()) {
    Napi::TypeError::New(env, "appendFrame(sessionId, frame)").ThrowAsJavaScriptException();
    return env.Null();
  }
  Napi::Object frame = info[1].As<Napi::Object>();
  int width = frame.Get("width").ToNumber().Int32Value();
  int height = frame.Get("height").ToNumber().Int32Value();
  int64_t ptsUs = frame.Has("ptsUs") ? (int64_t)frame.Get("ptsUs").ToNumber().Int64Value() : 0;
  if (!frame.Get("bgra").IsBuffer()) {
    Napi::TypeError::New(env, "bgra Buffer required").ThrowAsJavaScriptException();
    return env.Null();
  }
  Napi::Buffer<uint8_t> bgra = frame.Get("bgra").As<Napi::Buffer<uint8_t>>();
  std::string error;
  bool ok = session->recorder->appendFrame(
      bgra.Data(), bgra.Length(), width, height, ptsUs, &error);
  Napi::Object result = Napi::Object::New(env);
  result.Set("ok", ok);
  if (!ok) result.Set("error", error);
  result.Set("encodedFrames", (double)session->recorder->encodedFrames());
  result.Set("droppedFrames", (double)session->recorder->droppedFrames());
  return result;
}

Napi::Value Finalize(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  auto session = RequireSession(info);
  if (!session) {
    Napi::Error::New(env, "Unknown recorder session").ThrowAsJavaScriptException();
    return env.Null();
  }
  std::string error;
  bool ok = session->recorder->finalize(&error);
  {
    std::lock_guard<std::mutex> lock(gMutex);
    gSessions.erase(info[0].As<Napi::String>().Utf8Value());
  }
  Napi::Object result = Napi::Object::New(env);
  result.Set("ok", ok);
  if (!ok) result.Set("error", error.empty() ? "Finalize failed." : error);
  result.Set("encodedFrames", (double)session->recorder->encodedFrames());
  result.Set("droppedFrames", (double)session->recorder->droppedFrames());
  return result;
}

Napi::Value Close(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) return env.Undefined();
  std::string id = info[0].As<Napi::String>().Utf8Value();
  std::shared_ptr<Session> session;
  {
    std::lock_guard<std::mutex> lock(gMutex);
    auto it = gSessions.find(id);
    if (it == gSessions.end()) return env.Undefined();
    session = it->second;
    gSessions.erase(it);
  }
  session->recorder->close();
  return env.Undefined();
}

Napi::Value Platform(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Object obj = Napi::Object::New(env);
#if defined(__APPLE__)
  obj.Set("encoder", "avfoundation");
  obj.Set("available", true);
#elif defined(_WIN32)
  obj.Set("encoder", "windows-pending");
  obj.Set("available", false);
#else
  obj.Set("encoder", "stub");
  obj.Set("available", false);
#endif
  return obj;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("listCodecs", Napi::Function::New(env, ListCodecs));
  exports.Set("open", Napi::Function::New(env, Open));
  exports.Set("appendFrame", Napi::Function::New(env, AppendFrame));
  exports.Set("finalize", Napi::Function::New(env, Finalize));
  exports.Set("close", Napi::Function::New(env, Close));
  exports.Set("platform", Napi::Function::New(env, Platform));
  return exports;
}

NODE_API_MODULE(neud_recorder, Init)

}  // namespace
