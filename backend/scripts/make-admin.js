#!/usr/bin/env node
// Grant or revoke the admin role (M6, #107). The only way to make an admin: there is no HTTP route for it,
// so it takes shell access to the server. Same login as everyone else afterwards; no separate admin login.
//
//   node scripts/make-admin.js <username>            # role: "admin"
//   node scripts/make-admin.js <username> --revoke   # back to a normal user (role removed)
//
// Reads MONGODB_URI from backend/.env, like the API. Exits 1 if the user doesn't exist.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const mongoose = require("mongoose");

async function main() {
  const args = process.argv.slice(2);
  const revoke = args.includes("--revoke");
  const names = args.filter((a) => a !== "--revoke");
  if (names.length !== 1 || names[0].startsWith("-")) {
    console.error("Usage: node scripts/make-admin.js <username> [--revoke]");
    return 2;
  }
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set (backend/.env)");
    return 2;
  }
  const username = names[0].trim().toLowerCase(); // usernames are stored lowercase

  await mongoose.connect(process.env.MONGODB_URI, { dbName: "MenuMacroFitter", serverSelectionTimeoutMS: 10000 });
  try {
    // Straight to the collection: the users validator still checks the write ("admin" is the only role value
    // besides the default), and nothing here depends on the API's models.
    const users = mongoose.connection.db.collection("users");
    const update = revoke
      ? { $unset: { role: "" }, $set: { updatedAt: new Date() } } // missing role = "user"
      : { $set: { role: "admin", updatedAt: new Date() } };
    const user = await users.findOneAndUpdate({ username }, update, { returnDocument: "after", projection: { username: 1, email: 1, role: 1 } });
    if (!user) {
      console.error(`No user "${username}"`);
      return 1;
    }
    console.log(`${user.username} (${user.email}) is now ${user.role === "admin" ? "an admin" : "a normal user"}`);
    return 0;
  } finally {
    await mongoose.disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err.message);
    process.exit(1);
  },
);
