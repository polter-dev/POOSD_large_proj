// mongosh script, CI only (backend-mongodb job), run after schema.js and seed.js and before schema.js again.
//
// Puts the database in the state production was in: a users validator from before #107, so it doesn't know
// preferences.trackedNutrients, and checks that saving the field then fails the way the live API did (Mongo
// error 121, which the API reports as a 500). The schema.js run after this, which deploy/deploy.sh now does on
// every deploy, has to fix it: the API tests that follow PATCH trackedNutrients.

db = db.getSiblingDB("MenuMacroFitter");

const validator = db.getCollectionInfos({ name: "users" })[0].options.validator;
delete validator.$jsonSchema.properties.preferences.properties.trackedNutrients;
const res = db.runCommand({ collMod: "users", validator });
if (!res.ok) throw new Error(`collMod users failed: ${res.errmsg}`);

const user = db.users.findOne({}, { _id: 1 });
let code = null;
try {
  db.users.updateOne({ _id: user._id }, { $set: { "preferences.trackedNutrients": ["calories"] } });
} catch (err) {
  code = err.code;
}
if (code !== 121) throw new Error(`the old validator should reject trackedNutrients with code 121, got ${code}`);
print("old users validator rejects trackedNutrients (code 121), as production did");
