import { CustomError } from "./custom.error";

export class ForbiddenError extends CustomError {
  statusCode = 403;
  reason = "Forbidden";

  constructor(message?: string) {
    super(message || "Forbidden");
    if (message) this.reason = message;
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }

  serializeErrors() {
    return { message: this.reason };
  }
}
