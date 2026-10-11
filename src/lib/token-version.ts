// Token security epoch: every JWT carries the user's tokenVersion, and the
// auth middleware rejects tokens whose version no longer matches the row.
// Pure comparison — a missing claim (tokens issued before this shipped) is
// grandfathered as version 1, matching the column DEFAULT.
export function isTokenCurrent(claim: number | null, rowVersion: number): boolean {
  return (claim ?? 1) === rowVersion;
}
