import { ErrorRequestHandler, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ApiError } from "../lib/errors";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
  }

  // body-parser classifies malformed JSON as a client error (entity.parse.failed,
  // statusCode 400) — surfacing it as 500 would blame the server for bad input.
  if (err?.type === "entity.parse.failed" && err.statusCode === 400) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Request body is not valid JSON." },
    });
  }

  // Unexpected-error forensics: Prisma known-request errors carry a short
  // code (P2002, P2028, P2034, …) plus driver metadata — log both, plus a
  // short per-request id for correlation. Never request bodies, tokens, or
  // emails: err objects can nest any of those (e.g. failed-query arguments).
  const requestId = Math.random().toString(36).slice(2, 10);
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // eslint-disable-next-line no-console
    console.error(`[${requestId}]`, err.code, JSON.stringify(err.meta ?? null));
  } else {
    // eslint-disable-next-line no-console
    console.error(`[${requestId}]`, err);
  }
  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong." },
  });
};

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } });
}
