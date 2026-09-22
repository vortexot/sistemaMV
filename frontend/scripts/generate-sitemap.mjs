import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = loadEnv(process.env.NODE_ENV || "production", projectRoot, "");
const configuredUrl = (process.env.VITE_SITE_URL || env.VITE_SITE_URL)?.trim().replace(/\/+$/, "");

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

const siteBase = siteUrl.toString().replace(/\/+$/, "");
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteBase}/</loc>
  </url>
</urlset>
`;

const outputDir = path.join(projectRoot, "dist");
await writeFile(path.join(outputDir, "sitemap.xml"), sitemap, "utf8");

const robotsPath = path.join(outputDir, "robots.txt");
const robots = await readFile(robotsPath, "utf8").catch(() => "User-agent: *\nAllow: /\n");
const withoutOldSitemap = robots.replace(/^Sitemap:.*$/gim, "").trimEnd();
await writeFile(robotsPath, `${withoutOldSitemap}\n\nSitemap: ${siteBase}/sitemap.xml\n`, "utf8");

const indexPath = path.join(outputDir, "index.html");
let indexHtml = await readFile(indexPath, "utf8");
indexHtml = indexHtml
  .replace(
    /(<meta property="og:image" content=")[^"]*(" \/>)/,
    `$1${siteBase}/mv-logo.jpg$2`,
  )
  .replace(
    /(<meta name="twitter:image" content=")[^"]*(" \/>)/,
    `$1${siteBase}/mv-logo.jpg$2`,
  )
  .replace('<meta property="og:url" content="/" />', `<meta property="og:url" content="${siteBase}/" />`)
  .replace("</head>", `  <link rel="canonical" href="${siteBase}/" />\n  </head>`);
await writeFile(indexPath, indexHtml, "utf8");
console.info(`[seo] sitemap.xml gerado para ${siteBase}`);
