// Lists unfilled [PLACEHOLDER] markers in the legal sources
// (web/src/content/legal/*.md): square-bracket text starting with an
// uppercase letter. Exits 1 while any remain, 0 when the drafts are final.
// Standalone check only — deliberately NOT wired into `next build`.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "content", "legal");
const files = readdirSync(dir)
  .filter((n) => n.endsWith(".md"))
  .sort();
const marker = /\[[A-ZÀ-Þ][^\]\n]*\]/g;

let remaining = 0;
for (const name of files) {
  const lines = readFileSync(join(dir, name), "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const m of line.match(marker) ?? []) {
      remaining += 1;
      console.log(`${name}:${i + 1}: ${m}`);
    }
  });
}
if (remaining > 0) {
  console.log(`${remaining} placeholder(s) remain`);
  process.exit(1);
}
console.log("no placeholders remain");
