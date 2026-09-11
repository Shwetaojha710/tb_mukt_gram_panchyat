function errorHandler(err, _req, res, _next) {
  console.error(err);
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';
  const details = err.details || undefined;
  res.status(status).json({
    success: false,
    message,
    ...(details ? { details } : {}),
  });
}

class AppError extends Error {
  constructor(message, status = 400, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

module.exports = errorHandler;
module.exports.AppError = AppError;
