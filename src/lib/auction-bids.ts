export function mergeAuctionBidPages<T extends { id: string; timestamp: string }>(incoming: T[], current: T[]): T[] {
  const byId = new Map<string, T>();
  for (const bid of [...current, ...incoming]) byId.set(bid.id, bid);
  return [...byId.values()].sort((left, right) => {
    const timeDifference = new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime();
    return timeDifference || right.id.localeCompare(left.id);
  });
}
