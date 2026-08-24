import { ErrorRequestHandler, Request, Response } from "express";
import { ApiError } from "../lib/errors";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
  }

  // body-parser classifies malformed JSON as a client error (entity.parse.failed,
  // statusCode 400) — surfacing it as 500 would blame the server for bad input.
  if (err?.type === "entity.parse.failed" && err.statusCode === 400) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Request body is not valid JSON." },
    });
  }

  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong." },
  });
};

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } });
}
