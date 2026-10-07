// Standard error shape per docs/hamame_api_contract.md:
// "All endpoints return standard error shape: { error: { code, message } }."
// `details` is an additive escape hatch (serialized only when defined —
// existing responses are byte-identical): machine-readable context such as
// the suspension end date for ACCOUNT_SUSPENDED.
export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const notImplemented = (featureLabel: string) =>
  new ApiError(
    501,
    "NOT_IMPLEMENTED",
    `${featureLabel} is scaffolded (route + validation only) but not yet implemented.`
  );
