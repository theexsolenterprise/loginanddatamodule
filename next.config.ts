import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  // Tell Next to leave these packages alone — don't bundle them; require()
  // them at runtime on the server. Needed for libs that have optional
  // peer deps Webpack would otherwise try to resolve (e.g. unzipper's S3
  // extension, archiver's stream goop, nodemailer's transport plugins).
  serverExternalPackages: [
    "unzipper",
    "archiver",
    "nodemailer",
    "googleapis",
    "@netlify/blobs",
  ],
  compress: false,
};

export default nextConfig;
