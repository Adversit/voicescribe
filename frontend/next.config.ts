import type { NextConfig } from "next";

const isElectron = process.env.ELECTRON_BUILD === "true" || !process.env.ELECTRON_START_URL;

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // Use relative paths for file:// protocol in Electron
  assetPrefix: isElectron ? "./" : undefined,
};

export default nextConfig;
