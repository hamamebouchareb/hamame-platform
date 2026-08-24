import { NextFunction, Request, RequestHandler, Response } from "express";
import { notImplemented } from "./errors";

// Shared 501 placeholder for endpoints that are still route+validation only
// (e.g. PUT /api/users/me and PUT /api/users/me/preferences). Most other route groups
// now have real handlers — do not assume a stubbed mount just because this helper exists.
export const stubHandler = (featureLabel: string): RequestHandler => {
  return (_req: Request, _res: Response, next: NextFunction) => {
    next(notImplemented(featureLabel));
  };
};
