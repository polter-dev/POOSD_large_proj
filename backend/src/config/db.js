const mongoose = require("mongoose");

function connect() {
  return mongoose.connect(process.env.MONGODB_URI, { dbName: "MenuMacroFitter" });
}

module.exports = { connect };
