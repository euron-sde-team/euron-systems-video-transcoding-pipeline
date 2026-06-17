import { CustomError } from "./custom.error";

export class ConflictError extends CustomError {
  statusCode = 409;
  reason = "Conflict";

  constructor(message?: string) {
    super(message || "Conflict");
    if (message) this.reason = message;
    Object.setPrototypeOf(this, ConflictError.prototype);
  }

  serializeErrors() {
    return { message: this.reason };
  }
}
