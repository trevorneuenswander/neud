#include "decklink-api.h"

DeckLinkAvailability DeckLinkProbe() {
  return {
      false,
      "",
      // Diagnostics: stub binary. Operator UI maps this to EXTERNAL_DEVICE_SUPPORT_UNAVAILABLE.
      "NEUD DeckLink stub addon (built without Blackmagic SDK).",
  };
}

// Stub marker for diagnostics: compiledSdkVersion empty, stub true.

std::string DeckLinkDiscoverJson() { return "[]"; }

std::string DeckLinkStartJson(const std::string&, const std::string&, int, bool) {
  return "{\"ok\":false,\"code\":\"sdk-unavailable\",\"error\":\"Blackmagic DeckLink is unavailable. Install Blackmagic Desktop Video and restart NEUD.\"}";
}

void DeckLinkPushFrame(const uint8_t*, size_t, int, int) {}

void DeckLinkStop() {}

std::string DeckLinkMetricsJson() {
  return "{\"scheduledFrames\":0,\"completedFrames\":0,\"droppedFrames\":0,\"lateFrames\":0,\"underruns\":0,\"compiledSdkVersion\":\"\",\"stub\":true}";
}

std::string DeckLinkAdapterInfoJson() {
  return "{\"stub\":true,\"compiledSdkVersion\":\"\",\"sdkAvailable\":false,\"runtimeSdkVersion\":\"\"}";
}

std::string DeckLinkValidateFrameForModeJson(const std::string&, const std::string&) {
  return "{\"ok\":false,\"code\":\"sdk-unavailable\",\"error\":\"Blackmagic DeckLink is unavailable. Install Blackmagic Desktop Video and restart NEUD.\",\"stage\":\"validate-frame\",\"stub\":true}";
}
