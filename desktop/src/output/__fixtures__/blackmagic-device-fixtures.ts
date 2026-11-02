/**
 * Representative Blackmagic Desktop Video capability fixtures for automated tests.
 * These are capability shapes — not manufacturer-certified product datasheets.
 * Physical verification remains required for each family (UltraStudio / Duo / Quad).
 */

export type FixtureMode = {
  id: string;
  name: string;
  width: number;
  height: number;
  frameRateNumerator: number;
  frameRateDenominator: number;
  interlaced: boolean;
  fieldDominance: string;
  pixelFormats: string[];
  supportsBgra?: boolean;
  supportsKeyingBgra?: boolean;
};

export type FixtureEndpoint = {
  persistentId: string;
  modelName: string;
  endpointName: string;
  endpointIndex: number;
  available: boolean;
  modes: FixtureMode[];
  capabilities: {
    supportsInternalKeying: boolean;
    supportsExternalKeying: boolean;
    supportsDualLinkSdi: boolean;
    hasReferenceInput: boolean;
    supportsSynchronizeToPlaybackGroup: boolean;
    hasKeyerInterface: boolean;
    numberOfSubDevices: number;
    deviceGroupId: number;
    nativeExternalKeyCandidate: boolean;
    pairedPortsCandidate: boolean;
    physicalKeyFillCandidate: boolean;
  };
};

const HD_5994: FixtureMode = {
  id: "1080p5994",
  name: "1080p59.94",
  width: 1920,
  height: 1080,
  frameRateNumerator: 60000,
  frameRateDenominator: 1001,
  interlaced: false,
  fieldDominance: "progressive",
  pixelFormats: ["bgra8"],
  supportsBgra: true,
  supportsKeyingBgra: true,
};

const HD_25: FixtureMode = {
  id: "1080p25",
  name: "1080p25",
  width: 1920,
  height: 1080,
  frameRateNumerator: 25,
  frameRateDenominator: 1,
  interlaced: false,
  fieldDominance: "progressive",
  pixelFormats: ["bgra8"],
  supportsBgra: true,
  supportsKeyingBgra: true,
};

const UHD_30: FixtureMode = {
  id: "2160p30",
  name: "2160p30",
  width: 3840,
  height: 2160,
  frameRateNumerator: 30,
  frameRateDenominator: 1,
  interlaced: false,
  fieldDominance: "progressive",
  pixelFormats: ["bgra8"],
  supportsBgra: true,
  supportsKeyingBgra: false,
};

const HD_NO_BGRA: FixtureMode = {
  ...HD_5994,
  id: "1080p5994-noyuv-only",
  name: "1080p59.94 (no BGRA)",
  pixelFormats: ["uyvy8"],
  supportsBgra: false,
  supportsKeyingBgra: false,
};

function caps(
  partial: Partial<FixtureEndpoint["capabilities"]> & {
    numberOfSubDevices: number;
    deviceGroupId: number;
  },
): FixtureEndpoint["capabilities"] {
  const supportsExternal = Boolean(partial.supportsExternalKeying);
  const hasKeyer = Boolean(partial.hasKeyerInterface);
  const native = supportsExternal && hasKeyer;
  const paired = partial.numberOfSubDevices >= 2 && !native;
  return {
    supportsInternalKeying: Boolean(partial.supportsInternalKeying),
    supportsExternalKeying: supportsExternal,
    supportsDualLinkSdi: Boolean(partial.supportsDualLinkSdi),
    hasReferenceInput: Boolean(partial.hasReferenceInput),
    supportsSynchronizeToPlaybackGroup: Boolean(partial.supportsSynchronizeToPlaybackGroup),
    hasKeyerInterface: hasKeyer,
    numberOfSubDevices: partial.numberOfSubDevices,
    deviceGroupId: partial.deviceGroupId,
    nativeExternalKeyCandidate: native,
    pairedPortsCandidate: paired,
    physicalKeyFillCandidate: native || paired,
  };
}

/** UltraStudio-like Thunderbolt box with native external keyer (one scheduleable endpoint). */
export function fixtureUltraStudioNativeKey(): FixtureEndpoint[] {
  return [
    {
      persistentId: "ultrastudio-native-1",
      modelName: "UltraStudio (fixture)",
      endpointName: "Output 1",
      endpointIndex: 0,
      available: true,
      modes: [HD_5994, HD_25, UHD_30],
      capabilities: caps({
        supportsExternalKeying: true,
        hasKeyerInterface: true,
        hasReferenceInput: true,
        numberOfSubDevices: 1,
        deviceGroupId: 1001,
      }),
    },
  ];
}

/** UltraStudio-like fill-only (no keying). */
export function fixtureUltraStudioFillOnly(): FixtureEndpoint[] {
  return [
    {
      persistentId: "ultrastudio-fill-1",
      modelName: "UltraStudio Mini (fixture)",
      endpointName: "Output 1",
      endpointIndex: 0,
      available: true,
      modes: [HD_5994, HD_25],
      capabilities: caps({
        supportsExternalKeying: false,
        hasKeyerInterface: false,
        numberOfSubDevices: 1,
        deviceGroupId: 1002,
      }),
    },
  ];
}

/** DeckLink Duo-like: four independently scheduleable subdevices (paired-ports Key/Fill). */
export function fixtureDeckLinkDuo(): FixtureEndpoint[] {
  return [0, 1, 2, 3].map((endpointIndex) => ({
    persistentId: "duo-persistent",
    modelName: "DeckLink Duo (fixture)",
    endpointName: `Output ${endpointIndex + 1}`,
    endpointIndex,
    available: true,
    modes: [HD_5994, HD_25],
    capabilities: caps({
      supportsInternalKeying: false,
      supportsExternalKeying: false,
      hasKeyerInterface: false,
      numberOfSubDevices: 4,
      deviceGroupId: 2001,
    }),
  }));
}

/** DeckLink Quad-like: eight subdevices; modes vary — odd ports lack UHD. */
export function fixtureDeckLinkQuad(): FixtureEndpoint[] {
  return [0, 1, 2, 3, 4, 5, 6, 7].map((endpointIndex) => ({
    persistentId: "quad-persistent",
    modelName: "DeckLink Quad (fixture)",
    endpointName: `Output ${endpointIndex + 1}`,
    endpointIndex,
    available: true,
    modes: endpointIndex % 2 === 0 ? [HD_5994, HD_25, UHD_30] : [HD_5994, HD_25],
    capabilities: caps({
      supportsInternalKeying: true,
      supportsExternalKeying: false,
      hasKeyerInterface: false,
      numberOfSubDevices: 8,
      deviceGroupId: 3001,
    }),
  }));
}

/** Mixed Thunderbolt UltraStudio + PCIe Duo on one host. */
export function fixtureMixedThunderboltAndPcie(): FixtureEndpoint[] {
  return [...fixtureUltraStudioNativeKey(), ...fixtureDeckLinkDuo()];
}

/** Device that only reports unsupported BGRA modes (operator must pick another mode/card). */
export function fixtureNoBgraModes(): FixtureEndpoint[] {
  return [
    {
      persistentId: "nobgra-1",
      modelName: "DeckLink (fixture no BGRA)",
      endpointName: "Output 1",
      endpointIndex: 0,
      available: true,
      modes: [HD_NO_BGRA],
      capabilities: caps({
        numberOfSubDevices: 1,
        deviceGroupId: 4001,
      }),
    },
  ];
}

/** Internal keying capability without external keyer interface. */
export function fixtureInternalKeyingOnly(): FixtureEndpoint[] {
  return [
    {
      persistentId: "internal-key-1",
      modelName: "DeckLink (fixture internal key)",
      endpointName: "Output 1",
      endpointIndex: 0,
      available: true,
      modes: [HD_5994],
      capabilities: caps({
        supportsInternalKeying: true,
        supportsExternalKeying: false,
        hasKeyerInterface: false,
        numberOfSubDevices: 1,
        deviceGroupId: 5001,
      }),
    },
  ];
}

export const BLACKMAGIC_FIXTURE_CATALOG = {
  ultraStudioNativeKey: fixtureUltraStudioNativeKey,
  ultraStudioFillOnly: fixtureUltraStudioFillOnly,
  deckLinkDuo: fixtureDeckLinkDuo,
  deckLinkQuad: fixtureDeckLinkQuad,
  mixedThunderboltPcie: fixtureMixedThunderboltAndPcie,
  noBgra: fixtureNoBgraModes,
  internalKeyingOnly: fixtureInternalKeyingOnly,
} as const;
