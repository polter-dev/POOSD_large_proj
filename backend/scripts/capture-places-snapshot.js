#!/usr/bin/env node
// Re-captures db/places-snapshot.json, Nearby's fallback when every Overpass server is down (#128).
// Runs the API's own query (same amenity filter, chain-name regex and mapping as src/integrations/places.js) for
// 20 miles around UCF and writes one place per line, so a re-capture diffs cleanly.
//
//   node scripts/capture-places-snapshot.js
//
// Chain names come from db/menu-data/chains.js, built the way seed.js stores them, so re-run this after adding a
// chain. Tries OVERPASS_URL (backend/.env) and then the public servers, with a long timeout: a 20-mile query took
// ~30 s on a busy server, past the API's 15 s per attempt. Exits 1 and leaves the file alone if none answers.
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const { buildQuery, overpassServers, postQuery, toPlaces } = require("../src/integrations/places");
const normalize = require("../src/utils/normalize");

// UCF (28.6024, -81.2001) to the 3 decimals buildQuery rounds to, so this is the circle the query covers.
const CENTER = { lat: 28.602, lng: -81.2 };
const RADIUS_MILES = 20;
const OUT = path.join(__dirname, "..", "db", "places-snapshot.json");

// The chains in db/menu-data/chains.js as seed.js stores them: alternate names normalized, without repeats or the
// chain's own nameKey.
function seededChains() {
  const src = fs.readFileSync(path.join(__dirname, "..", "db", "menu-data", "chains.js"), "utf8");
  const chains = new Function(`${src}\nreturn CHAINS;`)(); // written for mongosh's load(): declares CHAINS
  return chains.map((c) => {
    const nameKey = normalize(c.name);
    return { name: c.name, nameKey, alternateNames: [...new Set(c.alternateNames.map(normalize))].filter((n) => n !== nameKey) };
  });
}

async function main() {
  // The names controllers/restaurants.js sends for those chains.
  const chainNames = seededChains().flatMap((c) => [c.name, ...c.alternateNames]);
  const query = buildQuery({ ...CENTER, radiusMiles: RADIUS_MILES, chainNames }, 90);
  for (const url of overpassServers()) {
    const started = Date.now();
    let data = null;
    try {
      data = await postQuery(url, query, 120000);
    } catch (err) {
      console.error(`${url}: ${err.cause?.code || err.name}`);
      continue;
    }
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (!data?.elements.length) {
      console.error(`${url}: no usable answer after ${seconds} s`);
      continue;
    }
    const places = toPlaces(data.elements).sort((a, b) => a.placeId.localeCompare(b.placeId));
    const meta = {
      about: "Nearby's fallback when every Overpass server is down (#128). Regenerate: node scripts/capture-places-snapshot.js",
      attribution: "© OpenStreetMap contributors, ODbL 1.0, https://www.openstreetmap.org/copyright",
      capturedAt: new Date().toISOString(),
      osmBase: data.osm3s?.timestamp_osm_base ?? null, // how current the server's copy of OpenStreetMap was
      server: url,
      center: CENTER,
      radiusMiles: RADIUS_MILES,
    };
    const head = JSON.stringify(meta, null, 2).slice(0, -2); // without the closing "\n}"
    fs.writeFileSync(OUT, `${head},\n  "places": [\n${places.map((p) => `    ${JSON.stringify(p)}`).join(",\n")}\n  ]\n}\n`);
    console.log(`${places.length} places from ${url} in ${seconds} s -> ${path.relative(process.cwd(), OUT)}`);
    return 0;
  }
  console.error("No Overpass server answered; db/places-snapshot.json is unchanged.");
  return 1;
}

if (require.main === module) main().then((code) => process.exit(code));

module.exports = { seededChains }; // for tests/unit/placesSnapshot.test.js
