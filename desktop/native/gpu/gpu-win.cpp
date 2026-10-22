/**
 * Windows GPU utilization via PDH "GPU Engine(*)\Utilization Percentage".
 *
 * Per adapter: max engine utilization (do not sum engines).
 * System-wide: max across adapters (busiest GPU busy %).
 *
 * Adapter names: DXGI factory enumeration when available.
 */

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <pdh.h>
#include <pdhmsg.h>
#include <dxgi.h>

#include "gpu.h"

#include <algorithm>
#include <cmath>
#include <map>
#include <mutex>
#include <string>
#include <vector>

#pragma comment(lib, "pdh.lib")
#pragma comment(lib, "dxgi.lib")

namespace neud {
namespace gpu {
namespace {

std::mutex gMutex;
PDH_HQUERY gQuery = nullptr;
std::vector<PDH_HCOUNTER> gCounters;
bool gPrimed = false;
std::map<std::wstring, std::string> gAdapterNamesByLuid;

double ClampPercent(double value) {
  if (!std::isfinite(value)) return 0;
  return std::max(0.0, std::min(100.0, value));
}

std::string Narrow(const std::wstring &wide) {
  if (wide.empty()) return {};
  int size = WideCharToMultiByte(CP_UTF8, 0, wide.c_str(), (int)wide.size(), nullptr, 0, nullptr, nullptr);
  if (size <= 0) return {};
  std::string out(size, '\0');
  WideCharToMultiByte(CP_UTF8, 0, wide.c_str(), (int)wide.size(), &out[0], size, nullptr, nullptr);
  return out;
}

std::wstring LuidKey(LUID luid) {
  wchar_t buf[64];
  swprintf_s(buf, L"%08X_%08X", (unsigned)luid.HighPart, (unsigned)luid.LowPart);
  return buf;
}

void RefreshDxgiNames() {
  gAdapterNamesByLuid.clear();
  IDXGIFactory1 *factory = nullptr;
  HRESULT hr = CreateDXGIFactory1(__uuidof(IDXGIFactory1), (void **)&factory);
  if (FAILED(hr) || !factory) return;
  for (UINT i = 0;; ++i) {
    IDXGIAdapter1 *adapter = nullptr;
    if (factory->EnumAdapters1(i, &adapter) == DXGI_ERROR_NOT_FOUND) break;
    if (!adapter) continue;
    DXGI_ADAPTER_DESC1 desc{};
    if (SUCCEEDED(adapter->GetDesc1(&desc))) {
      std::wstring key = LuidKey(desc.AdapterLuid);
      gAdapterNamesByLuid[key] = Narrow(desc.Description);
    }
    adapter->Release();
  }
  factory->Release();
}

/** Instance: "luid_0x00000000_0x00012AB3_phys_0_eng_0_engtype_3D" */
bool ParseLuidFromInstance(const std::wstring &instance, std::wstring *outKey) {
  // Look for luid_0xHHHHHHHH_0xLLLLLLLL
  const std::wstring marker = L"luid_0x";
  size_t pos = instance.find(marker);
  if (pos == std::wstring::npos) return false;
  pos += marker.size();
  size_t highEnd = instance.find(L"_0x", pos);
  if (highEnd == std::wstring::npos) return false;
  std::wstring high = instance.substr(pos, highEnd - pos);
  size_t lowStart = highEnd + 3;
  size_t lowEnd = instance.find(L'_', lowStart);
  if (lowEnd == std::wstring::npos) lowEnd = instance.size();
  std::wstring low = instance.substr(lowStart, lowEnd - lowStart);
  // Normalize to uppercase hex without 0x for map key matching DXGI format.
  auto pad8 = [](std::wstring hex) {
    for (auto &c : hex) {
      if (c >= L'a' && c <= L'f') c = (wchar_t)(c - L'a' + L'A');
    }
    while (hex.size() < 8) hex = L"0" + hex;
    if (hex.size() > 8) hex = hex.substr(hex.size() - 8);
    return hex;
  };
  *outKey = pad8(high) + L"_" + pad8(low);
  return true;
}

void CloseQueryLocked() {
  if (gQuery) {
    PdhCloseQuery(gQuery);
    gQuery = nullptr;
  }
  gCounters.clear();
  gPrimed = false;
}

bool OpenQueryLocked(SampleResult *errorOut) {
  CloseQueryLocked();
  PDH_STATUS status = PdhOpenQueryW(nullptr, 0, &gQuery);
  if (status != ERROR_SUCCESS || !gQuery) {
    if (errorOut) {
      errorOut->available = false;
      errorOut->reason = "PDH PdhOpenQuery failed — GPU Engine counters unavailable.";
    }
    return false;
  }

  // Wildcard counter — expands to all GPU engine instances.
  PDH_HCOUNTER counter = nullptr;
  status = PdhAddEnglishCounterW(
      gQuery, L"\\GPU Engine(*)\\Utilization Percentage", 0, &counter);
  if (status != ERROR_SUCCESS || !counter) {
    CloseQueryLocked();
    if (errorOut) {
      errorOut->available = false;
      errorOut->reason =
          "PDH GPU Engine Utilization Percentage counter is not available on this Windows host.";
    }
    return false;
  }
  gCounters.push_back(counter);

  status = PdhCollectQueryData(gQuery);
  if (status != ERROR_SUCCESS && status != PDH_NO_DATA) {
    CloseQueryLocked();
    if (errorOut) {
      errorOut->available = false;
      errorOut->reason = "PDH CollectQueryData failed during GPU counter priming.";
    }
    return false;
  }
  gPrimed = true;
  RefreshDxgiNames();
  return true;
}

}  // namespace

SampleResult SampleGpu() {
  std::lock_guard<std::mutex> lock(gMutex);
  SampleResult result;
  result.source = "pdh-gpu-engine";
  result.aggregation =
      "per-adapter max of GPU Engine Utilization %; system value = max across adapters "
      "(does not sum engines or adapters)";

  if (!gQuery) {
    if (!OpenQueryLocked(&result)) return result;
    // First real sample needs a second CollectQueryData after a short interval.
    Sleep(200);
  }

  PDH_STATUS status = PdhCollectQueryData(gQuery);
  if (status != ERROR_SUCCESS && status != PDH_NO_DATA) {
    CloseQueryLocked();
    result.available = false;
    result.reason = "PDH CollectQueryData failed — GPU utilization unavailable.";
    return result;
  }

  if (gCounters.empty()) {
    result.available = false;
    result.reason = "No PDH GPU counters registered.";
    return result;
  }

  DWORD bufferSize = 0;
  DWORD itemCount = 0;
  status = PdhGetFormattedCounterArrayW(
      gCounters[0], PDH_FMT_DOUBLE, &bufferSize, &itemCount, nullptr);
  if (status != PDH_MORE_DATA && status != ERROR_SUCCESS) {
    // Counter may need another interval after open.
    if (!gPrimed) {
      result.available = false;
      result.reason = "PDH GPU counter array not ready.";
      return result;
    }
    Sleep(50);
    status = PdhCollectQueryData(gQuery);
    bufferSize = 0;
    itemCount = 0;
    status = PdhGetFormattedCounterArrayW(
        gCounters[0], PDH_FMT_DOUBLE, &bufferSize, &itemCount, nullptr);
  }

  if (bufferSize == 0 || (status != PDH_MORE_DATA && status != ERROR_SUCCESS)) {
    result.available = false;
    result.reason =
        "PDH returned no GPU Engine utilization samples (counters may be disabled or unsupported).";
    return result;
  }

  std::vector<uint8_t> buffer(bufferSize);
  auto *items = reinterpret_cast<PDH_FMT_COUNTERVALUE_ITEM_W *>(buffer.data());
  status = PdhGetFormattedCounterArrayW(
      gCounters[0], PDH_FMT_DOUBLE, &bufferSize, &itemCount, items);
  if (status != ERROR_SUCCESS || itemCount == 0) {
    result.available = false;
    result.reason = "PDH GPU Engine utilization array read failed.";
    return result;
  }

  std::map<std::wstring, double> utilByLuid;
  for (DWORD i = 0; i < itemCount; ++i) {
    if (items[i].FmtValue.CStatus != ERROR_SUCCESS) continue;
    double value = items[i].FmtValue.doubleValue;
    if (!std::isfinite(value)) continue;
    value = ClampPercent(value);
    std::wstring name = items[i].szName ? items[i].szName : L"";
    std::wstring luidKey;
    if (!ParseLuidFromInstance(name, &luidKey)) {
      luidKey = L"unknown";
    }
    auto it = utilByLuid.find(luidKey);
    if (it == utilByLuid.end()) {
      utilByLuid[luidKey] = value;
    } else {
      it->second = std::max(it->second, value);
    }
  }

  if (utilByLuid.empty()) {
    result.available = false;
    result.reason = "No valid GPU Engine utilization values in PDH sample.";
    return result;
  }

  if (gAdapterNamesByLuid.empty()) {
    RefreshDxgiNames();
  }

  double systemMax = 0;
  for (const auto &entry : utilByLuid) {
    AdapterSample adapter;
    auto nameIt = gAdapterNamesByLuid.find(entry.first);
    if (nameIt != gAdapterNamesByLuid.end() && !nameIt->second.empty()) {
      adapter.name = nameIt->second;
    } else {
      adapter.name = "GPU " + Narrow(entry.first);
    }
    adapter.utilizationPercent = entry.second;
    // Dedicated GPU memory via DXGI is size, not utilization — skip unreliable % here.
    adapter.memoryAvailable = false;
    systemMax = std::max(systemMax, entry.second);
    result.adapters.push_back(std::move(adapter));
  }

  result.available = true;
  result.utilizationPercent = ClampPercent(systemMax);
  result.reason.clear();
  return result;
}

SystemMemorySample SampleSystemMemory() {
  SystemMemorySample result;
  result.source = "memorystatusex";
  result.definition =
      "used = ullTotalPhys − ullAvailPhys; percent = used / total "
      "(GlobalMemoryStatusEx — Task Manager–class available physical memory).";

  MEMORYSTATUSEX status;
  status.dwLength = sizeof(status);
  if (!GlobalMemoryStatusEx(&status) || status.ullTotalPhys == 0) {
    result.available = false;
    result.reason = "GlobalMemoryStatusEx failed — system RAM unavailable.";
    return result;
  }

  const double totalBytes = (double)status.ullTotalPhys;
  const double availableBytes = (double)status.ullAvailPhys;
  const double usedBytes = std::max(0.0, totalBytes - availableBytes);

  result.available = true;
  result.totalBytes = totalBytes;
  result.usedBytes = usedBytes;
  result.availableBytes = availableBytes;
  result.utilizationPercent = ClampPercent((usedBytes / totalBytes) * 100.0);
  result.pressureAvailable = false;
  result.reason.clear();
  return result;
}

void ShutdownGpuCollector() {
  std::lock_guard<std::mutex> lock(gMutex);
  CloseQueryLocked();
  gAdapterNamesByLuid.clear();
}

}  // namespace gpu
}  // namespace neud
