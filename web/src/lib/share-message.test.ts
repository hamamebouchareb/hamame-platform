import test from "node:test";
import assert from "node:assert/strict";
import { parseShare, SHARE_PREFIX } from "./share-message";

test("parseShare allows https and strict file base64 allowlist, rejects dangerous data URLs", () => {
  const allowed = [
    "https://example.com/file.pdf",
    "data:application/pdf;base64,JVBERi0xLjQK",
    "data:text/plain;base64,SGVsbG8=",
    "data:text/csv;base64,YSxiCjEsMg==",
  ];
  for (const url of allowed) {
    const parsed = parseShare(
      SHARE_PREFIX + JSON.stringify({ kind: "file", name: "doc", mime: "application/pdf", size: 10, url })
    );
    assert.ok(parsed && parsed.kind === "file", `Expected allowed url: ${url}`);
  }

  const rejected = [
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+",
    "javascript:alert(1)",
    "http://example.com/file.pdf",
  ];
  for (const url of rejected) {
    const parsed = parseShare(
      SHARE_PREFIX + JSON.stringify({ kind: "file", name: "evil.html", mime: "text/html", size: 10, url })
    );
    assert.equal(parsed, null, `Expected rejected url: ${url}`);
  }
});
