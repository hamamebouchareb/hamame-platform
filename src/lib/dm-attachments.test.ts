import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  validateAttachment,
} from "./dm-attachments";

// 1x1 transparent PNG, 70 bytes.
const TINY_PNG =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAX+y1DAAAAABJRU5ErkJggg==";

const TINY_PDF = "data:application/pdf;base64," + Buffer.from("%PDF-1.4 minimal").toString("base64");

test("accepts a well-formed tiny image attachment", () => {
  const out = validateAttachment({ kind: "image", name: "schema.png", mime: "image/png", dataUrl: TINY_PNG });
  assert.equal(out.name, "schema.png");
  assert.ok(out.size > 0 && out.size <= MAX_IMAGE_BYTES);
});

test("accepts a well-formed pdf file attachment", () => {
  const out = validateAttachment({ kind: "file", name: "cours.pdf", mime: "application/pdf", dataUrl: TINY_PDF });
  assert.equal(out.mime, "application/pdf");
  assert.ok(out.size > 0 && out.size <= MAX_FILE_BYTES);
});

test("rejects unsupported mime prefixes (image sent as file kind)", () => {
  assert.throws(
    () => validateAttachment({ kind: "file", name: "a.png", mime: "image/png", dataUrl: TINY_PNG }),
    (err: unknown) => (err as { code?: string }).code === "ATTACHMENT_TYPE_UNSUPPORTED"
  );
});

test("rejects office/zip formats that we cannot verify", () => {
  const docx = "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,AAAA";
  assert.throws(
    () => validateAttachment({ kind: "file", name: "a.docx", mime: docx.slice(5, docx.indexOf(";")), dataUrl: docx }),
    (err: unknown) => (err as { code?: string }).code === "ATTACHMENT_TYPE_UNSUPPORTED"
  );
});

test("rejects oversized image payloads", () => {
  const big = "data:image/png;base64," + "A".repeat(Math.floor((MAX_IMAGE_BYTES + 1024) / 3) * 4);
  assert.throws(
    () => validateAttachment({ kind: "image", name: "big.png", mime: "image/png", dataUrl: big }),
    (err: unknown) => String((err as { code?: string }).code ?? "").startsWith("ATTACHMENT")
  );
});

test("rejects dataUrl whose charset is url-encoded rather than base64", () => {
  assert.throws(
    () => validateAttachment({ kind: "image", name: "x.png", mime: "image/png", dataUrl: "data:image/png;charset=utf-8," }),
    (err: unknown) => (err as { code?: string }).code === "ATTACHMENT_TYPE_UNSUPPORTED"
  );
});

test("rejects empty and whitespace-only attachments", () => {
  assert.throws(
    () => validateAttachment({ kind: "file", name: "x.pdf", mime: "application/pdf", dataUrl: "data:application/pdf;base64," }),
    (err: unknown) => (err as { code?: string }).code === "ATTACHMENT_INVALID"
  );
  assert.throws(
    () => validateAttachment({ kind: "file", name: "  ", mime: "application/pdf", dataUrl: TINY_PDF }),
    (err: unknown) => (err as { code?: string }).code === "ATTACHMENT_INVALID"
  );
});

test("rejects text/csv preamble offered as image kind", () => {
  const csv = "data:text/csv;base64," + Buffer.from("a,b\n1,2").toString("base64");
  assert.throws(
    () => validateAttachment({ kind: "image", name: "x.png", mime: "text/csv", dataUrl: csv }),
    (err: unknown) => (err as { code?: string }).code === "ATTACHMENT_TYPE_UNSUPPORTED"
  );
});

test("accepts text/csv as file kind", () => {
  const csv = "data:text/csv;base64," + Buffer.from("a,b\n1,2").toString("base64");
  const out = validateAttachment({ kind: "file", name: "notes.csv", mime: "text/csv", dataUrl: csv });
  assert.equal(out.kind, "file");
});

test("rejects mime mismatch between declared mime and dataUrl", () => {
  assert.throws(
    () => validateAttachment({ kind: "image", name: "evil.png", mime: "image/jpeg", dataUrl: TINY_PNG }),
    (err: unknown) => (err as { code?: string }).code === "ATTACHMENT_TYPE_UNSUPPORTED"
  );
});

test("quote-preserved name is sanitised of control characters", () => {
  const out = validateAttachment({ kind: "image", name: "my\rnew\nname.png", mime: "image/png", dataUrl: TINY_PNG });
  assert.equal(out.name, "my new name.png");
});
