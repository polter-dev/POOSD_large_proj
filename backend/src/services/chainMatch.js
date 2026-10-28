const normalize = require("../utils/normalize");

// The chain a place name belongs to, or null (no nutrition data). Rules: db/README.md "For the API team".
// Exact match on nameKey/alternateNames first, then a prefix match for names with a location suffix
// ("Panda Express - UCF Student Union"); the longest prefix wins so "subway" never beats a longer key.
function matchChain(placeName, chains) {
  const k = normalize(placeName || "");
  if (!k) return null;
  let best = null;
  let bestLen = 0;
  for (const chain of chains) {
    for (const key of [chain.nameKey, ...(chain.alternateNames || [])]) {
      if (k === key) return chain;
      if (k.startsWith(key + " ") && key.length > bestLen) {
        best = chain;
        bestLen = key.length;
      }
    }
  }
  return best;
}

module.exports = { matchChain };
