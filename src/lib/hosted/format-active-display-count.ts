export function formatActiveDisplayCount(count: number): string {
  if (count === 0) {
    return "No Active Displays";
  }
  if (count === 1) {
    return "1 Active Display";
  }
  return `${count} Active Displays`;
}
