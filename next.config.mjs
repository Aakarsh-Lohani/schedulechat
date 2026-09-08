import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

// Look for secrets outside the project folder first, fallback to local
const externalEnv = path.resolve(process.cwd(), "..", "secrets", ".env.local");
if (fs.existsSync(externalEnv)) {
  dotenv.config({ path: externalEnv });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
