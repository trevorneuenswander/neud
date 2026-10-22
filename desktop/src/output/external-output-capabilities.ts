/**
 * Generic external-device capability model for the Output Engine.
 * Vendor adapters (DeckLink today, AJA/NDI later) map into this shape.
 * Operator UI must not depend on DeckLink-specific enums.
 */

export type ExternalPresentationMode = "fill" | "keyFill";

/**
 * How Key + Fill is physically produced:
 * - nativeExternalKey: one scheduleable endpoint; hardware splits Fill/Key connectors
 *   (DeckLink SupportsExternalKeying + IDeckLinkKeyer on UltraStudio HD Mini)
 * - pairedPorts: two independently scheduleable endpoints; NEUD schedules Fill and Key
 */
export type ExternalKeyFillTransport = "nativeExternalKey" | "pairedPorts";

export type ExternalSourceAlphaMode = "straight" | "premultiplied" | "unknown";
export type ExternalFillAlphaMode = "straight" | "premultiplied" | "blackComposite";
export type ExternalKeyPolarity = "whiteOnBlack" | "blackOnWhite" | "unknown";

/** SDK/vendor-translated port capabilities. */
export type ExternalPortCapabilities = {
  /** Can schedule a Fill (color) signal. */
  fill: boolean;
  /** True when any Key + Fill transport is available on this endpoint/device. */
  keyFill: boolean;
  /** Which transport satisfies keyFill; null when keyFill is false. */
  keyFillTransport: ExternalKeyFillTransport | null;
  /** Vendor reports an internal keyer (composites onto input). Distinct from NEUD Key+Fill. */
  keyerInternal: boolean;
  /** Vendor reports an external keyer mode (native Fill/Key connector split when used). */
  keyerExternal: boolean;
  referenceInput: boolean;
  synchronizeToPlaybackGroup: boolean;
  dualLinkSdi: boolean;
  numberOfSubDevices: number;
  deviceGroupId: string | null;
  supportedPixelFormats: string[];
};

export type DeckLinkEndpointCapabilitiesRaw = {
  supportsInternalKeying?: boolean;
  supportsExternalKeying?: boolean;
  supportsDualLinkSdi?: boolean;
  hasReferenceInput?: boolean;
  supportsSynchronizeToPlaybackGroup?: boolean;
  hasKeyerInterface?: boolean;
  numberOfSubDevices?: number;
  deviceGroupId?: number | string;
  /** @deprecated Prefer nativeExternalKeyCandidate / pairedPortsCandidate. */
  physicalKeyFillCandidate?: boolean;
  nativeExternalKeyCandidate?: boolean;
  pairedPortsCandidate?: boolean;
};

/**
 * Resolve Key + Fill transport.
 * Prefer native external keying (one scheduleable endpoint → Fill+Key connectors)
 * over paired independently scheduleable ports.
 */
export function resolveKeyFillTransport(
  raw: DeckLinkEndpointCapabilitiesRaw | null | undefined,
  options?: { siblingPortCount?: number },
): ExternalKeyFillTransport | null {
  const numberOfSubDevices = Number(raw?.numberOfSubDevices ?? 0);
  const siblingPortCount = options?.siblingPortCount ?? numberOfSubDevices;
  const native =
    Boolean(raw?.nativeExternalKeyCandidate) ||
    (Boolean(raw?.supportsExternalKeying) && Boolean(raw?.hasKeyerInterface));
  if (native) return "nativeExternalKey";

  const paired =
    Boolean(raw?.pairedPortsCandidate) ||
    Boolean(raw?.physicalKeyFillCandidate) ||
    siblingPortCount >= 2 ||
    numberOfSubDevices >= 2;
  if (paired) return "pairedPorts";
  return null;
}

export function mapDeckLinkCapabilitiesToExternal(
  raw: DeckLinkEndpointCapabilitiesRaw | null | undefined,
  options?: { siblingPortCount?: number },
): ExternalPortCapabilities {
  const numberOfSubDevices = Number(raw?.numberOfSubDevices ?? 0);
  const keyFillTransport = resolveKeyFillTransport(raw, options);
  return {
    fill: true,
    keyFill: keyFillTransport != null,
    keyFillTransport,
    keyerInternal: Boolean(raw?.supportsInternalKeying),
    keyerExternal: Boolean(raw?.supportsExternalKeying),
    referenceInput: Boolean(raw?.hasReferenceInput),
    synchronizeToPlaybackGroup: Boolean(raw?.supportsSynchronizeToPlaybackGroup),
    dualLinkSdi: Boolean(raw?.supportsDualLinkSdi),
    numberOfSubDevices,
    deviceGroupId:
      raw?.deviceGroupId == null || raw.deviceGroupId === 0 ? null : String(raw.deviceGroupId),
    supportedPixelFormats: [],
  };
}

export function availablePresentationModes(
  capabilities: ExternalPortCapabilities | null | undefined,
): ExternalPresentationMode[] {
  if (!capabilities?.fill) return [];
  return capabilities.keyFill ? ["fill", "keyFill"] : ["fill"];
}

/** True when UI should show separate Fill Port / Key Port selectors. */
export function requiresPairedPortSelection(
  capabilities: ExternalPortCapabilities | null | undefined,
): boolean {
  return capabilities?.keyFillTransport === "pairedPorts";
}

/** Key + Fill route adapter configuration (persisted in route.configuration JSON). */
export type KeyFillRouteConfiguration = {
  presentationMode: "keyFill";
  keyFillTransport: ExternalKeyFillTransport;
  fillEndpointId: string;
  /** Required only for pairedPorts transport. */
  keyEndpointId?: string;
  displayModeId: string;
  modeName: string;
  pixelFormat: string;
  sourceAlphaMode: ExternalSourceAlphaMode;
  /** DeckLink frame alpha after conversion for native keyer (straight). */
  deckLinkFrameAlphaMode?: ExternalSourceAlphaMode;
  fillAlphaMode: ExternalFillAlphaMode;
  keyPolarity: ExternalKeyPolarity;
  frameRateNumerator: number;
  frameRateDenominator: number;
  width: number;
  height: number;
  modelName: string;
  persistentId: string;
};

export function validateKeyFillPortSelection(input: {
  fillEndpointId: string;
  keyEndpointId: string;
  transport?: ExternalKeyFillTransport | null;
}): { ok: true } | { ok: false; error: string } {
  if (input.transport === "nativeExternalKey") {
    if (!input.fillEndpointId) {
      return { ok: false, error: "Key + Fill requires an External Device port." };
    }
    return { ok: true };
  }
  if (!input.fillEndpointId || !input.keyEndpointId) {
    return { ok: false, error: "Key + Fill requires both a Fill Port and a Key Port." };
  }
  if (input.fillEndpointId === input.keyEndpointId) {
    return { ok: false, error: "Fill Port and Key Port must be different." };
  }
  return { ok: true };
}

export function modesAreCompatibleForKeyFill(
  fill: {
    width: number;
    height: number;
    frameRateNumerator: number;
    frameRateDenominator: number;
    fieldDominance?: string;
  },
  key: {
    width: number;
    height: number;
    frameRateNumerator: number;
    frameRateDenominator: number;
    fieldDominance?: string;
  },
): boolean {
  return (
    fill.width === key.width &&
    fill.height === key.height &&
    fill.frameRateNumerator === key.frameRateNumerator &&
    fill.frameRateDenominator === key.frameRateDenominator &&
    (fill.fieldDominance ?? "progressive") === (key.fieldDominance ?? "progressive")
  );
}
