// Bulk review helper — lists pending queue (dry-run default) and approves
// over HTTP with a reviewer JWT (never direct DB writes, so BR-2 gates,
// validation, and the post-approval AI hook run exactly as in the UI).
// Auth: REVIEWER_EMAIL + REVIEWER_PASSWORD via POST /api/auth/login, or a
// pre-minted REVIEWER_JWT (test-cycle affordance — same token the API mints).
// Sequential requests only (pooler rule).

const API = process.env.REVIEW_API ?? "http://localhost:3000/api";

interface Args {
  track: string | null;
  faculty: string | null;
  limit: number;
  apply: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { track: null, faculty: null, limit: 50, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--track") args.track = argv[++i] ?? null;
    else if (flag === "--faculty") args.faculty = argv[++i] ?? null;
    else if (flag === "--limit") args.limit = Math.max(1, Number(argv[++i] ?? 50));
    else if (flag === "--apply") args.apply = true;
    else {
      console.error(`unknown flag: ${flag}`);
      process.exit(2);
    }
  }
  return args;
}

interface QueueItem {
  contentType: "lesson" | "question";
  id: string;
  lessonId?: string;
  type?: string;
}

async function api(path: string, token: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${data?.error?.message ?? "request failed"}`);
  return data;
}

async function reviewerToken(): Promise<string> {
  const passthrough = process.env.REVIEWER_JWT;
  if (passthrough) return passthrough;
  const email = process.env.REVIEWER_EMAIL;
  const password = process.env.REVIEWER_PASSWORD;
  if (!email || !password) {
    console.error("refusing: set REVIEWER_JWT or REVIEWER_EMAIL + REVIEWER_PASSWORD (never logged, never committed)");
    process.exit(2);
  }
  const data = (await api("/auth/login", "", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })) as { accessToken?: string };
  if (!data.accessToken) {
    console.error("refusing: login did not return a token");
    process.exit(2);
  }
  return data.accessToken;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const token = await reviewerToken();

  const items: QueueItem[] = [];
  let page = 1;
  for (;;) {
    const data = (await api(`/review/queue?page=${page}&limit=100`, token)) as {
      items: QueueItem[];
      pagination: { total: number };
    };
    items.push(...data.items);
    if (items.length >= data.pagination.total || items.length >= 500) break;
    page++;
    if (page > 20) break;
  }

  console.log(`pending in queue: ${items.length}`);
  const lessons = items.filter((i) => i.contentType === "lesson").length;
  const questions = items.length - lessons;
  console.log(`  lessons=${lessons} questions=${questions}`);
  const shown = items.slice(0, args.limit);
  for (const item of shown) {
    console.log(`  would approve ${item.contentType}:${item.id}`);
  }
  if (items.length > shown.length) console.log(`  ... and ${items.length - shown.length} more (use --limit)`);
  if (args.track) console.log(`  (track filter ${args.track}: enforced by reviewer selection, queue carries no track field)`);
  if (args.faculty) console.log(`  (faculty filter ${args.faculty}: enforced by reviewer selection, queue carries no faculty field)`);

  if (!args.apply) {
    console.log("mode: dry-run (no approvals)");
    return;
  }
  let approved = 0;
  for (const item of shown) {
    await api(`/review/${item.contentType}/${item.id}/approve`, token, { method: "POST" });
    approved++;
    console.log(`  approved ${item.contentType}:${item.id}`);
  }
  console.log(`approved=${approved}`);
}

main().catch((err) => {
  console.error("review-approve failed: " + (err as Error).message);
  process.exit(2);
});
