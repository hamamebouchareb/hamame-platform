import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LegalDoc } from "@/components/LegalDoc";
import { LegalBackRow } from "@/components/LegalBackRow";
import { Footer } from "@/components";

/**
 * Public Privacy Policy — same shape as /terms: no login, no onboarding
 * gate, both language sources read from disk at build time, FR/EN picked
 * client-side from LanguageContext.
 */
function readLegal(name: string): string {
  return readFileSync(join(process.cwd(), "src", "content", "legal", name), "utf8");
}

export default function PrivacyPage() {
  const fr = readLegal("privacy.fr.md");
  const en = readLegal("privacy.en.md");
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
