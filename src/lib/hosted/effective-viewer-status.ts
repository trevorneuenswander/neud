export type EffectiveViewerStatus =
  | "connected"
  | "disconnected"
  | "authentication_required"
  | "access_denied"
  | "unavailable";

export type ViewerProbeSummary = {
  code: string | null;
  authorized?: boolean | null;
  publisherOnline?: boolean | null;
  viewerReady?: boolean | null;
  publishedRevisionPresent?: boolean | null;
  attempted?: boolean;
};

export function expectedAnonViewerProbeCode(
  visibility: "private" | "public",
): string {
  return visibility === "private" ? "authentication_required" : "viewer_ready";
}

export function anonProbeMatchesExpectation(
  visibility: "private" | "public",
  code: string | null,
): boolean {
  if (!code) {
    return false;
  }
  return code === expectedAnonViewerProbeCode(visibility);
}

export function resolveEffectiveViewerStatus(input: {
  visibility: "private" | "public";
  onlineViewerEnabled: boolean;
  publishedRevisionPresent: boolean;
  publisherLeaseValid?: boolean | null;
  heartbeatVerifiedInCloud?: boolean | null;
  anonProbe: ViewerProbeSummary;
  authenticatedProbe: ViewerProbeSummary;
}): EffectiveViewerStatus {
  if (!input.onlineViewerEnabled || !input.publishedRevisionPresent) {
    return input.publishedRevisionPresent ? "disconnected" : "unavailable";
  }

  if (input.visibility === "public") {
    if (
      input.anonProbe.code === "viewer_ready" &&
      input.anonProbe.publisherOnline === true
    ) {
      return "connected";
    }
    if (input.anonProbe.code === "authentication_required") {
      return "authentication_required";
    }
    return "disconnected";
  }

  const auth = input.authenticatedProbe;
  if (auth.attempted === false) {
    if (
      input.publisherLeaseValid === true &&
      anonProbeMatchesExpectation("private", input.anonProbe.code)
    ) {
      return "disconnected";
    }
    return "unavailable";
  }

  if (auth.code === "not_found" || auth.authorized === false) {
    return "access_denied";
  }

  if (
    auth.viewerReady === true ||
    (auth.code === "viewer_ready" && auth.publisherOnline === true)
  ) {
    return "connected";
  }

  if (auth.code === "authentication_required") {
    return "authentication_required";
  }

  if (
    input.publisherLeaseValid === true &&
    anonProbeMatchesExpectation("private", input.anonProbe.code)
  ) {
    return "disconnected";
  }

  return "unavailable";
}
