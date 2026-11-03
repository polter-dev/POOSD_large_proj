const MenuItem = require("../models/MenuItem");
const claudeVision = require("../integrations/claudeVision");
const httpError = require("../utils/httpError");
const readBody = require("../utils/readBody");

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_CHARS = 3000000;
const DAILY_LIMIT = 20;
// shortcut: per-process memory (pm2 runs one process), reset on restart/deploy; move to a Mongo collection if we run more than one.
const usage = new Map(); // userId -> { day: "YYYY-MM-DD" (UTC), count }

function parseBody(body) {
  const { imageBase64, mediaType } = readBody(body, ["imageBase64", "mediaType"]);
  if (!MEDIA_TYPES.includes(mediaType)) throw httpError(400, "mediaType must be image/jpeg, image/png or image/webp");
  if (typeof imageBase64 !== "string" || imageBase64 === "") throw httpError(400, "imageBase64 is required");
  if (imageBase64.length > MAX_CHARS) throw httpError(413, "Image too large");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
    throw httpError(400, "imageBase64 must be base64 without a data: prefix");
  }
  return { imageBase64, mediaType };
}

// Nothing is saved, and the image is never stored or logged.
async function analyze(req, res, next) {
  try {
    const { imageBase64, mediaType } = parseBody(req.body);
    if (!process.env.ANTHROPIC_API_KEY) throw httpError(503, "Photo analysis unavailable");
    const day = new Date().toISOString().slice(0, 10);
    const used = usage.get(req.userId);
    const count = used?.day === day ? used.count : 0;
    if (count >= DAILY_LIMIT) throw httpError(429, "Daily photo limit reached");

    usage.set(req.userId, { day, count: count + 1 }); // reserve before awaiting so parallel calls can't all pass
    let menu, raw;
    try {
      menu = await MenuItem.find({}, { chainName: 1, name: 1, calories: 1, proteinG: 1, carbsG: 1, fatG: 1 })
        .sort({ _id: 1 })
        .lean();
      raw = await claudeVision.analyzeMeal({ imageBase64, mediaType, menu });
    } catch (err) {
      const u = usage.get(req.userId); // only successful analyses count: give the slot back
      if (u?.day === day) u.count--;
      throw err;
    }

    // DB trust: an id the model made up becomes unmatched; a real one gets the database's name, chain and macros.
    const byId = new Map(menu.map((m) => [String(m._id), m]));
    // Unmatched values are clamped to what POST /meal-logs accepts, so confirming a draft can't 400.
    const items = raw.slice(0, 10).flatMap((i) => {
      const m = byId.get(i.menuItemId);
      const servings = Math.min(10, Math.max(0.25, i.servings));
      if (m) {
        const { name, chainName, calories, proteinG, carbsG, fatG } = m;
        return [{ menuItemId: String(m._id), name, chainName, servings, calories, proteinG, carbsG, fatG, confidence: i.confidence }];
      }
      const name = i.name.trim().slice(0, 150);
      if (!name) return [];
      const macro = (g) => (g === null ? null : Math.max(0, g));
      return [{
        menuItemId: null,
        name,
        chainName: i.chainName?.trim().slice(0, 100) || null,
        servings,
        calories: Math.min(5000, Math.max(0, i.calories)),
        proteinG: macro(i.proteinG),
        carbsG: macro(i.carbsG),
        fatG: macro(i.fatG),
        confidence: i.confidence,
      }];
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

module.exports = { analyze };
