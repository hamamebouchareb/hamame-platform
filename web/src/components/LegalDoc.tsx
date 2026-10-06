"use client";

import { useLanguage } from "@/context/LanguageContext";

type LegalBlock =
  | { kind: "title"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

/**
 * Tiny legal-markdown renderer. Supports ONLY "##" (page title), "###"
 * (section heading), paragraphs, and "- " bullets. Everything renders as
 * plain React text nodes — never raw HTML, no link parsing — so pasted
 * markup in the source files can never become live markup.
 */
function parseLegalDoc(source: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  const pendingBullets: string[] = [];
  const flushBullets = () => {
    if (pendingBullets.length > 0) {
      blocks.push({ kind: "list", items: [...pendingBullets] });
      pendingBullets.length = 0;
    }
  };
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (line.length === 0) {
      flushBullets();
      continue;
    }
    if (line.startsWith("## ")) {
      flushBullets();
      blocks.push({ kind: "title", text: line.slice(3).trim() });
    } else if (line.startsWith("### ")) {
      flushBullets();
      blocks.push({ kind: "heading", text: line.slice(4).trim() });
    } else if (line.startsWith("- ")) {
      pendingBullets.push(line.slice(2).trim());
    } else {
      flushBullets();
      blocks.push({ kind: "paragraph", text: line });
    }
  }
  flushBullets();
  return blocks;
}

export function LegalDoc({ fr, en }: { fr: string; en: string }) {
  const { lang } = useLanguage();
  const blocks = parseLegalDoc(lang === "en" ? en : fr);
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((block, index) => {
        if (block.kind === "title") {
          return (
            <h1 key={index} className="font-display text-h2 font-bold text-text-primary sm:text-h1">
              {block.text}
            </h1>
          );
        }
        if (block.kind === "heading") {
          return (
            <h2 key={index} className="mt-2 font-display text-h3 font-semibold text-text-primary">
              {block.text}
            </h2>
          );
        }
        if (block.kind === "list") {
          return (
            <ul key={index} className="flex list-disc flex-col gap-1 pl-6">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="text-body text-text-primary">
                  {item}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="text-body text-text-primary">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
