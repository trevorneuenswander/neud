#include "decklink-api.h"

DeckLinkAvailability DeckLinkProbe() {
  return {
      false,
      "",
      // Diagnostics: stub binary. Operator UI maps this to EXTERNAL_DEVICE_STUB_BUILD
      // ("DeckLink SDK missing at build time"), not Desktop Video / driver failure.
      "NEUD DeckLink stub addon (built without Blackmagic SDK).",
  };
}

// Stub marker for diagnostics: compiledSdkVersion empty, stub true.

std::string DeckLinkDiscoverJson() { return "[]"; }

std::string DeckLinkStartJson(const std::string&, const std::string&, int, bool) {
  return "{\"ok\":false,\"code\":\"sdk-unavailable\",\"error\":\"Blackmagic DeckLink is unavailable. Install Blackmagic Desktop Video and restart NEUD.\"}";
}

void DeckLinkPushFrame(const std::string&, const uint8_t*, size_t, int, int) {}

void DeckLinkStop(const std::string&) {}

std::string DeckLinkMetricsJson(const std::string&) {
  return "{\"scheduledFrames\":0,\"completedFrames\":0,\"droppedFrames\":0,\"lateFrames\":0,\"underruns\":0,\"compiledSdkVersion\":\"\",\"stub\":true,\"playbackStarted\":false,\"outputEnabled\":false,\"activeSessionCount\":0}";
}

std::string DeckLinkAdapterInfoJson() {
  return "{\"stub\":true,\"compiledSdkVersion\":\"\",\"sdkAvailable\":false,\"runtimeSdkVersion\":\"\"}";
}

std::string DeckLinkValidateFrameForModeJson(const std::string&, const std::string&) {
  return "{\"ok\":false,\"code\":\"sdk-unavailable\",\"error\":\"Blackmagic DeckLink is unavailable. Install Blackmagic Desktop Video and restart NEUD.\",\"stage\":\"validate-frame\",\"stub\":true}";
}
