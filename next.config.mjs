/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // sharp is a native addon; without this its binary isn't traced into the Vercel serverless bundle.
  serverExternalPackages: ["sharp"],
}

export default nextConfig
