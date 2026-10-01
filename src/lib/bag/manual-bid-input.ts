/** Text shown in the Manual Bid field. Canonical null means an empty input, not $0 or an em dash. */
export function manualBidInputFromCanonical(input: {
  bidDirty: boolean;
  draftLabel: string;
  submittedAmount: number | null;
  formatSubmitted: (amount: number) => string;
}): string {
  if (input.bidDirty && input.draftLabel.trim()) {
    return input.draftLabel;
  }
  if (input.submittedAmount == null || input.submittedAmount <= 0) {
    return "";
  }
  return input.formatSubmitted(input.submittedAmount);
}
