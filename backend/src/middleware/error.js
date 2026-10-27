// The only place that shapes an error response. Endpoints call next(err) with err.status set.
function errorHandler(err, req, res, next) {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON" });
  }
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? "Server error" : err.message });
}

module.exports = errorHandler;
