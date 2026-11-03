const { test } = require("node:test");
const assert = require("node:assert");
const { validatePayload, flagsFor } = require("../../src/services/moderation");

// ---------------------------------------------------------------------------
// flagsFor
// ---------------------------------------------------------------------------
const now = new Date("2026-11-03T12:00:00Z");
const oldUser = { createdAt: new Date("2026-10-01T00:00:00Z") };
// 4*25 + 4*46 + 9*34 = 590: macros agree with calories.
const item = { name: "Big Mac", category: "entree", calories: 590, proteinG: 25, carbsG: 46, fatG: 34, isEstimate: true };
const flags = (over) => flagsFor({ kind: "edit_item", payload: {}, current: item, user: oldUser, rejectedCount: 0, now, ...over });
const has = (flag, over) => flags(over).includes(flag);

test("a small edit to an estimate item by an established user has no flags", () => {
  assert.deepStrictEqual(flags({ payload: { calories: 600 } }), []);
  assert.deepStrictEqual(flags({ kind: "new_item", payload: item, current: null }), []);
});

test("new_chain: always for a new chain, never for items", () => {
  assert.deepStrictEqual(flags({ kind: "new_chain", payload: { name: "Raising Cane's" }, current: null }), ["new_chain"]);
  assert.ok(!has("new_chain", { kind: "new_item", payload: item, current: null }));
});

test("verified_item: editing an item with isEstimate false", () => {
  assert.ok(has("verified_item", { payload: { calories: 600 }, current: { ...item, isEstimate: false } }));
  assert.ok(!has("verified_item", { payload: { calories: 600 } }));
});

test("renamed: only when the name actually changes", () => {
  assert.ok(has("renamed", { payload: { name: "Big Mac Deluxe" } }));
  assert.ok(!has("renamed", { payload: { name: "Big Mac" } }));
  assert.ok(!has("renamed", { payload: { calories: 600 } }));
});

test("large_change: more than 30%, so exactly 30% isn't", () => {
  const c = { ...item, calories: 100, proteinG: 10, carbsG: null, fatG: 0 };
  assert.ok(!has("large_change", { current: c, payload: { calories: 130 } }));
  assert.ok(!has("large_change", { current: c, payload: { calories: 70 } }));
  assert.ok(has("large_change", { current: c, payload: { calories: 131 } }));
  assert.ok(has("large_change", { current: c, payload: { proteinG: 6.9 } }));
});

test("large_change: a current value of 0 counts any other value as large", () => {
  const c = { ...item, fatG: 0 };
  assert.ok(has("large_change", { current: c, payload: { fatG: 1 } }));
  assert.ok(!has("large_change", { current: c, payload: { fatG: 0 } }));
});

test("large_change: filling an unknown macro isn't large, clearing a known one is", () => {
  assert.ok(!has("large_change", { current: { ...item, carbsG: null }, payload: { carbsG: 500 } }));
  assert.ok(has("large_change", { payload: { carbsG: null } }));
});

test("macros_mismatch: off by more than 20% of calories, exactly 20% is fine", () => {
  const p = (calories, proteinG) => ({ kind: "new_item", current: null, payload: { ...item, calories, proteinG, carbsG: 50, fatG: 0 } });
  assert.ok(!has("macros_mismatch", p(500, 50))); // 400 kcal from macros: off by 100 = 20%
  assert.ok(has("macros_mismatch", p(500, 49.75))); // 399: off by 101
});

test("macros_mismatch: small items get 40 kcal of slack, and exactly 40 is fine", () => {
  const p = (proteinG) => ({ kind: "new_item", current: null, payload: { ...item, calories: 100, proteinG, carbsG: 0, fatG: 0 } });
  assert.ok(!has("macros_mismatch", p(35))); // 140: off by 40
  assert.ok(has("macros_mismatch", p(35.25))); // 141: off by 41
});

test("macros_mismatch: checked after merging with the item, and skipped while a macro is unknown", () => {
  assert.ok(has("macros_mismatch", { payload: { fatG: 60 } })); // 590 kcal listed, 824 from macros
  assert.ok(!has("macros_mismatch", { current: { ...item, carbsG: null }, payload: { fatG: 60 } }));
});

test("new_account: created less than 24 h ago", () => {
  assert.ok(has("new_account", { user: { createdAt: new Date(now - 23 * 3600e3) } }));
  assert.ok(!has("new_account", { user: { createdAt: new Date(now - 24 * 3600e3) } }));
});

test("untrusted_user: 2 or more rejected submissions", () => {
  assert.ok(has("untrusted_user", { rejectedCount: 2 }));
  assert.ok(!has("untrusted_user", { rejectedCount: 1 }));
});

test("url_in_name: http, www. or .com anywhere in the name, any case", () => {
  for (const name of ["Burger HTTPS deal", "www.burger", "Burger.Com"]) assert.ok(has("url_in_name", { payload: { name } }), name);
  assert.ok(has("url_in_name", { kind: "new_chain", payload: { name: "burgers.com" }, current: null }));
  assert.ok(!has("url_in_name", { payload: { name: "Combo Meal" } }));
});

// ---------------------------------------------------------------------------
// validatePayload
// ---------------------------------------------------------------------------
const rejects = (kind, payload, message) => assert.throws(() => validatePayload(kind, payload), { status: 400, message });
const newItem = { name: "6-inch Veggie Delite", category: "entree", calories: 310, proteinG: 16, carbsG: 40, fatG: 10 };

test("edit_item: a non-empty subset, names trimmed", () => {
  assert.deepStrictEqual(validatePayload("edit_item", { name: "  Big Mac  ", fatG: null }), { name: "Big Mac", fatG: null });
  rejects("edit_item", {}, "Payload: change at least one field");
  rejects("edit_item", null, "Payload must be an object");
  rejects("edit_item", [], "Payload must be an object");
});

test("new_item: every field required, macros may be null", () => {
  assert.deepStrictEqual(validatePayload("new_item", { ...newItem, proteinG: null }), { ...newItem, proteinG: null });
  rejects("new_item", { ...newItem, fatG: undefined }, "fatG is required");
});

test("item fields follow the menuItems validator", () => {
  rejects("edit_item", { name: "" }, "Name: 1 to 150 characters, with a letter or digit");
  rejects("edit_item", { name: "x".repeat(151) }, "Name: 1 to 150 characters, with a letter or digit");
  rejects("edit_item", { name: "!!!" }, "Name: 1 to 150 characters, with a letter or digit"); // searchName would be empty
  rejects("edit_item", { category: "snack" }, "Category: one of entree, side, breakfast, salad, drink, dessert");
  rejects("edit_item", { calories: 5001 }, "Calories: 0 to 5000");
  rejects("edit_item", { calories: "600" }, "Calories: 0 to 5000");
  rejects("edit_item", { calories: null }, "Calories: 0 to 5000");
  rejects("edit_item", { proteinG: -1 }, "proteinG: a number, 0 or more, or null");
  rejects("edit_item", { chainId: "x" }, "Unknown field: chainId");
});

test("operator-shaped values are 400, since revert uses the payload as a Mongo filter", () => {
  rejects("edit_item", { $where: "1" }, "Unknown field: $where");
  rejects("edit_item", { calories: { $gt: 0 } }, "Calories: 0 to 5000");
  rejects("edit_item", { proteinG: { $ne: null } }, "proteinG: a number, 0 or more, or null");
  rejects("edit_item", { name: { $regex: "." } }, "Name: 1 to 150 characters, with a letter or digit");
  rejects("new_chain", { name: "X", nutritionSourceUrl: { $exists: true } }, "Nutrition source URL must start with https://");
});

test("new_chain: name 1-100, https URL, up to 10 alternate names", () => {
  const chain = { name: " Raising Cane's ", nutritionSourceUrl: "https://www.raisingcanes.com/nutrition", alternateNames: [" Canes "] };
  assert.deepStrictEqual(validatePayload("new_chain", chain), { ...chain, name: "Raising Cane's", alternateNames: ["Canes"] });
  const { alternateNames, ...noAlternates } = chain;
  assert.deepStrictEqual(validatePayload("new_chain", noAlternates), { ...noAlternates, name: "Raising Cane's" });
  rejects("new_chain", { ...chain, name: "x".repeat(101) }, "Name: 1 to 100 characters, with a letter or digit");
  rejects("new_chain", { ...chain, nutritionSourceUrl: "http://canes.com" }, "Nutrition source URL must start with https://");
  rejects("new_chain", { ...chain, alternateNames: Array(11).fill("a") }, "Alternate names: a list of at most 10");
  rejects("new_chain", { ...chain, alternateNames: "Canes" }, "Alternate names: a list of at most 10");
  rejects("new_chain", { ...chain, alternateNames: [5] }, "Alternate names: 1 to 100 characters, with a letter or digit");
  rejects("new_chain", { ...chain, calories: 5 }, "Unknown field: calories");
});
