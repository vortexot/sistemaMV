import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = loadEnv(process.env.NODE_ENV || "production", projectRoot, "");
const configuredUrl = env.VITE_SITE_URL?.trim().replace(/\/+$/, "");

if (!configuredUrl) {
  console.warn("[seo] VITE_SITE_URL não configurada; sitemap.xml não foi gerado.");
  process.exit(0);
}

let siteUrl;
try {
  siteUrl = new URL(configuredUrl);
} catch {
  console.warn("[seo] VITE_SITE_URL inválida; sitemap.xml não foi gerado.");
  process.exit(0);
}

if (!/^https?:$/.test(siteUrl.protocol)) {
  console.warn("[seo] VITE_SITE_URL deve usar HTTP ou HTTPS; sitemap.xml não foi gerado.");
  process.exit(0);
}

const origin = siteUrl.origin;
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${origin}/</loc>
  </url>
</urlset>
`;

const outputDir = path.join(projectRoot, "dist");
await writeFile(path.join(outputDir, "sitemap.xml"), sitemap, "utf8");

const robotsPath = path.join(outputDir, "robots.txt");
const robots = await readFile(robotsPath, "utf8").catch(() => "User-agent: *\nAllow: /\n");
const withoutOldSitemap = robots.replace(/^Sitemap:.*$/gim, "").trimEnd();
await writeFile(robotsPath, `${withoutOldSitemap}\n\nSitemap: ${origin}/sitemap.xml\n`, "utf8");

const indexPath = path.join(outputDir, "index.html");
let indexHtml = await readFile(indexPath, "utf8");
indexHtml = indexHtml
  .replaceAll('content="/mv-logo.jpg"', `content="${origin}/mv-logo.jpg"`)
  .replace('<meta property="og:url" content="/" />', `<meta property="og:url" content="${origin}/" />`)
  .replace("</head>", `  <link rel="canonical" href="${origin}/" />\n  </head>`);
await writeFile(indexPath, indexHtml, "utf8");
console.info(`[seo] sitemap.xml gerado para ${origin}`);
