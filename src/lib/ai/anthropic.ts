import Anthropic from "@anthropic-ai/sdk";

// Single shared Anthropic client. The key is read lazily (not at import time) so that
// importing anything in src/lib/ai never crashes a process that has no key configured —
// the API boots fine without one, and the on-approval hook degrades to a no-op.

let client: Anthropic | null = null;

export function isAiConfigured(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return typeof key === "string" && key.trim().length > 0;
}

export function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set — see .env.example.");
  }
  if (!client) {
    // The SDK retries 429s / 5xx / connection errors with exponential backoff itself, so
    // transient-failure handling lives here rather than in each caller.
    client = new Anthropic({ apiKey, maxRetries: 2 });
  }
  return client;
}
