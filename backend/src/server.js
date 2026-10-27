require("dotenv").config();
const app = require("./app");
const { connect } = require("./config/db");

const port = process.env.PORT || 5000;

connect()
  .then(() => {
    app.listen(port, () => console.log(`API listening on port ${port}`));
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  });
