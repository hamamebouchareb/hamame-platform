import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The backend's package-lock.json lives one level up (sibling prisma/src project),
  // which makes Next.js unsure which directory is the workspace root. Pinning it here
  // avoids the "multiple lockfiles" warning and keeps builds deterministic.
  turbopack: {
    root: path.join(__dirname),
  },
  // Playwright (and anyone reaching the dev server through 127.0.0.1) triggers
  // Next 16's dev-resource origin block: the HMR socket never connects, so
  // pages serve SSR HTML but never hydrate — client effects (like the /messages
  // auth redirect) never run. Allow the loopback host used by the e2e harness.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
