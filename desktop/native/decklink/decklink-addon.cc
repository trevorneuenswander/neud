#include <napi.h>

#include <cstring>
#include <string>

#include "decklink-api.h"

Napi::Value Probe(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  DeckLinkAvailability availability = DeckLinkProbe();
  Napi::Object result = Napi::Object::New(env);
  result.Set("sdkAvailable", Napi::Boolean::New(env, availability.sdkAvailable));
  result.Set("sdkVersion", Napi::String::New(env, availability.sdkVersion));
  result.Set("reason", Napi::String::New(env, availability.reason));
  return result;
}

Napi::Value Discover(const Napi::CallbackInfo& info) {
  return Napi::String::New(info.Env(), DeckLinkDiscoverJson());
}

Napi::Value Start(const Napi::CallbackInfo& info) {
  std::string endpoint = info[0].IsString() ? info[0].As<Napi::String>().Utf8Value() : "";
  std::string mode = info[1].IsString() ? info[1].As<Napi::String>().Utf8Value() : "";
  int preroll = info[2].IsNumber() ? info[2].As<Napi::Number>().Int32Value() : 3;
  bool externalKeying = info[3].IsBoolean() ? info[3].As<Napi::Boolean>().Value() : false;
  return Napi::String::New(info.Env(), DeckLinkStartJson(endpoint, mode, preroll, externalKeying));
}

Napi::Value PushFrame(const Napi::CallbackInfo& info) {
  if (!info[0].IsBuffer()) return info.Env().Undefined();
  Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();
  int width = info[1].IsNumber() ? info[1].As<Napi::Number>().Int32Value() : 0;
  int height = info[2].IsNumber() ? info[2].As<Napi::Number>().Int32Value() : 0;
  DeckLinkPushFrame(buffer.Data(), buffer.Length(), width, height);
  return info.Env().Undefined();
}

Napi::Value Stop(const Napi::CallbackInfo& info) {
  DeckLinkStop();
  return info.Env().Undefined();
}

Napi::Value Metrics(const Napi::CallbackInfo& info) {
  return Napi::String::New(info.Env(), DeckLinkMetricsJson());
}

Napi::Value AdapterInfo(const Napi::CallbackInfo& info) {
  return Napi::String::New(info.Env(), DeckLinkAdapterInfoJson());
}

Napi::Value ValidateFrameForMode(const Napi::CallbackInfo& info) {
  std::string endpoint = info[0].IsString() ? info[0].As<Napi::String>().Utf8Value() : "";
  std::string mode = info[1].IsString() ? info[1].As<Napi::String>().Utf8Value() : "";
  return Napi::String::New(info.Env(), DeckLinkValidateFrameForModeJson(endpoint, mode));
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("probe", Napi::Function::New(env, Probe));
  exports.Set("discover", Napi::Function::New(env, Discover));
  exports.Set("start", Napi::Function::New(env, Start));
  exports.Set("pushFrame", Napi::Function::New(env, PushFrame));
  exports.Set("stop", Napi::Function::New(env, Stop));
  exports.Set("metrics", Napi::Function::New(env, Metrics));
  exports.Set("getAdapterInfo", Napi::Function::New(env, AdapterInfo));
  exports.Set("validateFrameForMode", Napi::Function::New(env, ValidateFrameForMode));
  return exports;
}

NODE_API_MODULE(neud_decklink, Init)
