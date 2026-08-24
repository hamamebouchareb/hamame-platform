import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";
import { ApiError } from "../lib/errors";

type Source = "body" | "query" | "params";

function formatIssues(error: { issues: { path: (string | number)[]; message: string }[] }) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

// Validates and replaces req[source] with the parsed (and defaulted/coerced) data.
// Used to keep route files declarative — see docs/hamame_api_contract.md for the shape
// each endpoint expects.
function validate(source: Source, schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(new ApiError(400, "VALIDATION_ERROR", formatIssues(result.error)));
    }
    (req as Record<Source, unknown>)[source] = result.data;
    next();
  };
}

export const validateBody = (schema: ZodSchema) => validate("body", schema);
export const validateQuery = (schema: ZodSchema) => validate("query", schema);
export const validateParams = (schema: ZodSchema) => validate("params", schema);
