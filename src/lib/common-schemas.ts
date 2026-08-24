import { z } from "zod";

// Shared fragments reused across route files to keep validation consistent with the
// Prisma schema (prisma/schema.prisma) and docs/hamame_api_contract.md.

export const uuidParam = (name: string) => z.object({ [name]: z.string().uuid() });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// Loose shape for JSONB rich-text fields (lesson_versions.body_richtext,
// questions.body_richtext / explanation_richtext, ...). The actual rich-text document
// format is a frontend/editor concern outside this PRD/schema's scope, so this only
// validates "is a JSON object", not its internal structure.
export const jsonObject = z.record(z.string(), z.unknown());
