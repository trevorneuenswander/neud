#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace neud {
namespace gpu {

struct AdapterSample {
  std::string name;
  double utilizationPercent = 0;
  bool memoryAvailable = false;
  double memoryUsedBytes = 0;
  double memoryTotalBytes = 0;
};

struct SampleResult {
  bool available = false;
  std::string reason;
  std::string source;
  /** System-wide GPU utilization (%) — see aggregation. */
  double utilizationPercent = 0;
  /** How utilizationPercent was derived from adapters. */
  std::string aggregation;
  std::vector<AdapterSample> adapters;
};

/** Sample total system GPU utilization. Never invents values. */
SampleResult SampleGpu();

struct SystemMemorySample {
  bool available = false;
  std::string reason;
  std::string source;
  /** How usedBytes was derived. */
  std::string definition;
  double totalBytes = 0;
  double usedBytes = 0;
  double availableBytes = 0;
  /** 0–100. Never invent — only set when available. */
  double utilizationPercent = 0;
  /** Optional macOS memory pressure: "normal" | "warning" | "urgent" | "critical". */
  bool pressureAvailable = false;
  std::string pressureLevel;
};

/** Sample system RAM using platform-appropriate accounting. */
SystemMemorySample SampleSystemMemory();

/** Release native handles (PDH query, cached IOKit state, etc.). */
void ShutdownGpuCollector();

}  // namespace gpu
}  // namespace neud
