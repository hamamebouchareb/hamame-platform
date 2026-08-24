// Standard error shape per docs/hamame_api_contract.md:
// "All endpoints return standard error shape: { error: { code, message } }."
export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const notImplemented = (featureLabel: string) =>
  new ApiError(
    501,
    "NOT_IMPLEMENTED",
    `${featureLabel} is scaffolded (route + validation only) but not yet implemented.`
  );
