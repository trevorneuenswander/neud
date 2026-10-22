#include <napi.h>
#include "video-decoder.h"

#include <cstring>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace {

using neud::video::CreatePlatformVideoDecoder;
using neud::video::DecodedFrame;
using neud::video::MediaInfo;
using neud::video::PlaybackState;
using neud::video::VideoDecoder;

struct Session {
  std::unique_ptr<VideoDecoder> decoder;
  Napi::ThreadSafeFunction frameTsfn;
  Napi::ThreadSafeFunction stateTsfn;
  std::mutex mutex;
  // Bounded latest-frame buffer (single slot) for pull API.
  std::vector<uint8_t> latestBgra;
  int width = 0;
  int height = 0;
  int stride = 0;
  int64_t ptsUs = 0;
  bool hasFrame = false;
};

std::mutex gSessionsMutex;
std::unordered_map<std::string, std::shared_ptr<Session>> gSessions;
uint64_t gNextId = 1;

std::string StateName(PlaybackState state) {
  switch (state) {
    case PlaybackState::Idle:
      return "idle";
    case PlaybackState::Opened:
      return "opened";
    case PlaybackState::Playing:
      return "playing";
    case PlaybackState::Paused:
      return "paused";
    case PlaybackState::Stopped:
      return "stopped";
    case PlaybackState::Ended:
      return "ended";
    case PlaybackState::Error:
      return "error";
  }
  return "idle";
}

std::shared_ptr<Session> GetSession(const std::string &id) {
  std::lock_guard<std::mutex> lock(gSessionsMutex);
  auto it = gSessions.find(id);
  return it == gSessions.end() ? nullptr : it->second;
}

Napi::Object MediaInfoToObject(Napi::Env env, const MediaInfo &info) {
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("width", info.width);
  obj.Set("height", info.height);
  obj.Set("durationSeconds", info.durationSeconds);
  obj.Set("frameRate", info.frameRate);
  obj.Set("hasAlpha", info.hasAlpha);
  obj.Set("codecLabel", info.codecLabel);
  return obj;
}

Napi::Value Open(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "open(path) requires a string path").ThrowAsJavaScriptException();
    return env.Null();
  }
  std::string path = info[0].As<Napi::String>().Utf8Value();
  auto session = std::make_shared<Session>();
  session->decoder = CreatePlatformVideoDecoder();
  MediaInfo media{};
  std::string error;
  if (!session->decoder->open(path, &media, &error)) {
    Napi::Object fail = Napi::Object::New(env);
    fail.Set("ok", false);
    fail.Set("error", error.empty() ? "Unable to open media." : error);
    return fail;
  }

  std::string id;
  {
    std::lock_guard<std::mutex> lock(gSessionsMutex);
    id = "v" + std::to_string(gNextId++);
    gSessions[id] = session;
  }

  session->decoder->setFrameCallback([session](const DecodedFrame &frame) {
    {
      std::lock_guard<std::mutex> lock(session->mutex);
      if (session->latestBgra.size() != frame.byteLength) {
        session->latestBgra.resize(frame.byteLength);
      }
      if (frame.bgra && frame.byteLength > 0) {
        memcpy(session->latestBgra.data(), frame.bgra, frame.byteLength);
      }
      session->width = frame.width;
      session->height = frame.height;
      session->stride = frame.stride;
      session->ptsUs = frame.ptsUs;
      session->hasFrame = true;
    }
    if (session->frameTsfn) {
      auto *payload = new DecodedFrame(frame);
      // Deep-copy pixels for async delivery.
      auto *pixels = new std::vector<uint8_t>(frame.bgra, frame.bgra + frame.byteLength);
      payload->bgra = pixels->data();
      // NonBlocking: never wait on the Electron main thread from the decode worker.
      // BlockingCall + joinWorker from IPC stop deadlocks the UI.
      napi_status status = session->frameTsfn.NonBlockingCall(
          payload, [pixels](Napi::Env env, Napi::Function jsCallback, DecodedFrame *framePtr) {
            Napi::HandleScope scope(env);
            Napi::Object obj = Napi::Object::New(env);
            obj.Set("width", framePtr->width);
            obj.Set("height", framePtr->height);
            obj.Set("stride", framePtr->stride);
            obj.Set("ptsUs", (double)framePtr->ptsUs);
            Napi::Buffer<uint8_t> buf =
                Napi::Buffer<uint8_t>::Copy(env, pixels->data(), pixels->size());
            obj.Set("bgra", buf);
            jsCallback.Call({obj});
            delete framePtr;
            delete pixels;
          });
      if (status != napi_ok) {
        delete payload;
        delete pixels;
      }
    }
  });

  session->decoder->setStateCallback([session](PlaybackState state, const std::string &err) {
    if (!session->stateTsfn) return;
    auto *msg = new std::pair<std::string, std::string>(StateName(state), err);
    napi_status status = session->stateTsfn.NonBlockingCall(
        msg, [](Napi::Env env, Napi::Function jsCallback, std::pair<std::string, std::string> *m) {
          Napi::HandleScope scope(env);
          Napi::Object obj = Napi::Object::New(env);
          obj.Set("state", m->first);
          obj.Set("error", m->second);
          jsCallback.Call({obj});
          delete m;
        });
    if (status != napi_ok) {
      delete msg;
    }
  });

  Napi::Object ok = Napi::Object::New(env);
  ok.Set("ok", true);
  ok.Set("sessionId", id);
  ok.Set("info", MediaInfoToObject(env, media));
  return ok;
}

std::shared_ptr<Session> RequireSession(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "sessionId required").ThrowAsJavaScriptException();
    return nullptr;
  }
  auto session = GetSession(info[0].As<Napi::String>().Utf8Value());
  if (!session) {
    Napi::Error::New(env, "Unknown video session").ThrowAsJavaScriptException();
  }
  return session;
}

Napi::Value Play(const Napi::CallbackInfo &info) {
  auto session = RequireSession(info);
  if (session) session->decoder->play();
  return info.Env().Undefined();
}

Napi::Value Pause(const Napi::CallbackInfo &info) {
  auto session = RequireSession(info);
  if (session) session->decoder->pause();
  return info.Env().Undefined();
}

Napi::Value Stop(const Napi::CallbackInfo &info) {
  auto session = RequireSession(info);
  if (session) session->decoder->stop();
  return info.Env().Undefined();
}

Napi::Value Restart(const Napi::CallbackInfo &info) {
  auto session = RequireSession(info);
  if (session) session->decoder->restart();
  return info.Env().Undefined();
}

Napi::Value SetLoop(const Napi::CallbackInfo &info) {
  auto session = RequireSession(info);
  if (!session) return info.Env().Undefined();
  bool enabled = info.Length() > 1 && info[1].IsBoolean() ? info[1].As<Napi::Boolean>().Value() : true;
  session->decoder->setLoop(enabled);
  return info.Env().Undefined();
}

Napi::Value GetStatus(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  auto session = RequireSession(info);
  if (!session) return env.Null();
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("state", StateName(session->decoder->state()));
  obj.Set("loop", session->decoder->loop());
  obj.Set("info", MediaInfoToObject(env, session->decoder->info()));
  std::lock_guard<std::mutex> lock(session->mutex);
  obj.Set("hasFrame", session->hasFrame);
  obj.Set("ptsUs", (double)session->ptsUs);
  return obj;
}

Napi::Value PullFrame(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  auto session = RequireSession(info);
  if (!session) return env.Null();
  std::lock_guard<std::mutex> lock(session->mutex);
  if (!session->hasFrame) return env.Null();
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("width", session->width);
  obj.Set("height", session->height);
  obj.Set("stride", session->stride);
  obj.Set("ptsUs", (double)session->ptsUs);
  obj.Set(
      "bgra",
      Napi::Buffer<uint8_t>::Copy(env, session->latestBgra.data(), session->latestBgra.size()));
  return obj;
}

Napi::Value OnFrame(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  auto session = RequireSession(info);
  if (!session) return env.Undefined();
  if (info.Length() < 2 || !info[1].IsFunction()) {
    Napi::TypeError::New(env, "onFrame(sessionId, callback)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (session->frameTsfn) {
    session->frameTsfn.Release();
  }
  session->frameTsfn = Napi::ThreadSafeFunction::New(
      env, info[1].As<Napi::Function>(), "neud-video-frame", 0, 1);
  return env.Undefined();
}

Napi::Value OnState(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  auto session = RequireSession(info);
  if (!session) return env.Undefined();
  if (info.Length() < 2 || !info[1].IsFunction()) {
    Napi::TypeError::New(env, "onState(sessionId, callback)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (session->stateTsfn) {
    session->stateTsfn.Release();
  }
  session->stateTsfn = Napi::ThreadSafeFunction::New(
      env, info[1].As<Napi::Function>(), "neud-video-state", 0, 1);
  return env.Undefined();
}

Napi::Value Close(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) return env.Undefined();
  std::string id = info[0].As<Napi::String>().Utf8Value();
  std::shared_ptr<Session> session;
  {
    std::lock_guard<std::mutex> lock(gSessionsMutex);
    auto it = gSessions.find(id);
    if (it == gSessions.end()) return env.Undefined();
    session = it->second;
    gSessions.erase(it);
  }
  session->decoder->close();
  if (session->frameTsfn) session->frameTsfn.Release();
  if (session->stateTsfn) session->stateTsfn.Release();
  return env.Undefined();
}

Napi::Value Platform(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Object obj = Napi::Object::New(env);
#if defined(__APPLE__)
  obj.Set("decoder", "avfoundation");
  obj.Set("available", true);
#elif defined(_WIN32)
  obj.Set("decoder", "ffmpeg-lgpl");
#if defined(NEUD_WITH_FFMPEG)
  obj.Set("available", true);
#else
  obj.Set("available", false);
#endif
#else
  obj.Set("decoder", "stub");
  obj.Set("available", false);
#endif
  return obj;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("open", Napi::Function::New(env, Open));
  exports.Set("play", Napi::Function::New(env, Play));
  exports.Set("pause", Napi::Function::New(env, Pause));
  exports.Set("stop", Napi::Function::New(env, Stop));
  exports.Set("restart", Napi::Function::New(env, Restart));
  exports.Set("setLoop", Napi::Function::New(env, SetLoop));
  exports.Set("getStatus", Napi::Function::New(env, GetStatus));
  exports.Set("pullFrame", Napi::Function::New(env, PullFrame));
  exports.Set("onFrame", Napi::Function::New(env, OnFrame));
  exports.Set("onState", Napi::Function::New(env, OnState));
  exports.Set("close", Napi::Function::New(env, Close));
  exports.Set("platform", Napi::Function::New(env, Platform));
  return exports;
}

NODE_API_MODULE(neud_video, Init)

}  // namespace
