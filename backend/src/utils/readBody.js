const httpError = require("./httpError");

// The request body as an object, rejecting fields the contract doesn't list (the collections are
// additionalProperties: false). No body, or a non-object one, reads as {} so the field checks report it.
function readBody(body, allowed) {
  const b = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const extra = Object.keys(b).find((k) => !allowed.includes(k));
  if (extra) throw httpError(400, `Unknown field: ${extra}`);
  return b;
}

module.exports = readBody;
