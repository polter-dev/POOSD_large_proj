// pm2 process for the API. cwd is backend/ so dotenv finds backend/.env.
module.exports = {
  apps: [
    {
      name: "api",
      cwd: require("path").join(__dirname, "..", "backend"),
      script: "src/server.js",
      env: { NODE_ENV: "production" },
    },
  ],
};
