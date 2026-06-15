// Load .env if present (dev convenience — production sets env vars externally)
try { require("dotenv").config(); } catch { /* dotenv optional */ }

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const orgsRouter    = require("./routes/orgs");
const connectRouter = require("./routes/connect");
const scanRouter    = require("./routes/scan");
const historyRouter = require("./routes/history");
const aiRouter      = require("./routes/ai");

const app = express();
const PORT = 3001;
const HOST = "127.0.0.1";

// Production mode = serve the pre-built React bundle from this same Express
// process so the whole tool runs as one server on one port. Triggered by
// NODE_ENV=production OR by the presence of client/dist/index.html (so a
// shipped tarball "just works" without env vars).
const DIST_DIR = path.join(__dirname, "..", "client", "dist");
const PROD = process.env.NODE_ENV === "production"
  || fs.existsSync(path.join(DIST_DIR, "index.html"));

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);
if (PROD) {
  // Same-origin requests from the served bundle land on port 3001.
  ALLOWED_ORIGINS.add(`http://localhost:${PORT}`);
  ALLOWED_ORIGINS.add(`http://127.0.0.1:${PORT}`);
}

// Reject browser requests from any origin other than the local UI.
// Same-origin and non-browser callers (curl, EventSource for SSE) often omit
// Origin entirely — those are allowed through.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ error: "Origin not allowed" });
  }
  next();
});

app.use(cors({ origin: [...ALLOWED_ORIGINS] }));
app.use(express.json());

app.use("/api/orgs",    orgsRouter);
app.use("/api/connect", connectRouter);
app.use("/api/scan",    scanRouter);
app.use("/api/history", historyRouter);
app.use("/api/ai",      aiRouter);

if (PROD) {
  app.use(express.static(DIST_DIR));
  // SPA fallback — anything not under /api falls through to index.html so
  // client-side routing keeps working on hard-refresh.
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

app.listen(PORT, HOST, () => {
  console.log(`SF Org Analyzer server running at http://${HOST}:${PORT}`);
  if (PROD) console.log(`Mode: production (serving ${DIST_DIR})`);
});
