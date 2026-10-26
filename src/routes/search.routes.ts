import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { validateQuery } from "../middleware/validate";
import { resolveViewerUniversityId } from "../lib/university-scope";

const router = Router();
router.use(requireAuth);

const querySchema = z.object({
  q: z.string().trim().min(2).max(80),
});

function snippet(raw: string): string {
  return raw
    .replace(/[{}"\\[\]]/g, " ")
    .replace(/\b(text|type|content|attrs)\s*:/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

// GET /api/search?q= — one box for words in lessons, modules, questions,
// resources, and people. Approved / visible content only. A person matches
// any word in their name, or their email exactly.
async function search(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.auth!.userId;
    const { q } = req.query as unknown as z.infer<typeof querySchema>;
    const pattern = likePattern(q);
    const universityId = await resolveViewerUniversityId(prisma, userId);

    const lessons = universityId
      ? await prisma.$queryRaw<{ id: string; title: string }[]>`
          SELECT l.id, l.title
          FROM lessons l
          JOIN units u ON u.id = l.unit_id
          JOIN modules m ON m.id = u.module_id
          JOIN years y ON y.id = m.year_id
          JOIN faculties f ON f.id = y.faculty_id
          LEFT JOIN lesson_versions v ON v.id = l.current_version_id
          WHERE l.current_version_id IS NOT NULL
            AND f.rollout_status IN ('beta', 'live')
            AND (l.university_id IS NULL OR l.university_id = ${universityId}::uuid)
            AND (l.title ILIKE ${pattern} OR v.body_richtext::text ILIKE ${pattern})
          LIMIT 5`
      : await prisma.$queryRaw<{ id: string; title: string }[]>`
          SELECT l.id, l.title
          FROM lessons l
          JOIN units u ON u.id = l.unit_id
          JOIN modules m ON m.id = u.module_id
          JOIN years y ON y.id = m.year_id
          JOIN faculties f ON f.id = y.faculty_id
          LEFT JOIN lesson_versions v ON v.id = l.current_version_id
          WHERE l.current_version_id IS NOT NULL
            AND f.rollout_status IN ('beta', 'live')
            AND l.university_id IS NULL
            AND (l.title ILIKE ${pattern} OR v.body_richtext::text ILIKE ${pattern})
          LIMIT 5`;

    const modules = await prisma.module.findMany({
      where: {
        name: { contains: q, mode: "insensitive" },
        year: { faculty: { rolloutStatus: { in: ["beta", "live"] } } },
      },
      select: { id: true, name: true },
      take: 5,
    });

    const resources = await prisma.resource.findMany({
      where: {
        title: { contains: q, mode: "insensitive" },
        OR: [{ facultyId: null }, { faculty: { rolloutStatus: { in: ["beta", "live"] } } }],
      },
      select: { id: true, title: true },
      take: 5,
    });

    const questionRows = universityId
      ? await prisma.$queryRaw<{ id: string; unit_id: string; unit_name: string; body: string }[]>`
          SELECT q.id, u.id AS unit_id, u.name AS unit_name, left(q.body_richtext::text, 220) AS body
          FROM questions q
          JOIN units u ON u.id = q.unit_id
          JOIN modules m ON m.id = u.module_id
          JOIN years y ON y.id = m.year_id
          JOIN faculties f ON f.id = y.faculty_id
          WHERE q.status = 'approved'
            AND f.rollout_status IN ('beta', 'live')
            AND (q.university_id IS NULL OR q.university_id = ${universityId}::uuid)
            AND q.body_richtext::text ILIKE ${pattern}
          LIMIT 5`
      : await prisma.$queryRaw<{ id: string; unit_id: string; unit_name: string; body: string }[]>`
          SELECT q.id, u.id AS unit_id, u.name AS unit_name, left(q.body_richtext::text, 220) AS body
          FROM questions q
          JOIN units u ON u.id = q.unit_id
          JOIN modules m ON m.id = u.module_id
          JOIN years y ON y.id = m.year_id
          JOIN faculties f ON f.id = y.faculty_id
          WHERE q.status = 'approved'
            AND f.rollout_status IN ('beta', 'live')
            AND q.university_id IS NULL
            AND q.body_richtext::text ILIKE ${pattern}
          LIMIT 5`;

    const people = await prisma.user.findMany({
      where: {
        id: { not: userId },
        status: { not: "deleted" },
        OR: [
          { email: { equals: q, mode: "insensitive" } },
          { fullName: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, fullName: true },
      take: 5,
    });

    res.status(200).json({
      lessons: lessons.map((row) => ({ id: row.id, title: row.title })),
      modules: modules.map((row) => ({ id: row.id, title: row.name })),
      resources: resources.map((row) => ({ id: row.id, title: row.title })),
      questions: questionRows.map((row) => ({
        id: row.id,
        unitId: row.unit_id,
        title: snippet(row.body),
        hint: row.unit_name,
      })),
      people: people.map((row) => ({ id: row.id, title: row.fullName ?? "—" })),
    });
  } catch (err) {
    next(err);
  }
}

router.get("/", validateQuery(querySchema), search);

export default router;
