import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LegalDoc } from "@/components/LegalDoc";
import { LegalBackRow } from "@/components/LegalBackRow";
import { Footer } from "@/components";

/**
 * Public Terms of Use (no login, no onboarding gate — this page never calls
 * useRequireAuth). Both language sources are read from disk at build time
 * (fs in a server component prerenders into the static bundle, which is why
 * this keeps working identically under `next build` + `next start`); the
 * client renderer picks FR/EN from LanguageContext at view time.
 */
function readLegal(name: string): string {
  return readFileSync(join(process.cwd(), "src", "content", "legal", name), "utf8");
}

export default function TermsPage() {
  const fr = readLegal("terms.fr.md");
  const en = readLegal("terms.en.md");
  return (
    <>
      <main className="mx-auto w-full max-w-3xl flex-1 px-card-padding py-section-gap">
        <LegalBackRow />
        <div className="mt-4">
          <LegalDoc fr={fr} en={en} />
        </div>
      </main>
      <Footer />
    </>
  );
}
