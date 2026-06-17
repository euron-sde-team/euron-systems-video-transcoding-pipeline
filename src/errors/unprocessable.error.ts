import { CustomError } from "./custom.error";

export class UnprocessableError extends CustomError {
  statusCode = 422;
  reason = "Unprocessable Entity";

  constructor(message?: string) {
    super(message || "Unprocessable Entity");
    if (message) this.reason = message;
    Object.setPrototypeOf(this, UnprocessableError.prototype);
  }

  serializeErrors() {
    return { message: this.reason };
  }
}
