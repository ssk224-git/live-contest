// An error with an HTTP status code and a message that is safe to show to the user.
// Throw it anywhere in a route: the error handler in app.js turns it into a JSON reply.
export class AppError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra; // optional extra fields for the JSON reply, e.g. { code: 'GENERATION_FAILED' }
  }
}
