#pragma once

#include "DeckLinkAPI.h"

/* Windows SDK 16 exposes COM CLSIDs via MIDL; NEUD provides Create* helpers. */
extern "C" {
IDeckLinkIterator* CreateDeckLinkIteratorInstance(void);
IDeckLinkAPIInformation* CreateDeckLinkAPIInformationInstance(void);
}
