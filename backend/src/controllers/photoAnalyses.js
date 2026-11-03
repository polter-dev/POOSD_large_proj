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

    const menu = await MenuItem.find({}, { chainName: 1, name: 1, calories: 1, proteinG: 1, carbsG: 1, fatG: 1 })
      .sort({ _id: 1 })
      .lean();
    const raw = await claudeVision.analyzeMeal({ imageBase64, mediaType, menu });
    usage.set(req.userId, { day, count: count + 1 }); // only successful analyses count

    // DB trust: an id the model made up becomes unmatched; a real one gets the database's name, chain and macros.
    const byId = new Map(menu.map((m) => [String(m._id), m]));
    const items = raw.slice(0, 10).map((i) => {
      const m = byId.get(i.menuItemId);
      const servings = Math.min(10, Math.max(0.25, i.servings)); // the range POST /meal-logs accepts
      const src = m || i;
      return {
        menuItemId: m ? String(m._id) : null,
        name: src.name,
        chainName: src.chainName,
        servings,
        calories: src.calories,
        proteinG: src.proteinG,
        carbsG: src.carbsG,
        fatG: src.fatG,
        confidence: i.confidence,
      };
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

module.exports = { analyze };
