// The only place that shapes an error response. Endpoints call next(err) with err.status set.
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON" });
  }
  const status = err.code === 11000 ? 409 : err.status || 500;
  if (status === 500) console.error(err);
  const message = status === 500 ? "Server error" : err.code === 11000 ? "Already exists" : err.message;
  res.status(status).json({ error: message });
}

module.exports = errorHandler;
