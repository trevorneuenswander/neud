/**
 * macOS GPU utilization via IOKit IOAccelerator PerformanceStatistics.
 *
 * Primary metric: "Device Utilization %" — Apple GPU driver estimate of overall
 * device busy time across the system (not NEUD-only).
 *
 * Compatibility note: PerformanceStatistics keys are driver-published properties
 * used by Activity Monitor / Instruments. They are not a stable public API and
 * may change across macOS/GPU driver versions. We read them read-only without
 * private SPI frameworks. If keys are missing, we report unavailable.
 */

#import <Foundation/Foundation.h>
#import <IOKit/IOKitLib.h>

#include "gpu.h"

#include <algorithm>
#include <cmath>
#include <mutex>
#include <sys/sysctl.h>
#include <sys/types.h>
#include <mach/mach.h>
#include <mach/vm_statistics.h>

namespace neud {
namespace gpu {
namespace {

std::mutex gMutex;

mach_port_t MainIoPort() {
  if (@available(macOS 12.0, *)) {
    return kIOMainPortDefault;
  }
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
  return kIOMasterPortDefault;
#pragma clang diagnostic pop
}

double ClampPercent(double value) {
  if (!std::isfinite(value)) return 0;
  return std::max(0.0, std::min(100.0, value));
}

double NumberFromCF(CFTypeRef value) {
  if (!value) return NAN;
  if (CFGetTypeID(value) == CFNumberGetTypeID()) {
    double out = 0;
    if (CFNumberGetValue((CFNumberRef)value, kCFNumberDoubleType, &out)) {
      return out;
    }
  }
  return NAN;
}

bool ReadUtilization(CFDictionaryRef stats, double *outUtil) {
  if (!stats || !outUtil) return false;
  // Prefer Device Utilization % (overall). Fall back to Renderer / Tiler max.
  CFTypeRef device = CFDictionaryGetValue(stats, CFSTR("Device Utilization %"));
  double deviceUtil = NumberFromCF(device);
  if (std::isfinite(deviceUtil)) {
    *outUtil = ClampPercent(deviceUtil);
    return true;
  }
  CFTypeRef renderer = CFDictionaryGetValue(stats, CFSTR("Renderer Utilization %"));
  CFTypeRef tiler = CFDictionaryGetValue(stats, CFSTR("Tiler Utilization %"));
  double r = NumberFromCF(renderer);
  double t = NumberFromCF(tiler);
  if (std::isfinite(r) || std::isfinite(t)) {
    double best = 0;
    if (std::isfinite(r)) best = std::max(best, r);
    if (std::isfinite(t)) best = std::max(best, t);
    *outUtil = ClampPercent(best);
    return true;
  }
  return false;
}

void ReadMemory(CFDictionaryRef stats, AdapterSample *adapter) {
  if (!stats || !adapter) return;
  // Unified memory on Apple Silicon: "In use system memory" / "Alloc system memory"
  // are driver-reported GPU-related allocations — best-effort, not discrete VRAM.
  CFTypeRef used = CFDictionaryGetValue(stats, CFSTR("In use system memory"));
  CFTypeRef total = CFDictionaryGetValue(stats, CFSTR("Alloc system memory"));
  double usedBytes = NumberFromCF(used);
  double totalBytes = NumberFromCF(total);
  if (std::isfinite(usedBytes) && std::isfinite(totalBytes) && totalBytes > 0 && usedBytes >= 0) {
    adapter->memoryAvailable = true;
    adapter->memoryUsedBytes = usedBytes;
    adapter->memoryTotalBytes = totalBytes;
  }
}

std::string CfStringToStd(CFTypeRef value) {
  if (!value || CFGetTypeID(value) != CFStringGetTypeID()) return {};
  char buffer[256];
  if (CFStringGetCString((CFStringRef)value, buffer, sizeof(buffer), kCFStringEncodingUTF8)) {
    return std::string(buffer);
  }
  return {};
}

}  // namespace

SampleResult SampleGpu() {
  std::lock_guard<std::mutex> lock(gMutex);
  SampleResult result;
  result.source = "iokit-ioaccelerator";
  result.aggregation =
      "max Device Utilization % across IOAccelerator adapters (system-wide GPU busy estimate)";

  io_iterator_t iterator = IO_OBJECT_NULL;
  kern_return_t kr = IOServiceGetMatchingServices(
      MainIoPort(), IOServiceMatching("IOAccelerator"), &iterator);
  if (kr != KERN_SUCCESS || iterator == IO_OBJECT_NULL) {
    result.available = false;
    result.reason =
        "IOKit IOAccelerator matching failed — GPU utilization is unavailable on this host.";
    return result;
  }

  double systemMax = 0;
  bool anyUtil = false;
  io_service_t service = IO_OBJECT_NULL;
  while ((service = IOIteratorNext(iterator)) != IO_OBJECT_NULL) {
    AdapterSample adapter;
    CFTypeRef modelRef = IORegistryEntryCreateCFProperty(service, CFSTR("model"), kCFAllocatorDefault, 0);
    adapter.name = CfStringToStd(modelRef);
    if (modelRef) CFRelease(modelRef);
    if (adapter.name.empty()) {
      CFTypeRef classRef =
          IORegistryEntryCreateCFProperty(service, CFSTR("IOClass"), kCFAllocatorDefault, 0);
      adapter.name = CfStringToStd(classRef);
      if (classRef) CFRelease(classRef);
    }
    if (adapter.name.empty()) adapter.name = "GPU";

    CFTypeRef statsRef =
        IORegistryEntryCreateCFProperty(service, CFSTR("PerformanceStatistics"), kCFAllocatorDefault, 0);
    if (statsRef && CFGetTypeID(statsRef) == CFDictionaryGetTypeID()) {
      CFDictionaryRef stats = (CFDictionaryRef)statsRef;
      double util = 0;
      if (ReadUtilization(stats, &util)) {
        adapter.utilizationPercent = util;
        anyUtil = true;
        systemMax = std::max(systemMax, util);
      }
      ReadMemory(stats, &adapter);
    }
    if (statsRef) CFRelease(statsRef);
    IOObjectRelease(service);

    // Skip empty placeholder services with no name and no util.
    if (adapter.utilizationPercent > 0 || adapter.memoryAvailable || adapter.name != "GPU") {
      result.adapters.push_back(std::move(adapter));
    } else if (!result.adapters.empty()) {
      // keep quiet
    } else {
      result.adapters.push_back(std::move(adapter));
    }
  }
  IOObjectRelease(iterator);

  if (!anyUtil) {
    result.available = false;
    result.reason =
        "IOAccelerator PerformanceStatistics did not expose Device/Renderer/Tiler Utilization % "
        "(unsupported GPU driver or OS).";
    result.adapters.clear();
    return result;
  }

  // Deduplicate identical zero-util name-only entries if we somehow got empties.
  result.available = true;
  result.utilizationPercent = ClampPercent(systemMax);
  result.reason.clear();
  return result;
}

SystemMemorySample SampleSystemMemory() {
  SystemMemorySample result;
  result.source = "mach-host-vm-info64";
  result.definition =
      "used = (active + wired + compressor) pages × page size; "
      "percent = used / physical total. Inactive/purgeable/free are not counted as used "
      "(unlike total−os.freemem, which treats file cache as consumed).";

  int64_t physical = 0;
  size_t physicalLen = sizeof(physical);
  if (sysctlbyname("hw.memsize", &physical, &physicalLen, nullptr, 0) != 0 || physical <= 0) {
    result.available = false;
    result.reason = "sysctl hw.memsize failed — system RAM total unavailable.";
    return result;
  }

  vm_statistics64_data_t vmstat;
  mach_msg_type_number_t count = HOST_VM_INFO64_COUNT;
  kern_return_t kr =
      host_statistics64(mach_host_self(), HOST_VM_INFO64, (host_info64_t)&vmstat, &count);
  if (kr != KERN_SUCCESS) {
    result.available = false;
    result.reason = "host_statistics64(HOST_VM_INFO64) failed — system RAM used unavailable.";
    return result;
  }

  vm_size_t pageSize = 0;
  if (host_page_size(mach_host_self(), &pageSize) != KERN_SUCCESS || pageSize == 0) {
    pageSize = vm_page_size;
  }
  if (pageSize == 0) {
    result.available = false;
    result.reason = "Unable to resolve host page size for RAM accounting.";
    return result;
  }

  // App Memory ≈ active; Wired; Compressed. Speculative counted with free for availability.
  const uint64_t usedPages =
      (uint64_t)vmstat.active_count + (uint64_t)vmstat.wire_count +
      (uint64_t)vmstat.compressor_page_count;
  const uint64_t availablePages =
      (uint64_t)vmstat.free_count + (uint64_t)vmstat.inactive_count +
      (uint64_t)vmstat.purgeable_count + (uint64_t)vmstat.speculative_count;

  const double totalBytes = (double)physical;
  const double usedBytes = std::min(totalBytes, (double)usedPages * (double)pageSize);
  const double availableBytes =
      std::min(totalBytes, (double)availablePages * (double)pageSize);

  result.available = true;
  result.totalBytes = totalBytes;
  result.usedBytes = usedBytes;
  result.availableBytes = availableBytes;
  result.utilizationPercent = ClampPercent((usedBytes / totalBytes) * 100.0);
  result.reason.clear();

  // kern.memorystatus_vm_pressure_level returns NOTE_MEMORYSTATUS / Dispatch-style
  // userspace values (NOT the internal jetsam enum 0..4):
  //   1 = NORMAL, 2 = WARN, 4 = CRITICAL
  // (XNU convert_internal_pressure_level_to_dispatch_level; Firefox/psutil agree.)
  // Prior NEUD mapping treated 1 as "warning" — that falsely warned on healthy hosts.
  int pressure = 0;
  size_t pressureLen = sizeof(pressure);
  if (sysctlbyname("kern.memorystatus_vm_pressure_level", &pressure, &pressureLen, nullptr, 0) ==
      0) {
    switch (pressure) {
      case 1:  // NOTE_MEMORYSTATUS_PRESSURE_NORMAL / DISPATCH_MEMORYPRESSURE_NORMAL
        result.pressureAvailable = true;
        result.pressureLevel = "normal";
        break;
      case 2:  // WARN (internal Warning + Urgent both surface as 2)
        result.pressureAvailable = true;
        result.pressureLevel = "warning";
        break;
      case 4:  // CRITICAL
        result.pressureAvailable = true;
        result.pressureLevel = "critical";
        break;
      default:
        // Unknown encoding — do not invent a status.
        result.pressureAvailable = false;
        result.pressureLevel.clear();
        break;
    }
  }

  return result;
}

void ShutdownGpuCollector() {
  std::lock_guard<std::mutex> lock(gMutex);
  // Stateless IOKit reads — nothing persistent to release.
}

}  // namespace gpu
}  // namespace neud
