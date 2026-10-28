// An error the middleware in middleware/error.js turns into { error: message } with this status.
function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

module.exports = httpError;
