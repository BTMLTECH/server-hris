export function formatTimeLeft(minutes: number): string {
  const weeks = Math.floor(minutes / (7 * 24 * 60));
  if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''}`;

  const days = Math.floor(minutes / (24 * 60));
  if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;

  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours} hr${hours > 1 ? 's' : ''}`;

  return `${minutes} min${minutes > 1 ? 's' : ''}`;
}
