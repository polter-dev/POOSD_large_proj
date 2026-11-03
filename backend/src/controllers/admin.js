const Submission = require("../models/Submission");
const User = require("../models/User");
const moderation = require("../services/moderation");
const httpError = require("../utils/httpError");
const intParam = require("../utils/intParam");
const readBody = require("../utils/readBody");
const toSubmissionJSON = require("../utils/toSubmissionJSON");

const STATUSES = Submission.schema.path("status").enumValues;
const OBJECT_ID = /^[0-9a-f]{24}$/;
// The only status changes an admin can make (docs/api-contract.md, "Allowed status changes").
const NEXT = { pending: ["approved", "rejected"], auto_applied: ["reverted"], approved: ["reverted"] };

function checkStatus(v) {
  if (!STATUSES.includes(v)) throw httpError(400, `Status: one of ${STATUSES.join(", ")}`);
  return v;
}

// Omitted, null or blank all mean "no note". Each change replaces the note, like reviewedBy.
function checkReviewNote(v) {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw httpError(400, "Review note must be text");
  if (v.trim().length > 300) throw httpError(400, "Review note: 300 characters max");
  return v.trim() || null;
}

// The contract's admin Submission: adds user and reviewedBy as { id, username }, with one users query.
async function withUsers(subs) {
  const ids = [...new Set(subs.flatMap((s) => [s.userId, s.reviewedBy]).filter(Boolean).map(String))];
  const users = await User.find({ _id: { $in: ids } }, { username: 1 }).lean();
  const names = new Map(users.map((u) => [String(u._id), u.username]));
  // A deleted account keeps its submissions (db/README.md), so its username is null.
  const ref = (id) => id && { id: String(id), username: names.get(String(id)) ?? null };
  return subs.map((s) => ({ ...toSubmissionJSON(s), user: ref(s.userId), reviewedBy: ref(s.reviewedBy) }));
}

// GET /admin/submissions?status=&limit=&skip=. The pending queue is first come, first served; the
// other statuses are history, newest first.
async function list(req, res, next) {
  try {
    const status = req.query.status === undefined ? "pending" : checkStatus(req.query.status);
    const limit = intParam(req.query.limit, 20, 1, 100, "limit must be a whole number from 1 to 100");
    const skip = intParam(req.query.skip, 0, 0, Number.MAX_SAFE_INTEGER, "skip must be a whole number, 0 or more");
    const order = status === "pending" ? 1 : -1;
    const [subs, total] = await Promise.all([
      Submission.find({ status }).sort({ createdAt: order, _id: order }).skip(skip).limit(limit).lean(),
      Submission.countDocuments({ status }),
    ]);
    res.json({ submissions: await withUsers(subs), total });
  } catch (err) {
    next(err);
  }
}

// PATCH /admin/submissions/:id { status, reviewNote? }. Approving applies the change, reverting undoes it.
async function review(req, res, next) {
  try {
    const b = readBody(req.body, ["status", "reviewNote"]);
    const status = checkStatus(b.status);
    const reviewNote = checkReviewNote(b.reviewNote);
    const { id } = req.params;
    const s = OBJECT_ID.test(id) ? await Submission.findById(id).lean() : null;
    if (!s) throw httpError(404, "Submission not found");
    if (!NEXT[s.status]?.includes(status)) throw httpError(409, `Can't change a submission from ${s.status} to ${status}`);

    const set = { status, reviewedBy: req.userId, reviewNote };
    // These throw their 404/409 before writing, so the submission keeps its status.
    if (status === "approved") Object.assign(set, await moderation.apply(s));
    if (status === "reverted") await moderation.revert(s);
    // shortcut: the menu write and this status write are not one transaction, so two admins approving the same
    // submission at the same instant could both apply it; use a transaction if more than one admin reviews at once.
    const updated = await Submission.findByIdAndUpdate(id, { $set: set }, { returnDocument: "after" }).lean();
    res.json((await withUsers([updated]))[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, review };
