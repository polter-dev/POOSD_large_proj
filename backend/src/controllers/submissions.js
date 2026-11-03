const Chain = require("../models/Chain");
const MenuItem = require("../models/MenuItem");
const Submission = require("../models/Submission");
const User = require("../models/User");
const moderation = require("../services/moderation");
const httpError = require("../utils/httpError");
const intParam = require("../utils/intParam");
const normalize = require("../utils/normalize");
const readBody = require("../utils/readBody");
const toSubmissionJSON = require("../utils/toSubmissionJSON");

const KINDS = Submission.schema.path("kind").enumValues;
const OBJECT_ID = /^[0-9a-f]{24}$/;
const DAILY_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

// The edited item or the chain a new item goes in (404 when it's gone), or null for a new chain.
async function loadTarget(kind, targetId) {
  if (kind === "new_chain") return null;
  if (kind === "edit_item") {
    const item = await MenuItem.findById(targetId).lean();
    if (!item) throw httpError(404, "Menu item not found");
    return item;
  }
  const chain = await Chain.findById(targetId).lean();
  if (!chain) throw httpError(404, "Restaurant not found");
  return chain;
}

// The contract's submit-time duplicate checks, all on normalize()d names.
async function checkDuplicate(kind, payload, target) {
  if (kind === "new_chain") {
    const key = normalize(payload.name);
    if (await Chain.exists({ $or: [{ nameKey: key }, { alternateNames: key }] })) throw httpError(409, "Restaurant already exists");
    return;
  }
  if (!("name" in payload)) return;
  const filter = kind === "new_item"
    ? { chainId: target._id, searchName: normalize(payload.name) }
    : { chainId: target.chainId, searchName: normalize(payload.name), _id: { $ne: target._id } };
  if (await MenuItem.exists(filter)) throw httpError(409, "Item already exists");
}

// POST /submissions { kind, targetId, payload }. No flags: applied at once (auto_applied); any flag: pending.
async function create(req, res, next) {
  try {
    const b = readBody(req.body, ["kind", "targetId", "payload"]);
    if (!KINDS.includes(b.kind)) throw httpError(400, `Kind: one of ${KINDS.join(", ")}`);
    const targetId = b.targetId ?? null;
    if (b.kind === "new_chain" ? targetId !== null : typeof targetId !== "string" || !OBJECT_ID.test(targetId)) {
      throw httpError(400, b.kind === "new_chain" ? "targetId must be null for a new restaurant" : "targetId is invalid");
    }
    const payload = moderation.validatePayload(b.kind, b.payload);

    const now = new Date();
    // shortcut: count-then-insert, so parallel requests can slip a few past the limit, move to an atomic counter if that's abused.
    const [recent, user, rejectedCount] = await Promise.all([
      Submission.countDocuments({ userId: req.userId, createdAt: { $gt: new Date(now - DAY_MS) } }),
      User.findById(req.userId).lean(),
      Submission.countDocuments({ userId: req.userId, status: "rejected" }),
    ]);
    if (recent >= DAILY_LIMIT) throw httpError(429, "Too many submissions today");
    if (!user) throw httpError(404, "User not found");
    const target = await loadTarget(b.kind, targetId);
    await checkDuplicate(b.kind, payload, target);

    const flags = moderation.flagsFor({ kind: b.kind, payload, current: target, user, rejectedCount, now });
    const s = { userId: req.userId, kind: b.kind, targetId, payload, flags, status: flags.length ? "pending" : "auto_applied" };
    // apply throws its 404/409 (a unique-index clash included) before writing, so nothing is stored then.
    // shortcut: the menu write and the submission insert are not one transaction, use one if the insert ever fails in practice.
    if (!flags.length) Object.assign(s, await moderation.apply(s));
    res.status(201).json(toSubmissionJSON(await Submission.create(s)));
  } catch (err) {
    next(err);
  }
}

// GET /submissions/mine?limit=&skip=: the caller's own, newest first, without flags (moderation reasons stay
// with the admins).
async function mine(req, res, next) {
  try {
    const limit = intParam(req.query.limit, 50, 1, 50, "limit must be a whole number from 1 to 50");
    const skip = intParam(req.query.skip, 0, 0, Number.MAX_SAFE_INTEGER, "skip must be a whole number, 0 or more");
    const [subs, total] = await Promise.all([
      Submission.find({ userId: req.userId }).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
      Submission.countDocuments({ userId: req.userId }),
    ]);
    res.json({ submissions: subs.map(toSubmissionJSON).map(({ flags, ...s }) => s), total });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, mine };
