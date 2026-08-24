import { PrismaClient } from "@prisma/client";

// FR-10a per-university content scoping, LAYERED (not siloed). Content whose universityId
// is null is global/shared and visible to everyone; content with a universityId is visible
// only to viewers at that university. This composes with — never replaces — the existing
// faculty rolloutStatus gate and the BR-2 status gate, via AND.
//
// Kept in one place, shared by every gated query (question-filters.ts,
// curriculum.routes.ts, flashcard-from-question.ts), for the same reason the faculty
// traversal is shared: three hand-rolled copies of a visibility predicate is how one of
// them silently drifts into a leak.

// Resolves the viewer's university, and deliberately reads it from the database per
// request rather than taking it from a JWT claim: tokens have a 7-day TTL, so a claim
// could keep granting (or denying) access to another university's content long after the
// profile changed. One extra sequential query is the cheaper side of that trade.
//
// `undefined` userId means an unauthenticated request — curriculum browsing and the
// question bank are both public — and resolves to null, i.e. global content only.
export async function resolveViewerUniversityId(
  client: PrismaClient,
  userId: string | undefined
): Promise<string | null> {
  if (!userId) {
    return null;
  }
  const user = await client.user.findUnique({ where: { id: userId }, select: { universityId: true } });
  return user?.universityId ?? null;
}

// The scoping predicate itself.
//
// MUST be applied UNCONDITIONALLY, exactly like the rolloutStatus gate — never wrapped in
// `if (viewerUniversityId)`. A viewer with no university (a guest, or a student who hasn't
// completed their profile) has to resolve to global-content-only; skipping the filter for
// them instead would expose every university's scoped content to anonymous callers, which
// is the same bug class as the faculty-visibility leaks fixed previously.
//
// Also note the shape: this is an explicit OR against null, never `{ in: [null, id] }`.
// SQL `IN` uses `= NULL` semantics, so an `in` list containing null matches NOTHING and
// would hide all global content from everyone.
export function universityScopeFilter(viewerUniversityId: string | null): {
  OR?: { universityId: string | null }[];
  universityId?: null;
} {
  if (viewerUniversityId === null) {
    return { universityId: null };
  }
  return { OR: [{ universityId: null }, { universityId: viewerUniversityId }] };
}
