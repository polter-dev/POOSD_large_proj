const Chain = require("../models/Chain");
const MenuItem = require("../models/MenuItem");
const Submission = require("../models/Submission");
const httpError = require("../utils/httpError");
const normalize = require("../utils/normalize");
const readBody = require("../utils/readBody");

// Writing and undoing community submissions (docs/api-contract.md, "What applying does" and "Allowed status
// changes"). Shared by the admin review (#109) and auto-moderation on submit (#110). Both functions throw a
// 404/409 before writing anything, so the caller can leave the submission's status as it was.

// Every community write leaves the item as an unverified community estimate.
const COMMUNITY = { isEstimate: true, source: "community", lastVerified: null };

// The unique indexes (chain_item_unique, name_key_unique) are the final duplicate check: a clash is a 409, not a 500.
async function orConflict(write, message) {
  try {
    return await write;
  } catch (err) {
    if (err.code === 11000) throw httpError(409, message);
    throw err;
  }
}

// A new chain clashes when its name or any alternate name is already some chain's nameKey or alternate name;
// otherwise Nearby's { $or: [{ nameKey }, { alternateNames }] } lookup could match two chains.
function chainNameTaken(payload) {
  const keys = [...new Set([payload.name, ...(payload.alternateNames || [])].map(normalize))];
  return Chain.exists({ $or: [{ nameKey: { $in: keys } }, { alternateNames: { $in: keys } }] });
}

// Writes the submission's change. Returns the { before, resultId } to store on the submission.
async function apply(s) {
  if (s.kind === "edit_item") {
    const item = await MenuItem.findById(s.targetId).lean();
    if (!item) throw httpError(404, "Menu item not found");
    const set = { ...s.payload, ...COMMUNITY, ...("name" in s.payload && { searchName: normalize(s.payload.name) }) };
    // Every field the edit changes, including the hidden ones, so revert puts the item back exactly.
    const before = Object.fromEntries(Object.keys(set).map((k) => [k, item[k]]));
    await orConflict(MenuItem.updateOne({ _id: item._id }, { $set: set }), "Item already exists");
    return { before, resultId: null };
  }
  if (s.kind === "new_item") {
    const chain = await Chain.findById(s.targetId).lean();
    if (!chain) throw httpError(404, "Restaurant not found");
    const doc = { chainId: chain._id, chainName: chain.name, ...s.payload, searchName: normalize(s.payload.name), ...COMMUNITY };
    const item = await orConflict(MenuItem.create(doc), "Item already exists");
    return { before: null, resultId: item._id };
  }
  // new_chain. alternateNames has no unique index, so it is checked here; name_key_unique still catches a race.
  if (await chainNameTaken(s.payload)) throw httpError(409, "Restaurant already exists");
  const nameKey = normalize(s.payload.name);
  const doc = {
    name: s.payload.name,
    nameKey,
    alternateNames: [...new Set((s.payload.alternateNames || []).map(normalize))], // the validator wants unique items
    nutritionSourceUrl: s.payload.nutritionSourceUrl,
  };
  const chain = await orConflict(Chain.create(doc), "Restaurant already exists");
  return { before: null, resultId: chain._id };
}

// A revert that matched nothing: the item is gone (404) or no longer holds the submission's values (409).
async function changedOrGone(id) {
  throw (await MenuItem.exists({ _id: id }))
    ? httpError(409, "Item changed since this submission")
    : httpError(404, "Menu item not found");
}

// Undoes an applied submission. Filtering on the payload's values makes "unchanged since?" and the write one
// atomic step, so a later edit is never silently overwritten or thrown away.
async function revert(s) {
  if (s.kind === "edit_item") {
    // before also restores isEstimate/source/lastVerified, so a later applied edit to the same item (even of other
    // fields) blocks the revert: otherwise its community values would come back labelled verified. An applied
    // submission's updatedAt is when it was applied.
    const later = await Submission.exists({
      _id: { $ne: s._id }, targetId: s.targetId, kind: "edit_item", status: { $in: ["auto_applied", "approved"] }, updatedAt: { $gte: s.updatedAt },
    });
    if (later) throw httpError(409, "Item changed since this submission");
    const res = await orConflict(MenuItem.updateOne({ _id: s.targetId, ...s.payload }, { $set: s.before }), "Item already exists");
    if (!res.matchedCount) await changedOrGone(s.targetId);
    return;
  }
  if (s.kind === "new_item") {
    const res = await MenuItem.deleteOne({ _id: s.resultId, ...s.payload });
    if (!res.deletedCount) await changedOrGone(s.resultId);
    return;
  }
  if (await MenuItem.exists({ chainId: s.resultId })) throw httpError(409, "Restaurant has menu items");
  const res = await Chain.deleteOne({ _id: s.resultId });
  if (!res.deletedCount) throw httpError(404, "Restaurant not found");
}

// ---------------------------------------------------------------------------
// Submit-time checks (#110): pure, so they're unit tested without a database.
// ---------------------------------------------------------------------------
const CATEGORIES = ["entree", "side", "breakfast", "salad", "drink", "dessert"];
const NUMBERS = ["calories", "proteinG", "carbsG", "fatG"];
const ITEM_FIELDS = ["name", "category", ...NUMBERS];
const DAY_MS = 24 * 60 * 60 * 1000;

// A trimmed name the validators accept: max length, and something left after normalize() (nameKey/searchName
// can't be empty).
function checkName(v, max, label) {
  const name = typeof v === "string" ? v.trim() : "";
  if (!name || name.length > max || !normalize(name)) throw httpError(400, `${label}: 1 to ${max} characters, with a letter or digit`);
  return name;
}

// Same rules as the menuItems validator in db/schema.js. typeof checks also refuse operator-shaped values like
// { $gt: 0 }: revert puts the stored payload into a Mongo filter.
const ITEM_CHECKS = {
  name: (v) => checkName(v, 150, "Name"),
  category: (v) => {
    if (!CATEGORIES.includes(v)) throw httpError(400, `Category: one of ${CATEGORIES.join(", ")}`);
    return v;
  },
  calories: (v) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 5000) throw httpError(400, "Calories: 0 to 5000");
    return v;
  },
};
for (const k of ["proteinG", "carbsG", "fatG"]) {
  ITEM_CHECKS[k] = (v) => {
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) throw httpError(400, `${k}: a number, 0 or more, or null`);
    return v;
  };
}

// The payload as it will be stored and applied (names trimmed), or a 400. Unknown keys, $-keys included, are 400.
function validatePayload(kind, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw httpError(400, "Payload must be an object");
  if (kind === "new_chain") {
    const p = readBody(payload, ["name", "nutritionSourceUrl", "alternateNames"]);
    const out = { name: checkName(p.name, 100, "Name") };
    if (typeof p.nutritionSourceUrl !== "string" || !p.nutritionSourceUrl.startsWith("https://")) {
      throw httpError(400, "Nutrition source URL must start with https://");
    }
    out.nutritionSourceUrl = p.nutritionSourceUrl;
    if (p.alternateNames !== undefined) {
      if (!Array.isArray(p.alternateNames) || p.alternateNames.length > 10) throw httpError(400, "Alternate names: a list of at most 10");
      out.alternateNames = p.alternateNames.map((n) => checkName(n, 100, "Alternate names"));
    }
    return out;
  }
  const p = readBody(payload, ITEM_FIELDS);
  const keys = kind === "new_item" ? ITEM_FIELDS : Object.keys(p);
  if (!keys.length) throw httpError(400, "Payload: change at least one field");
  const out = {};
  for (const k of keys) {
    if (p[k] === undefined) throw httpError(400, `${k} is required`);
    out[k] = ITEM_CHECKS[k](p[k]);
  }
  return out;
}

// More than 30% of the current value. Filling an unknown (null -> n) isn't large; clearing a known one is.
function isLarge(from, to) {
  if (from === null || from === undefined) return false;
  if (to === null) return true;
  return Math.abs(to - from) * 10 > from * 3; // no 0.3 rounding, so exactly 30% isn't large; from 0, anything else is
}

// The contract's auto-moderation flags (docs/api-contract.md), in schema.js FLAGS order. Any flag means pending.
// current is the edited menu item (edit_item only); user needs createdAt.
function flagsFor({ kind, payload, current, user, rejectedCount, now }) {
  const edit = kind === "edit_item";
  const m = edit ? { ...current, ...payload } : payload;
  const known = NUMBERS.every((k) => typeof m[k] === "number");
  const atwater = known ? Math.abs(4 * m.proteinG + 4 * m.carbsG + 9 * m.fatG - m.calories) : 0;
  const flags = {
    new_chain: kind === "new_chain",
    verified_item: edit && current.isEstimate === false,
    renamed: edit && "name" in payload && payload.name !== current.name,
    large_change: edit && NUMBERS.some((k) => k in payload && isLarge(current[k], payload[k])),
    macros_mismatch: atwater > 40 && atwater * 5 > m.calories, // > max(20% of calories, 40); * 5 keeps exactly 20% exact
    new_account: now - user.createdAt < DAY_MS,
    untrusted_user: rejectedCount >= 2,
    url_in_name: typeof payload.name === "string" && /http|www\.|\.com/i.test(payload.name),
  };
  return Object.keys(flags).filter((f) => flags[f]);
}

module.exports = { apply, revert, chainNameTaken, validatePayload, flagsFor };
