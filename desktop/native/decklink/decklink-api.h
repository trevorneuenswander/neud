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
void DeckLinkPushFrame(const uint8_t* bgra, size_t size, int width, int height);
void DeckLinkStop();
std::string DeckLinkMetricsJson();
std::string DeckLinkAdapterInfoJson();
std::string DeckLinkValidateFrameForModeJson(const std::string& endpointId, const std::string& modeId);
