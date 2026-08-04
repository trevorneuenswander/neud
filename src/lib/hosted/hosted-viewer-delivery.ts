/** Revision-specific hosted viewer delivery helpers (no payload values). */

export function shouldDeliverCanonicalRevision(input: {
  targetRevision: number | null;
  lastAcknowledgedRevision: number | null;
  iframeBooted: boolean;
}): boolean {
  if (!input.iframeBooted) {
    return false;
  }
  if (input.targetRevision == null) {
    return true;
  }
  return input.lastAcknowledgedRevision !== input.targetRevision;
}

export function shouldDeliverCanonicalPayload(input: {
  targetRevision: number | null;
  targetFingerprint: string | null;
  lastAcknowledgedRevision: number | null;
  lastAcknowledgedFingerprint: string | null;
  iframeBooted: boolean;
}): boolean {
  if (!input.iframeBooted) {
    return false;
  }

  const fingerprintChanged =
    input.targetFingerprint != null &&
    input.targetFingerprint !== input.lastAcknowledgedFingerprint;

  if (fingerprintChanged) {
    return true;
  }

  return shouldDeliverCanonicalRevision({
    targetRevision: input.targetRevision,
    lastAcknowledgedRevision: input.lastAcknowledgedRevision,
    iframeBooted: input.iframeBooted,
  });
}

export function shouldApplyRevisionStatus(input: {
  statusRevision: number | null;
  latestRevision: number | null;
  lastAppliedRevision: number | null;
}): boolean {
  if (input.statusRevision == null) {
    return true;
  }
  if (input.latestRevision != null && input.statusRevision === input.latestRevision) {
    return true;
  }
  if (input.lastAppliedRevision == null) {
    return true;
  }
  return input.statusRevision >= input.lastAppliedRevision;
}
