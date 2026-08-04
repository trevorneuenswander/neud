function readLotSortKey(lotNumber: string): { prefix: number; suffix: string } {
  const trimmed = lotNumber.replace(/^lot\s+/i, "").trim();
  const match = trimmed.match(/^(\d+)(.*)$/i);
  if (!match) {
    return { prefix: Number.MAX_SAFE_INTEGER, suffix: trimmed.toLowerCase() };
  }
  return {
    prefix: Number.parseInt(match[1], 10),
    suffix: (match[2] ?? "").toLowerCase(),
  };
}

export function compareLotNumbers(left: string, right: string): number {
  const leftKey = readLotSortKey(left);
  const rightKey = readLotSortKey(right);
  if (leftKey.prefix !== rightKey.prefix) {
    return leftKey.prefix - rightKey.prefix;
  }
  if (leftKey.suffix !== rightKey.suffix) {
    return leftKey.suffix.localeCompare(rightKey.suffix, undefined, { numeric: true });
  }
  return left.localeCompare(right, undefined, { numeric: true });
}
