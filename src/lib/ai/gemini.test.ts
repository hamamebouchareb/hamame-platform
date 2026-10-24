import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  DEFAULT_GEMINI_MODEL,
  GeminiError,
  classifyGeminiError,
  getGeminiModel,
  injectGeminiJsonForTests,
  redactKeyLike,
  validatedJsonResult,
} from "./gemini";

// Mocked (no network, no key needed): pins the provider-error classification table
// and the test-injection seam's guards. Nothing here calls Google.

describe("classifyGeminiError", () => {
  it("maps resource exhaustion and 429 to QUOTA_EXHAUSTED", () => {
    assert.equal(classifyGeminiError(new Error('[429] RESOURCE_EXHAUSTED: "quota exceeded"')), "QUOTA_EXHAUSTED");
    assert.equal(classifyGeminiError(new Error("Rate limit hit (429)")), "QUOTA_EXHAUSTED");
    assert.equal(
      classifyGeminiError(
        new Error('{"error":{"code":429,"message":"You exceeded your current quota","status":"RESOURCE_EXHAUSTED"}}')
      ),
      "QUOTA_EXHAUSTED"
    );
  });

  it("maps unauthenticated/permission errors to CONFIGURATION", () => {
    assert.equal(classifyGeminiError(new Error("[401] API key not valid.")), "CONFIGURATION");
    assert.equal(classifyGeminiError(new Error("[403] PERMISSION_DENIED")), "CONFIGURATION");
  });

  it("maps invalid requests to INVALID_REQUEST", () => {
    assert.equal(classifyGeminiError(new Error("[400] INVALID_ARGUMENT: bad schema")), "INVALID_REQUEST");
  });

  it("maps availability problems before generic provider errors", () => {
    assert.equal(classifyGeminiError(new Error("[503] UNAVAILABLE: high demand")), "PROVIDER_UNAVAILABLE");
    assert.equal(classifyGeminiError(new Error("model is currently experiencing high demand")), "PROVIDER_UNAVAILABLE");
  });

  it("maps timeouts to TIMEOUT", () => {
    assert.equal(classifyGeminiError(new Error("Request timed out")), "TIMEOUT");
  });

  it("maps unknown failures to PROVIDER_ERROR without leaking a key", () => {
    const classified = classifyGeminiError(new Error("weird AQ.FAKEREDACTIONSAMPLE000000000000 failure"));
    assert.equal(classified, "PROVIDER_ERROR");
    assert.doesNotMatch(redactKeyLike("AQ.FAKEREDACTIONSAMPLE000000000000"), /AQ\./);
  });
});

describe("redactKeyLike", () => {
  it("redacts both observed Google key shapes", () => {
    assert.equal(redactKeyLike("Bearer AIzaSyVeryLongSecretKey1234567890 done"), "Bearer [redacted] done");
    assert.equal(redactKeyLike("key=AQ.Ab8RVeryLongSecret more"), "key=[redacted] more");
  });
});

describe("getGeminiModel", () => {
  const original = process.env.GEMINI_MODEL;
  afterEach(() => {
    if (original === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = original;
  });

  it("defaults to the verified free-tier model", () => {
    delete process.env.GEMINI_MODEL;
    assert.equal(getGeminiModel(), DEFAULT_GEMINI_MODEL);
    assert.equal(DEFAULT_GEMINI_MODEL, "gemini-3.5-flash");
  });

  it("rejects a model id with URL-hostile characters (fail loud, never pass through)", () => {
    process.env.GEMINI_MODEL = "evil/../../admin";
    assert.throws(() => getGeminiModel(), GeminiError);
    assert.throws(() => getGeminiModel(), (err: unknown) => (err as GeminiError).kind === "CONFIGURATION");
  });
});

describe("injectGeminiJsonForTests guards", () => {
  const original = process.env.HAMAME_AI_TEST_STUB;
  beforeEach(() => {
    delete process.env.HAMAME_AI_TEST_STUB;
    injectGeminiJsonForTests(null);
  });
  afterEach(() => {
    if (original === undefined) delete process.env.HAMAME_AI_TEST_STUB;
    else process.env.HAMAME_AI_TEST_STUB = original;
    injectGeminiJsonForTests(null);
  });

  it("refuses to arm a stub without the explicit HAMAME_AI_TEST_STUB=1 flag", () => {
    const stub = async () => ({ data: null, usage: { inputTokens: 0, outputTokens: 0 }, model: "stub", timeoutMs: 1 });
    assert.throws(() => injectGeminiJsonForTests(stub), /HAMAME_AI_TEST_STUB/);
  });

  it("arms a stub only when the flag is set, and clearing always disarms", () => {
    const stub = async () => ({ data: null, usage: { inputTokens: 0, outputTokens: 0 }, model: "stub", timeoutMs: 1 });
    process.env.HAMAME_AI_TEST_STUB = "1";
    injectGeminiJsonForTests(stub);
    injectGeminiJsonForTests(null);
  });
});

describe("validatedJsonResult", () => {
  const schema = z.object({ a: z.number().int() });
  it("returns parsed data for a valid payload", () => {
    const value = validatedJsonResult({ data: { a: 3 }, usage: { inputTokens: 1, outputTokens: 1 }, model: "m", timeoutMs: 1 }, schema, "test");
    assert.deepEqual(value, { a: 3 });
  });

  it("throws SCHEMA_INVALID on a malformed payload (the zod check is the contract)", () => {
    assert.throws(
      () => validatedJsonResult({ data: { a: "no" }, usage: { inputTokens: 1, outputTokens: 1 }, model: "m", timeoutMs: 1 }, schema, "test"),
      (err: unknown) => (err as GeminiError).kind === "SCHEMA_INVALID"
    );
  });
});
