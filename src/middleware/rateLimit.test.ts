import test from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { normalizePathname, rateLimit } from "./rateLimit";

function mockReq(originalUrl: string, ip = "203.0.113.10"): Request {
  return {
    originalUrl,
    headers: { "x-forwarded-for": ip },
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as Request;
}

function mockRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: unknown = null;
  const res = {
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  } as unknown as Response;
  return { res, getStatus: () => statusCode, getBody: () => body, headers };
}

test("normalizePathname collapses slashes, decodes percent-encoding, strips query, and lowercases", () => {
  assert.equal(normalizePathname("/api/auth/LOGIN/?foo=1"), "/api/auth/login");
  assert.equal(normalizePathname("/api/auth/log%69n///"), "/api/auth/login");
  assert.equal(normalizePathname("/"), "/");
});

test("rateLimit shares bucket across URL case, trailing slash, and percent-encoding variants", () => {
  const limiter = rateLimit(60_000, 2);
  let nextCount = 0;

  for (const url of ["/api/auth/login", "/api/auth/LOGIN/", "/api/auth/log%69n"]) {
    const { res, getStatus } = mockRes();
    limiter(mockReq(url), res, () => {
      nextCount += 1;
    });
    if (nextCount < 3 && url !== "/api/auth/log%69n") {
      assert.equal(getStatus(), 200);
    }
  }

  assert.equal(nextCount, 2);
  const fourth = mockRes();
  limiter(mockReq("/api/auth/login"), fourth.res, () => {
    nextCount += 1;
  });
  assert.equal(fourth.getStatus(), 429);
});

test("rateLimit instances use dedicated Maps so limits do not collide across instances", () => {
  const limiterA = rateLimit(60_000, 1);
  const limiterB = rateLimit(60_000, 1);

  let aPassed = 0;
  let bPassed = 0;
  limiterA(mockReq("/api/test"), mockRes().res, () => {
    aPassed += 1;
  });
  limiterB(mockReq("/api/test"), mockRes().res, () => {
    bPassed += 1;
  });

  assert.equal(aPassed, 1);
  assert.equal(bPassed, 1);
});
