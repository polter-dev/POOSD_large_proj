const { test } = require("node:test");
const assert = require("node:assert");
const { matchChain } = require("../../src/services/chainMatch");

const chains = [
  { _id: "c1", nameKey: "chick fil a", alternateNames: ["chickfila"] },
  { _id: "c2", nameKey: "panda express", alternateNames: ["panda"] },
  { _id: "c3", nameKey: "subway", alternateNames: ["subway restaurants"] },
];

test("exact match on nameKey after normalizing", () => {
  assert.strictEqual(matchChain("Chick-fil-A", chains)._id, "c1");
});

test("exact match on an alternate name", () => {
  assert.strictEqual(matchChain("Chickfila", chains)._id, "c1");
});

test("location suffix falls back to a prefix match", () => {
  assert.strictEqual(matchChain("Panda Express - UCF Student Union", chains)._id, "c2");
});

test("longest prefix wins", () => {
  assert.strictEqual(matchChain("Subway Restaurants Downtown", chains)._id, "c3");
  assert.strictEqual(matchChain("Panda Express Waterford", chains)._id, "c2");
});

test("prefix must end on a word boundary", () => {
  assert.strictEqual(matchChain("Subwayside Grill", chains), null);
});

test("no match returns null", () => {
  assert.strictEqual(matchChain("Not Subway Cafe", chains), null);
  assert.strictEqual(matchChain("", chains), null);
  assert.strictEqual(matchChain(undefined, chains), null);
});
