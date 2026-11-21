// Express middleware that checks req.body against a Zod schema.
// On success, req.body is replaced by the cleaned value (trimmed strings, defaults filled in).
import { AppError } from '../utils/AppError.js';
import { formatIssues } from '../validation/schemas.js';

export const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    const problems = formatIssues(result.error);
    return next(new AppError(400, problems[0], { problems }));
  }
  req.body = result.data;
  next();
};
