#!/usr/bin/env node
/*
 * Build-time sitemap.xml generator for the Otigen Book.
 *
 * mdBook doesn't ship a sitemap generator. This script walks
 * `src/SUMMARY.md`, extracts every `[title](path.md)` link, converts
 * each to its clean URL on otigen-book.pyde.network, and writes the
 * result to `src/sitemap.xml`.
 *
 * mdBook then copies `sitemap.xml` straight to the build output as a
 * static asset (non-`.md` files under src/ pass through unchanged),
 * so the final URL is `https://otigen-book.pyde.network/sitemap.xml`.
 *
 * URL convention: Amplify serves clean URLs at the hosting layer
 * (mdBook output is `book/chapters/06-consensus.html`, Amplify serves
 * it at `/chapters/06-consensus`). We emit the clean version in the
 * sitemap — that's what users click on and what Google indexes.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SUMMARY = join(REPO_ROOT, "src", "SUMMARY.md");
const OUTPUT = join(REPO_ROOT, "src", "sitemap.xml");
const SITE_URL = "https://otigen-book.pyde.network";

if (!existsSync(SUMMARY)) {
  console.error(`[sitemap] SUMMARY.md not found at ${SUMMARY}`);
  process.exit(1);
}

const raw = readFileSync(SUMMARY, "utf8");

// Match `[Title](path.md)` or `[Title](path.md "tooltip")`.
const linkRe = /\[[^\]]+\]\(([^)#?]+\.md)(?:\s+"[^"]*")?\)/g;

const seen = new Set();
const urls = [];
let m;
while ((m = linkRe.exec(raw)) !== null) {
  const mdPath = m[1].trim();
  if (mdPath.startsWith("http")) continue;
  if (seen.has(mdPath)) continue;
  seen.add(mdPath);

  let url = mdPath.replace(/\.md$/, "");
  url = url.replace(/\/README$/, "");
  urls.push(`${SITE_URL}/${url}`);
}

urls.unshift(`${SITE_URL}/`);

const today = new Date().toISOString().slice(0, 10);

const xml = [
  `<?xml version="1.0" encoding="UTF-8"?>`,
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
  ...urls.map(
    (u) =>
      `  <url>\n    <loc>${u}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>yearly</changefreq>\n    <priority>${u.endsWith("/") ? "1.0" : "0.6"}</priority>\n  </url>`,
  ),
  `</urlset>`,
  ``,
].join("\n");

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, xml);
console.log(`[sitemap] wrote ${urls.length} URLs to src/sitemap.xml`);
