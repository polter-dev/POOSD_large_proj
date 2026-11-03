const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const errorHandler = require("./middleware/error");
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const menuItemsRouter = require("./routes/menuItems");
const recommendationsRouter = require("./routes/recommendations");
const restaurantsRouter = require("./routes/restaurants");
const favoritesRouter = require("./routes/favorites");
const mealLogsRouter = require("./routes/mealLogs");
const mealPlansRouter = require("./routes/mealPlans");
const photoAnalysesRouter = require("./routes/photoAnalyses");
const submissionsRouter = require("./routes/submissions");
const adminRouter = require("./routes/admin");

const app = express();

app.use(cors());
// Before the global parser: photos need a bigger body limit than its 100 kB default.
app.use("/api/photo-analyses", photoAnalysesRouter);
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true, db: mongoose.connection.readyState === 1 });
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/menu-items", menuItemsRouter);
app.use("/api/recommendations", recommendationsRouter);
app.use("/api/restaurants", restaurantsRouter);
app.use("/api/favorites", favoritesRouter);
app.use("/api/meal-logs", mealLogsRouter);
app.use("/api/meal-plans", mealPlansRouter);
app.use("/api/submissions", submissionsRouter);
app.use("/api/admin", adminRouter);

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);

module.exports = app;
