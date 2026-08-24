# Hamame — User Deletion & Cascade Policy (Fix for FR-8 / NFR-5 gap)

**Problem:** `schema.prisma` currently has no explicit `onDelete` behavior anywhere, so
every relation defaults to Prisma's implicit rule (`Restrict` for required FKs, `SetNull`
for optional FKs). That means deleting a `User` row fails the moment they have any
activity — breaking FR-8 (account deletion) and NFR-5 (Law 18-07 deletion-request
compliance).

**Fix, two parts:**

## Part 1 — Account deletion is a soft delete, not a row delete

`User.status` already has a `'deleted'` value defined. **Use it as the actual deletion
mechanism**, not a real `DELETE FROM users`:

- On a deletion request (`DELETE /api/users/me`), set `status = 'deleted'` and scrub PII
  fields (`email`, `phone`, `fullName`, `profilePhotoUrl` → replaced with anonymized
  placeholders; `passwordHash` invalidated).
- The `User` row and its `id` stay intact, so every foreign key referencing it
  (subscriptions, payments, authored content, moderation reports) stays valid — no
  cascade or restrict decision is even triggered for the normal deletion flow.
- This is the correct approach specifically *because* `subscriptions`/`payments` are
  financial records that generally need retention for accounting/legal purposes even
  after a user asks to be forgotten — hard-deleting the `User` row would conflict with
  that.

## Part 2 — Explicit `onDelete` for the cases that do need it

Even with soft delete as the primary path, add explicit `onDelete` values below so the
schema is correct if a hard delete is ever performed directly (admin tooling, data
purge after a retention period, etc.) instead of relying on Prisma's implicit defaults
silently doing the wrong thing.

### Add `onDelete: Cascade` (personal, non-financial, non-authored-content data — safe
to delete immediately with the user):

```prisma
model UserRole {
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  ...
}

model NotificationPreference {
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  ...
}

model StudySession {
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  ...
}

model Note {
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  ...
}

model Progress {
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  ...
}

model Streak {
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  ...
}

model ReviewSettings {
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  ...
}

model ReviewQueueItem {
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  ...
}

model UserBadge {
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  ...
}

model LeaderboardSnapshot {
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  ...
}

model Friendship {
  userA User @relation("FriendshipUserA", fields: [userIdA], references: [id], onDelete: Cascade)
  userB User @relation("FriendshipUserB", fields: [userIdB], references: [id], onDelete: Cascade)
  ...
}

model AiInteraction {
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  ...
}

model AiCreditBalance {
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  ...
}
```

Also cascade the child rows underneath `StudySession`, so a hard delete of a session
doesn't get blocked by its own children:

```prisma
model SessionQuestion {
  session StudySession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  ...
}

model Attempt {
  sessionQuestion SessionQuestion @relation(fields: [sessionQuestionId], references: [id], onDelete: Cascade)
  ...
}
```

### Leave as `Restrict` (deliberate — keep the current default, do NOT change):

- `LessonVersion.authoredBy → User` — an instructor's authored content must not vanish
  or fail silently if their account is hard-deleted; forces an admin to reassign/archive
  content first.
- `Institution.adminUserId → User` — same reasoning for institutional admins.
- `Subscription.userId → User` and (transitively) `Payment` — financial records; this
  is exactly why Part 1's soft-delete approach exists, so this Restrict is never even
  reached in the normal flow.
- `Report.reporterUserId → User` — moderation audit trail.

### Leave as `SetNull` (already optional FKs, current default is already correct):

- `LessonVersion.reviewedBy`
- `Question.authoredBy`, `Question.reviewedBy`
- `Report.resolvedBy`

---

## Prompt to give Cursor

```
Read docs/hamame-user-deletion-policy.md.

Update prisma/schema.prisma to add the explicit onDelete: Cascade values listed in
"Part 2" of that document, to the exact relations listed — do not change any other
relation, and do not add onDelete to relations not mentioned there.

Then implement the actual account-deletion behavior described in "Part 1": update the
DELETE /api/users/me handler in src/routes/users.routes.ts (currently a stub) so it
performs a soft delete — set status to 'deleted' and scrub email, phone, fullName, and
profilePhotoUrl to anonymized placeholder values, rather than deleting the row.

Generate a new Prisma migration for the onDelete changes (npx prisma migrate dev --name
add_cascade_deletes). Do not modify any other part of the schema.
```
