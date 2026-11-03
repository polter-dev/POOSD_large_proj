const Chain = require("../models/Chain");
const MenuItem = require("../models/MenuItem");
const Submission = require("../models/Submission");
const httpError = require("../utils/httpError");
const normalize = require("../utils/normalize");

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
  const nameKey = normalize(s.payload.name);
  if (await Chain.exists({ $or: [{ nameKey }, { alternateNames: nameKey }] })) throw httpError(409, "Restaurant already exists");
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

module.exports = { apply, revert };
