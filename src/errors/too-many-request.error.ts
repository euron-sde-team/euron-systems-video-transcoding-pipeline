import { CustomError } from "./custom.error";

export class TooManyRequestError extends CustomError {
  statusCode = 429;
  reason = "Too Many Requests";

  constructor(message?: string) {
    super(message || "Too Many Requests");
    if (message) this.reason = message;
    Object.setPrototypeOf(this, TooManyRequestError.prototype);
  }

  serializeErrors() {
    return { message: this.reason };
  }
}
