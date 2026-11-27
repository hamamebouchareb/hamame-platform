import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  DEFAULT_GEMINI_MODEL,
  FAST_FALLBACK_GEMINI_MODEL,
  GeminiError,
  classifyGeminiError,
  generateGeminiJson,
  getGeminiModel,
  injectGeminiJsonForTests,
  redactKeyLike,
  validatedJsonResult,
  withGeminiTimeoutFallback,
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

  it("maps timeouts and 504 DEADLINE_EXCEEDED to TIMEOUT", () => {
    assert.equal(classifyGeminiError(new Error("Request timed out")), "TIMEOUT");
    assert.equal(classifyGeminiError(new Error('[504] DEADLINE_EXCEEDED: "Deadline expired"')), "TIMEOUT");
    assert.equal(classifyGeminiError(new Error("HTTP 504 gateway timeout")), "TIMEOUT");
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

describe("generateGeminiJson (public path, injected stub)", () => {
  const originalStubFlag = process.env.HAMAME_AI_TEST_STUB;
  const baseRequest = {
    system: "sys",
    user: "user text",
    jsonSchema: {} as Record<string, unknown>,
  };

  beforeEach(() => {
    process.env.HAMAME_AI_TEST_STUB = "1";
  });

  afterEach(() => {
    if (originalStubFlag === undefined) delete process.env.HAMAME_AI_TEST_STUB;
    else process.env.HAMAME_AI_TEST_STUB = originalStubFlag;
    injectGeminiJsonForTests(null);
  });

  it("routes the call through the armed stub and returns its structured result", async () => {
    let sawSystem = "";
    let sawUser = "";
    injectGeminiJsonForTests(async (request) => {
      sawSystem = request.system;
      sawUser = request.user;
      return {
        data: { ok: 1 },
        usage: { inputTokens: 2, outputTokens: 3 },
        model: "stub",
        timeoutMs: 1,
      };
    });
    const result = await generateGeminiJson(baseRequest);
    assert.equal(sawSystem, "sys");
    assert.equal(sawUser, "user text");
    assert.deepEqual(result.data, { ok: 1 });
    assert.deepEqual(result.usage, { inputTokens: 2, outputTokens: 3 });
  });

  it("propagates an armed quota failure as the same GeminiError kind (the route refunds on this)", async () => {
    injectGeminiJsonForTests(async () => {
      throw new GeminiError("QUOTA_EXHAUSTED", '429 RESOURCE_EXHAUSTED: "quota exceeded"');
    });
    await assert.rejects(
      generateGeminiJson(baseRequest),
      (err: unknown) => err instanceof GeminiError && err.kind === "QUOTA_EXHAUSTED"
    );
  });
});

describe("withGeminiTimeoutFallback", () => {
  const originalModel = process.env.GEMINI_MODEL;
  afterEach(() => {
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
  });

  it("retries once on gemini-3.5-flash-lite when GEMINI_MODEL is unset and default times out", async () => {
    delete process.env.GEMINI_MODEL;
    const seen: string[] = [];
    const result = await withGeminiTimeoutFallback(async (model) => {
      seen.push(model);
      if (model === DEFAULT_GEMINI_MODEL) {
        throw new GeminiError("TIMEOUT", "504 DEADLINE_EXCEEDED");
      }
      return { model, ok: true };
    });
    assert.deepEqual(seen, [DEFAULT_GEMINI_MODEL, FAST_FALLBACK_GEMINI_MODEL]);
    assert.deepEqual(result, { model: FAST_FALLBACK_GEMINI_MODEL, ok: true });
  });

  it("does not fall back on non-TIMEOUT errors or when GEMINI_MODEL is explicitly set", async () => {
    delete process.env.GEMINI_MODEL;
    const seenQuota: string[] = [];
    await assert.rejects(
      withGeminiTimeoutFallback(async (model) => {
        seenQuota.push(model);
        throw new GeminiError("QUOTA_EXHAUSTED", "429");
      }),
      (err: unknown) => err instanceof GeminiError && err.kind === "QUOTA_EXHAUSTED"
    );
    assert.deepEqual(seenQuota, [DEFAULT_GEMINI_MODEL]);

    process.env.GEMINI_MODEL = DEFAULT_GEMINI_MODEL;
    const seenPinned: string[] = [];
    await assert.rejects(
      withGeminiTimeoutFallback(async (model) => {
        seenPinned.push(model);
        throw new GeminiError("TIMEOUT", "504 DEADLINE_EXCEEDED");
      }),
      (err: unknown) => err instanceof GeminiError && err.kind === "TIMEOUT"
    );
    assert.deepEqual(seenPinned, [DEFAULT_GEMINI_MODEL]);
  });
});
