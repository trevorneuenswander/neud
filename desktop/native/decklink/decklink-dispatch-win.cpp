/* NEUD-owned Windows DeckLink factory helpers.
 * Blackmagic's Windows SDK 16.x ships IDL (not DeckLinkAPIDispatch.cpp).
 * Samples use CoCreateInstance; this file provides the Create* helpers used by decklink-sdk.cc.
 */
#include "decklink-dispatch-win.h"

#include <objbase.h>

namespace {

void EnsureComInitialized() {
  static bool attempted = false;
  if (attempted) {
    return;
  }
  attempted = true;
  // Multithreaded is safe for probe/discover from Electron's worker-ish native calls.
  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (hr == RPC_E_CHANGED_MODE) {
    // Already initialized on this thread with a different model; continue.
    return;
  }
  (void)hr;
}

}  // namespace

extern "C" IDeckLinkIterator* CreateDeckLinkIteratorInstance(void) {
  EnsureComInitialized();
  IDeckLinkIterator* iterator = nullptr;
  const HRESULT hr = CoCreateInstance(
      CLSID_CDeckLinkIterator,
      nullptr,
      CLSCTX_ALL,
      IID_IDeckLinkIterator,
      reinterpret_cast<void**>(&iterator));
  if (FAILED(hr)) {
    return nullptr;
  }
  return iterator;
}

extern "C" IDeckLinkAPIInformation* CreateDeckLinkAPIInformationInstance(void) {
  EnsureComInitialized();
  IDeckLinkAPIInformation* info = nullptr;
  const HRESULT hr = CoCreateInstance(
      CLSID_CDeckLinkAPIInformation,
      nullptr,
      CLSCTX_ALL,
      IID_IDeckLinkAPIInformation,
      reinterpret_cast<void**>(&info));
  if (FAILED(hr)) {
    return nullptr;
  }
  return info;
}
