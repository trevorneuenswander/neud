#include "gpu.h"

namespace neud {
namespace gpu {

SampleResult SampleGpu() {
  SampleResult result;
  result.available = false;
  result.source = "stub";
  result.reason = "GPU utilization collection is not supported on this platform.";
  return result;
}

SystemMemorySample SampleSystemMemory() {
  SystemMemorySample result;
  result.available = false;
  result.source = "stub";
  result.reason = "System memory accounting is not supported on this platform.";
  return result;
}

void ShutdownGpuCollector() {}

}  // namespace gpu
}  // namespace neud
