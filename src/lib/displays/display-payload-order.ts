export function shouldApplyDisplayPayload(input: {
  fetchRequestId?: string | null;
  latestAppliedFetchRequestId?: string | null;
  revision?: number | null;
  latestRevision?: number | null;
}): boolean {
  if (
    input.fetchRequestId &&
    input.latestAppliedFetchRequestId &&
    Number(input.fetchRequestId) < Number(input.latestAppliedFetchRequestId)
  ) {
    return false;
  }
  if (
    input.revision != null &&
    input.latestRevision != null &&
    input.revision < input.latestRevision
  ) {
    return false;
  }
  return true;
}
