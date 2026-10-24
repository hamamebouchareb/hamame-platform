import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

// Gemini provider layer — the free-tier-only model gate for the AI Study Assistant.
//
// Provider selection decision (approved): study-chat AND the new explain-answer feature
// run on Google's official @google/genai SDK with GEMINI_API_KEY. The other AI features
// (contextual hints, mcq-explanation backfill) stay on Anthropic — they are NOT part of
// this decision and were not touched.
//
// FREE-ONLY GUARANTEE, as evidenced 2026-10-24:
//   - Google pricing docs (ai.google.dev/gemini-api/docs/pricing, Oct 2026): the Free
//     Tier is "Free of charge" for text models, tied to an ACTIVE PROJECT WITH NO
//     BILLING ACCOUNT. Free-tier text allowance applies to Flash / Flash-Lite models.
//   - Live probes on the configured key: models/gemini-3.5-flash and
//     models/gemini-3.5-flash-lite both accepted generateContent (HTTP 200);
//     gemini-4-argon returned 429 RESOURCE_EXHAUSTED ("check plan and billing") and
//     gemini-2.5-* models return 404 (no longer available to new keys).
// There is NO code path that silently upgrades the model, enables billing, or falls
// back to a different provider. If the operator sets GEMINI_MODEL to a paid-only
// model, requests 429 → mapped to AI_QUOTA_EXHAUSTED, the user's credit is refunded,
// and the student retries later. No charge can be incurred by architecture: the key
// holder must never attach a billing account to the key's project (manual step, owned
// by the operator — see .env.example).

// Default chosen from the live probe set above: gemini-3.5-flash responded 200 on the
// free key while the older 2.5 generation is 404-closed for new keys.
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

// Defensive model-name validation: the value lands in a URL path we build, so anything
// outside the model-id alphabet is rejected instead of passed through.
const GEMINI_MODEL_PATTERN = /^[A-Za-z0-9._-]+$/;

export function getGeminiModel(): string {
  const raw = process.env.GEMINI_MODEL?.trim();
  const model = raw && raw.length > 0 ? raw : DEFAULT_GEMINI_MODEL;
  if (!GEMINI_MODEL_PATTERN.test(model)) {
    throw new GeminiError(
      "CONFIGURATION",
      `GEMINI_MODEL is not a valid Gemini model id: ${model}`
    );
  }
  return model;
}

const DEFAULT_TIMEOUT_MS = 30_000;
export const MIN_GEMINI_TIMEOUT_MS = 3_000;
export const MAX_GEMINI_TIMEOUT_MS = 60_000;

function getTimeoutMs(): number {
  const raw = Number(process.env.GEMINI_TIMEOUT_MS ?? "");
  const timeout = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(timeout, MIN_GEMINI_TIMEOUT_MS), MAX_GEMINI_TIMEOUT_MS);
}

const DEFAULT_MAX_OUTPUT_TOKENS = 1_500;
export const MIN_GEMINI_MAX_TOKENS = 100;
export const MAX_GEMINI_MAX_TOKENS = 8_000;

function getMaxOutputTokens(): number {
  const raw = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS ?? "");
  const value = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_OUTPUT_TOKENS;
  return Math.min(Math.max(value, MIN_GEMINI_MAX_TOKENS), MAX_GEMINI_MAX_TOKENS);
}

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
}

export type GeminiFailureKind =
  | "NOT_CONFIGURED"
  | "CONFIGURATION"
  | "QUOTA_EXHAUSTED"
  | "TIMEOUT"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_REQUEST"
  | "PROVIDER_ERROR"
  | "EMPTY_RESPONSE"
  | "SCHEMA_INVALID";

export class GeminiError extends Error {
  constructor(
    readonly kind: GeminiFailureKind,
    message: string,
    readonly detail?: string
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

// Scrubs anything that could be an API key out of provider error text BEFORE the text
// can reach a log line. Google keys observed in the wild: "AIza…" and "AQ.…".
const KEY_LIKE_PATTERN = /(AIza[0-9A-Za-z_-]{10,}|AQ\.[0-9A-Za-z_-]{10,})/g;

export function redactKeyLike(text: string): string {
  return text.replace(KEY_LIKE_PATTERN, "[redacted]");
}

// Maps a thrown SDK/provider error onto our failure kinds. Order matters: the HTTP
// status and the resource/quota keywords are checked before generic status-class
// fallbacks. The message never contains the key — redactKeyLike is applied anyway so
// a future SDK change cannot leak it into our logs.
export function classifyGeminiError(err: unknown): GeminiFailureKind {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const message = redactKeyLike(raw);
  if (/RESOURCE_EXHAUSTED|\b429\b|rate limit|quota/i.test(message)) {
    return "QUOTA_EXHAUSTED";
  }
  if (/\b401\b|\b403\b|UNAUTHENTICATED|PERMISSION_DENIED|API key not valid/i.test(message)) {
    return "CONFIGURATION";
  }
  if (/\b400\b|INVALID_ARGUMENT|malformed/i.test(message)) {
    return "INVALID_REQUEST";
  }
  if (/\b503\b|UNAVAILABLE|overloaded|high demand/i.test(message)) {
    return "PROVIDER_UNAVAILABLE";
  }
  if (/timeout|timed out|aborted/i.test(message)) {
    return "TIMEOUT";
  }
  return "PROVIDER_ERROR";
}

interface GeminiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GeminiTextRequest {
  system: string;
  messages: { role: "user" | "assistant"; content: string }[];
  temperature?: number;
}

export interface GeminiJsonRequest {
  system: string;
  user: string;
  jsonSchema: Record<string, unknown>;
  temperature?: number;
}

export interface GeminiTextResult {
  text: string;
  usage: GeminiUsage;
  model: string;
  timeoutMs: number;
}

export interface GeminiJsonResult {
  data: unknown;
  usage: GeminiUsage;
  model: string;
  timeoutMs: number;
}

export type GeminiJsonGenerator = (request: GeminiJsonRequest) => Promise<GeminiJsonResult>;

// Test-only injection seam. The stub may NEVER activate silently: it requires
// HAMAME_AI_TEST_STUB=1 (set by verify scripts / the test runner) and refuses to arm
// when NODE_ENV is production. Without the seam the real path is taken — there is no
// silent fallback to a fake, and equally no silent fallback to a paid provider.
let injectedJsonGenerator: GeminiJsonGenerator | null = null;

export function injectGeminiJsonForTests(generator: GeminiJsonGenerator | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Gemini test injection is forbidden when NODE_ENV is production.");
  }
  if (generator !== null && process.env.HAMAME_AI_TEST_STUB !== "1") {
    throw new Error('Gemini test injection requires HAMAME_AI_TEST_STUB=1.');
  }
  injectedJsonGenerator = generator;
}

let client: GoogleGenAI | null = null;

// Key is read lazily (lint on call, like ./anthropic.ts): boot never crashes when the
// optional key is absent — every caller first checks isGeminiConfigured().
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new GeminiError("NOT_CONFIGURED", "GEMINI_API_KEY is not set — see .env.example.");
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

// The SDK's response text; typed defensively because usage/candidates reports vary.
function usageFrom(response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }): GeminiUsage {
  const usage = response.usageMetadata ?? {};
  return {
    inputTokens: usage.promptTokenCount ?? 0,
    outputTokens: usage.candidatesTokenCount ?? 0,
  };
}

// One plain-text completion (chat turns). Roles map to the SDK's names: our
// "assistant" history entries become the SDK's "model" role.
export async function generateGeminiText(request: GeminiTextRequest): Promise<GeminiTextResult> {
  const model = getGeminiModel();
  const timeoutMs = getTimeoutMs();
  const contents = request.messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));

  let response: { text?: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
  try {
    response = await getGeminiClient().models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: request.system,
        temperature: request.temperature ?? 0.4,
        maxOutputTokens: getMaxOutputTokens(),
        httpOptions: { timeout: timeoutMs },
      },
    });
  } catch (err) {
    const kind = isGeminiConfigured() ? classifyGeminiError(err) : "NOT_CONFIGURED";
    throw new GeminiError(kind, redactKeyLike(err instanceof Error ? err.message : String(err)));
  }

  const text = (response.text ?? "").trim();
  if (text.length === 0) {
    throw new GeminiError("EMPTY_RESPONSE", "Gemini returned an empty response.");
  }
  return { text, usage: usageFrom(response), model, timeoutMs };
}

// One structured (responseJsonSchema) completion. The returned `data` is parsed by the
// SDK, but every caller MUST additionally validate it with its own zod schema — the
// zod check, not the provider, is the contract.
export async function generateGeminiJson(request: GeminiJsonRequest): Promise<GeminiJsonResult> {
  if (injectedJsonGenerator !== null) {
    return injectedJsonGenerator(request);
  }
  const model = getGeminiModel();
  const timeoutMs = getTimeoutMs();

  let response: { parsed?: unknown; text?: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
  try {
    response = await getGeminiClient().models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: request.user }] }],
      config: {
        systemInstruction: request.system,
        temperature: request.temperature ?? 0.3,
        maxOutputTokens: getMaxOutputTokens(),
        responseMimeType: "application/json",
        responseJsonSchema: request.jsonSchema,
        httpOptions: { timeout: timeoutMs },
      },
    });
  } catch (err) {
    const kind = isGeminiConfigured() ? classifyGeminiError(err) : "NOT_CONFIGURED";
    throw new GeminiError(kind, redactKeyLike(err instanceof Error ? err.message : String(err)));
  }

  const data = response.parsed ?? safeParseJson(response.text ?? "");
  if (data === null) {
    throw new GeminiError("EMPTY_RESPONSE", "Gemini returned no parsable JSON.");
  }
  return { data, usage: usageFrom(response), model, timeoutMs };
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Shared zod check used by both structured features so their validation cannot drift.
export function validatedJsonResult<T>(
  result: GeminiJsonResult,
  schema: z.ZodType<T>,
  featureLabel: string
): T {
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) {
    throw new GeminiError(
      "SCHEMA_INVALID",
      `${featureLabel}: Gemini response failed validation.`,
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")
    );
  }
  return parsed.data;
}
