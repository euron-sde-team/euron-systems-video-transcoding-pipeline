import { CustomError } from "./custom.error";

export class UnauthorizedError extends CustomError {
  statusCode = 401;
  reason = "Unauthorized";

  constructor(message?: string) {
    super(message || "Unauthorized");
    if (message) this.reason = message;
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }

  serializeErrors() {
    return { message: this.reason };
  }
}
