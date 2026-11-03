const MealLog = require("../models/MealLog");
const MenuItem = require("../models/MenuItem");
const { dailyTotals } = require("../services/totals");
const { parseDate } = require("./users");
const httpError = require("../utils/httpError");
const readBody = require("../utils/readBody");
const toMealLogJSON = require("../utils/toMealLogJSON");

// Rules match docs/api-contract.md "Meal logs" and the mealLogs validator in db/schema.js. Values must already
// be the right JSON type: "1.5" is rejected, not converted.
const STATUSES = MealLog.schema.path("status").enumValues;
const SOURCES = MealLog.schema.path("source").enumValues;
const OBJECT_ID = /^[0-9a-f]{24}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 31;
const MAX_ENTRIES = 50;
const MACROS = ["proteinG", "carbsG", "fatG"];
// What a menu item entry copies from the item. Sending any of them with menuItemId is a 400.
const ITEM_FIELDS = ["name", "chainName", "calories", ...MACROS];
const ENTRY_FIELDS = ["date", "status", "servings", "source", "menuItemId", ...ITEM_FIELDS];
const ITEM_PROJECTION = Object.fromEntries(ITEM_FIELDS.map((k) => [k, 1]));

// Same check as birthDate: 2026-02-30 is not a date.
function checkDate(v) {
  if (!parseDate(v)) throw httpError(400, "date must be a date (YYYY-MM-DD)");
  return v;
}

function checkStatus(v) {
  if (!STATUSES.includes(v)) throw httpError(400, "status must be planned or eaten");
  return v;
}

function checkServings(v) {
  if (!Number.isFinite(v) || v < 0.25 || v > 10) throw httpError(400, "servings must be a number from 0.25 to 10");
  return v;
}

function checkSource(v) {
  if (!SOURCES.includes(v)) throw httpError(400, "source must be search, plan, photo or custom");
  return v;
}

const UPDATE_CHECKS = { status: checkStatus, servings: checkServings };

// Trimmed text of 1 to max characters.
function checkText(v, max, message) {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || s.length > max) throw httpError(400, message);
  return s;
}

// One entry of POST /meal-logs as it will be stored, minus userId; a menu item entry gets the item's name,
// chain and macros later. Messages leave out the "entries[i]: " the caller adds.
function checkEntry(e) {
  if (!e || typeof e !== "object" || Array.isArray(e)) throw httpError(400, "entry must be an object");
  const b = readBody(e, ENTRY_FIELDS);
  const doc = {
    date: checkDate(b.date),
    status: b.status === undefined ? "eaten" : checkStatus(b.status),
    servings: b.servings === undefined ? 1 : checkServings(b.servings),
    source: checkSource(b.source),
    menuItemId: b.menuItemId ?? null, // null too means custom food (a PhotoItem's menuItemId is null when unmatched)
  };
  if (doc.menuItemId !== null) {
    if (typeof doc.menuItemId !== "string" || !OBJECT_ID.test(doc.menuItemId)) throw httpError(400, "menuItemId must be a menu item id");
    const sent = ITEM_FIELDS.find((k) => k in b);
    if (sent) throw httpError(400, `${sent} comes from the menu item, so leave it out`);
    return doc;
  }
  doc.name = checkText(b.name, 150, "name must be 1 to 150 characters");
  // Omitted, null or blank all mean "no chain", like a favorite's label.
  const blank = b.chainName == null || (typeof b.chainName === "string" && !b.chainName.trim());
  doc.chainName = blank ? null : checkText(b.chainName, 100, "chainName must be 1 to 100 characters, or null");
  if (!Number.isFinite(b.calories) || b.calories < 0 || b.calories > 5000) throw httpError(400, "calories must be a number from 0 to 5000");
  doc.calories = b.calories;
  for (const m of MACROS) {
    // Required, but null = unknown (never send 0 for that).
    if (b[m] !== null && !(Number.isFinite(b[m]) && b[m] >= 0)) throw httpError(400, `${m} must be a number, 0 or more, or null if unknown`);
    doc[m] = b[m];
  }
  return doc;
}

// GET /meal-logs?from=&to=: both real dates, from <= to, at most 31 days counting both ends.
function parseRange(q) {
  const from = parseDate(q.from);
  const to = parseDate(q.to);
  const count = from && to ? (to - from) / DAY_MS + 1 : 0; // both are UTC midnight: whole days
  if (count < 1 || count > MAX_DAYS) throw httpError(400, "from and to must be dates (YYYY-MM-DD), at most 31 days apart");
  return Array.from({ length: count }, (_, i) => new Date(from.getTime() + i * DAY_MS).toISOString().slice(0, 10));
}

// The caller's entries in the range, by date then time logged, and each day's eaten and planned totals.
async function list(req, res, next) {
  try {
    const dates = parseRange(req.query);
    const entries = await MealLog.find({ userId: req.userId, date: { $gte: dates[0], $lte: dates.at(-1) } })
      .sort({ date: 1, createdAt: 1, _id: 1 }) // a batch shares its createdAt; _id keeps the order it was sent in
      .lean();
    res.json({ entries: entries.map(toMealLogJSON), days: dailyTotals(entries, dates) });
  } catch (err) {
    next(err);
  }
}

// POST /meal-logs { entries }: every entry is checked (400s first, then menu items that don't exist, 404)
// before anything is written, so it's all of them or none.
async function add(req, res, next) {
  try {
    const { entries } = readBody(req.body, ["entries"]);
    if (!Array.isArray(entries) || !entries.length || entries.length > MAX_ENTRIES) {
      throw httpError(400, "entries must be a list of 1 to 50");
    }
    const docs = entries.map((e, i) => {
      try {
        return checkEntry(e);
      } catch (err) {
        throw httpError(err.status, `entries[${i}]: ${err.message}`);
      }
    });

    const ids = [...new Set(docs.map((d) => d.menuItemId).filter(Boolean))];
    const items = ids.length ? await MenuItem.find({ _id: { $in: ids } }, ITEM_PROJECTION).lean() : [];
    const byId = new Map(items.map((m) => [String(m._id), m]));
    docs.forEach((d, i) => {
      if (!d.menuItemId) return;
      const item = byId.get(d.menuItemId);
      if (!item) throw httpError(404, `entries[${i}]: menu item not found`);
      // A snapshot: the log keeps these values even if the item is edited or deleted later.
      for (const k of ITEM_FIELDS) d[k] = item[k];
    });

    // Mongoose validates every document before sending any. shortcut: no transaction, so only a server failure
    // partway through the insert could store part of a batch; the checks above already match the validator.
    const saved = await MealLog.insertMany(docs.map((d) => ({ userId: req.userId, ...d })));
    res.status(201).json({ entries: saved.map(toMealLogJSON) });
  } catch (err) {
    next(err);
  }
}

// PATCH /meal-logs/:id { status?, servings? }: "Ate it" on a planned entry, or a different portion.
// Someone else's entry answers 404 like a missing one, so ids can't be probed.
async function update(req, res, next) {
  try {
    const b = readBody(req.body, Object.keys(UPDATE_CHECKS));
    const keys = Object.keys(b);
    if (!keys.length) throw httpError(400, "Nothing to update");
    const set = {};
    for (const k of keys) set[k] = UPDATE_CHECKS[k](b[k]);
    const { id } = req.params;
    const log = OBJECT_ID.test(id)
      ? await MealLog.findOneAndUpdate({ _id: id, userId: req.userId }, { $set: set }, { returnDocument: "after" }).lean()
      : null;
    if (!log) throw httpError(404, "Meal log not found");
    res.json(toMealLogJSON(log));
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    const { id } = req.params;
    const result = OBJECT_ID.test(id) ? await MealLog.deleteOne({ _id: id, userId: req.userId }) : null;
    if (!result?.deletedCount) throw httpError(404, "Meal log not found");
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { list, add, update, remove };
