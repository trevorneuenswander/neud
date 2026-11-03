#pragma once

#include <cstddef>
#include <cstdint>
#include <string>

struct DeckLinkAvailability {
  bool sdkAvailable;
  std::string sdkVersion;
  std::string reason;
};

DeckLinkAvailability DeckLinkProbe();
std::string DeckLinkDiscoverJson();
/** externalKeying=true enables IDeckLinkKeyer::Enable(true) for native Fill+Key SDI. */
std::string DeckLinkStartJson(const std::string& endpointId, const std::string& modeId, int preroll,
                              bool externalKeying);
/** Push Chromium BGRA pixels to a specific endpoint session (multi-output safe). */
void DeckLinkPushFrame(const std::string& endpointId, const uint8_t* bgra, size_t size, int width, int height);
/** Stop and destroy only the named endpoint session; other sessions keep playing. */
void DeckLinkStop(const std::string& endpointId);
/** Metrics for one endpoint session. */
std::string DeckLinkMetricsJson(const std::string& endpointId);
std::string DeckLinkAdapterInfoJson();
std::string DeckLinkValidateFrameForModeJson(const std::string& endpointId, const std::string& modeId);
