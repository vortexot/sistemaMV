const rawBackendOrigin = process.env.BACKEND_ORIGIN?.trim().replace(/\/+$/, "");

if (!rawBackendOrigin) {
  throw new Error(
    "BACKEND_ORIGIN is required. Deploy the FastAPI API with MongoDB and durable upload storage first.",
  );
}

const backend = new URL(rawBackendOrigin);
if (
  backend.protocol !== "https:" ||
  backend.username ||
  backend.password ||
  backend.pathname !== "/" ||
  backend.search ||
  backend.hash
) {
  throw new Error("BACKEND_ORIGIN must be a bare HTTPS origin without credentials, path, query or fragment.");
}

const securityHeaders = [
  { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://images.unsplash.com https://www.google-analytics.com; font-src 'self' data:; connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
];

export default {
  $schema: "https://openapi.vercel.sh/vercel.json",
  framework: "vite",
  installCommand: "npm ci --no-audit --no-fund",
  buildCommand: "npm run build",
  outputDirectory: "dist",
  cleanUrls: true,
  trailingSlash: false,
  rewrites: [
    { source: "/api/:path*", destination: `${rawBackendOrigin}/api/:path*` },
    { source: "/:path*", destination: "/index.html" },
  ],
  headers: [
    { source: "/", headers: securityHeaders },
    {
      source: "/:path*",
      headers: securityHeaders,
    },
    {
      source: "/assets/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    },
  ],
};
