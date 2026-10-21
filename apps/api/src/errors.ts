export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode = 500,
    readonly code = "APP_ERROR"
  ) {
    super(message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, "NOT_FOUND");
  }
}
