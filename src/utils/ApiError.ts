/**
 * Error type carrying an HTTP status code. Anything thrown from a route that is
 * an ApiError is rendered verbatim by the central error handler; anything else
 * is treated as a 500 in production.
 */
export class ApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }

  static badRequest(message = "Bad request"): ApiError {
    return new ApiError(400, message);
  }

  static unauthorized(message = "Not authenticated"): ApiError {
    return new ApiError(401, message);
  }

  static forbidden(message = "Not authorized"): ApiError {
    return new ApiError(403, message);
  }

  static notFound(message = "Resource not found"): ApiError {
    return new ApiError(404, message);
  }

  static conflict(message = "Resource already exists"): ApiError {
    return new ApiError(409, message);
  }
}
