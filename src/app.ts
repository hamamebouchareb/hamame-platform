import cors from "cors";
import express from "express";
import apiRoutes from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

// Allowed browser origins for the API, read from the ALLOWED_ORIGINS env var as a
// comma-separated list (e.g. "https://hamame.dz,https://www.hamame.dz"); each entry is
// trimmed. CORS_ORIGIN is honored as a legacy fallback. Defaults to the local frontend
// dev server so existing dev setups work with zero config changes. This is a JSON API
// using Bearer token auth (no cookies), so `credentials: true` isn't needed.
function parseCorsOrigins(raw: string | undefined): string[] {
  const defaultValue = "http://localhost:3001";
  if (!raw || raw.trim() === "") {
    return [defaultValue];
  }
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

const corsOptions: cors.CorsOptions = {
  origin: parseCorsOrigins(process.env.ALLOWED_ORIGINS ?? process.env.CORS_ORIGIN),
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

export function createApp() {
  const app = express();

  app.use(cors(corsOptions));
  // rawBody: the Chargily webhook signature is an HMAC of the exact bytes.
  // Receipt uploads carry a base64 image (≤10 MB raw), so only that route
  // gets the larger limit; everything else keeps the 100kb default.
  const keepRawBody = (req: express.Request, _res: express.Response, buf: Buffer) => {
    (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
  };
  const defaultJson = express.json({ verify: keepRawBody });
  const receiptJson = express.json({ limit: "14mb" });
  app.use((req, res, next) =>
    req.method === "POST" && req.path === "/api/wallet/transfer-deposits"
      ? receiptJson(req, res, next)
      : defaultJson(req, res, next)
  );
  app.use("/api", apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
