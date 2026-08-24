import cors from "cors";
import express from "express";
import apiRoutes from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

// Allowed browser origins for the API, read from the CORS_ORIGIN env var as a
// comma-separated list (e.g. "http://localhost:3001,https://hamame.dz"); each entry is
// trimmed. Defaults to the local frontend dev server so existing dev setups work with
// zero config changes. This is a JSON API using Bearer token auth (no cookies), so
// `credentials: true` isn't needed.
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
  origin: parseCorsOrigins(process.env.CORS_ORIGIN),
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

export function createApp() {
  const app = express();

  app.use(cors(corsOptions));
  app.use(express.json());
  app.use("/api", apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
