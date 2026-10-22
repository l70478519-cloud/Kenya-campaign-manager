/** Missing evidence stays missing. This module does not forecast elections. */
export function validRate(value: unknown): number | null {
  if ((typeof value !== "number" && typeof value !== "string") || value === "")
    return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}
export function historicalTurnout(
  votes: number,
  sameElectionRegistered: number | null,
): number | null {
  if (
    !sameElectionRegistered ||
    !Number.isFinite(votes) ||
    votes < 0 ||
    votes > sameElectionRegistered
  )
    return null;
  return Math.round((votes / sameElectionRegistered) * 1000) / 10;
}
