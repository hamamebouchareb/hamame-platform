interface RichTextBlock {
  type?: string;
  text?: string;
}

interface RichTextDoc {
  blocks?: RichTextBlock[];
  text?: string;
}

/**
 * The seed data uses two slightly different rich-text shapes: lessons store
 * { blocks: [{ type, text }] }, while questions/explanations store { text }. This pulls
 * plain-text paragraphs out of either shape without building a full rich-text
 * renderer (out of scope for now) — good enough to display readable content.
 */
export function extractParagraphs(doc: unknown): string[] {
  if (!doc || typeof doc !== "object") return [];
  const record = doc as RichTextDoc;

  if (Array.isArray(record.blocks)) {
    return record.blocks
      .map((block) => block?.text)
      .filter((text): text is string => typeof text === "string" && text.length > 0);
  }

  if (typeof record.text === "string" && record.text.length > 0) {
    return [record.text];
  }

  return [];
}
