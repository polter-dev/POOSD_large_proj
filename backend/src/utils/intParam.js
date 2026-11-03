const httpError = require("./httpError");

// A query value as a whole number from min to max, or def when it's absent.
// Query values are strings (an array when repeated), so "abc", "1.5" and ["1", "2"] are all 400.
function intParam(v, def, min, max, message) {
  if (v === undefined) return def;
  if (typeof v !== "string" || !/^\d+$/.test(v) || !Number.isSafeInteger(+v) || +v < min || +v > max) {
    throw httpError(400, message);
  }
  return +v;
}

module.exports = intParam;
