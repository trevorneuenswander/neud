#include <napi.h>
#include "gpu.h"

#include <cmath>
#include <string>

namespace {

Napi::Object AdapterToObject(Napi::Env env, const neud::gpu::AdapterSample &adapter) {
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("name", adapter.name);
  obj.Set("utilizationPercent", adapter.utilizationPercent);
  obj.Set("memoryAvailable", adapter.memoryAvailable);
  if (adapter.memoryAvailable) {
    obj.Set("memoryUsedBytes", adapter.memoryUsedBytes);
    obj.Set("memoryTotalBytes", adapter.memoryTotalBytes);
  } else {
    obj.Set("memoryUsedBytes", env.Null());
    obj.Set("memoryTotalBytes", env.Null());
  }
  return obj;
}

Napi::Object ResultToObject(Napi::Env env, const neud::gpu::SampleResult &result) {
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("available", result.available);
  obj.Set("source", result.source);
  obj.Set("aggregation", result.aggregation);
  if (result.available) {
    double pct = result.utilizationPercent;
    if (!std::isfinite(pct)) pct = 0;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    obj.Set("utilizationPercent", pct);
    obj.Set("reason", env.Null());
  } else {
    obj.Set("utilizationPercent", env.Null());
    obj.Set("reason", result.reason.empty() ? "GPU utilization unavailable." : result.reason);
  }
  Napi::Array adapters = Napi::Array::New(env, result.adapters.size());
  for (size_t i = 0; i < result.adapters.size(); ++i) {
    adapters.Set((uint32_t)i, AdapterToObject(env, result.adapters[i]));
  }
  obj.Set("adapters", adapters);
  return obj;
}

Napi::Value Sample(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  try {
    return ResultToObject(env, neud::gpu::SampleGpu());
  } catch (const std::exception &ex) {
    neud::gpu::SampleResult failed;
    failed.available = false;
    failed.reason = std::string("GPU sample threw: ") + ex.what();
    return ResultToObject(env, failed);
  } catch (...) {
    neud::gpu::SampleResult failed;
    failed.available = false;
    failed.reason = "GPU sample failed with an unknown native error.";
    return ResultToObject(env, failed);
  }
}

Napi::Object MemoryToObject(Napi::Env env, const neud::gpu::SystemMemorySample &sample) {
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("available", sample.available);
  obj.Set("source", sample.source);
  obj.Set("definition", sample.definition);
  if (sample.available) {
    obj.Set("totalBytes", sample.totalBytes);
    obj.Set("usedBytes", sample.usedBytes);
    obj.Set("availableBytes", sample.availableBytes);
    double pct = sample.utilizationPercent;
    if (!std::isfinite(pct)) pct = 0;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    obj.Set("utilizationPercent", pct);
    obj.Set("reason", env.Null());
  } else {
    obj.Set("totalBytes", env.Null());
    obj.Set("usedBytes", env.Null());
    obj.Set("availableBytes", env.Null());
    obj.Set("utilizationPercent", env.Null());
    obj.Set("reason", sample.reason.empty() ? "System memory unavailable." : sample.reason);
  }
  obj.Set("pressureAvailable", sample.pressureAvailable);
  if (sample.pressureAvailable) {
    obj.Set("pressureLevel", sample.pressureLevel);
  } else {
    obj.Set("pressureLevel", env.Null());
  }
  return obj;
}

Napi::Value SampleMemory(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  try {
    return MemoryToObject(env, neud::gpu::SampleSystemMemory());
  } catch (const std::exception &ex) {
    neud::gpu::SystemMemorySample failed;
    failed.available = false;
    failed.reason = std::string("Memory sample threw: ") + ex.what();
    return MemoryToObject(env, failed);
  } catch (...) {
    neud::gpu::SystemMemorySample failed;
    failed.available = false;
    failed.reason = "Memory sample failed with an unknown native error.";
    return MemoryToObject(env, failed);
  }
}

Napi::Value Shutdown(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  try {
    neud::gpu::ShutdownGpuCollector();
  } catch (...) {
    // Best-effort cleanup — never throw into JS shutdown paths.
  }
  return env.Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("sample", Napi::Function::New(env, Sample));
  exports.Set("sampleMemory", Napi::Function::New(env, SampleMemory));
  exports.Set("shutdown", Napi::Function::New(env, Shutdown));
  return exports;
}

}  // namespace

NODE_API_MODULE(neud_gpu, Init)
