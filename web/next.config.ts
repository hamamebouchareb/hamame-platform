import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The backend's package-lock.json lives one level up (sibling prisma/src project),
  // which makes Next.js unsure which directory is the workspace root. Pinning it here
  // avoids the "multiple lockfiles" warning and keeps builds deterministic.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
