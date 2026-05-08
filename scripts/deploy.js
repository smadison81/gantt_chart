#!/usr/bin/env node
// Deploy dist-single/index.html to a Quickbase code page via API_AddReplaceDBPage.
// Usage:
//   1. Copy deploy.config.example.json to deploy.config.json and fill in realm + appDbid + pageName.
//   2. Set QB_USER_TOKEN in your environment (or .env if using `node --env-file=.env`).
//   3. Run: npm run deploy
// First run creates the page and writes the returned pageId back into deploy.config.json.
// Subsequent runs update the existing page in place.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "deploy.config.json");
const BUNDLE_PATH = path.join(ROOT, "dist-single", "index.html");

function fail(msg, hint) {
  console.error("✖ " + msg);
  if (hint) console.error("  " + hint);
  process.exit(1);
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fail(
      `Missing ${path.relative(ROOT, CONFIG_PATH)}.`,
      `Copy deploy.config.example.json to deploy.config.json and fill in your realm, appDbid, and pageName.`
    );
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  if (!cfg.realm) fail(`deploy.config.json: "realm" is required (e.g. "cag.quickbase.com").`);
  if (!cfg.appDbid) fail(`deploy.config.json: "appDbid" is required (the QB application DBID).`);
  if (!cfg.pageId && !cfg.pageName) {
    fail(
      `deploy.config.json: need either "pageId" (to update) or "pageName" (to create).`,
      `For a first deploy set "pageName" only; the script will create the page and save the returned pageId.`
    );
  }
  return cfg;
}

function loadBundle() {
  if (!fs.existsSync(BUNDLE_PATH)) {
    fail(
      `Missing ${path.relative(ROOT, BUNDLE_PATH)}.`,
      `Run: npm run build:single`
    );
  }
  return fs.readFileSync(BUNDLE_PATH, "utf8");
}

function parseTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : "";
}

async function main() {
  const cfg = loadConfig();
  const token = process.env.QB_USER_TOKEN;
  if (!token) {
    fail(
      `Missing QB_USER_TOKEN environment variable.`,
      `Set it in your shell, or create .env with QB_USER_TOKEN=<token> and run: node --env-file=.env scripts/deploy.js`
    );
  }

  const html = loadBundle();
  const sizeKB = (Buffer.byteLength(html, "utf8") / 1024).toFixed(1);
  const isCreate = !cfg.pageId;

  console.log(`→ ${isCreate ? "Creating" : "Updating"} code page on ${cfg.realm}/${cfg.appDbid}`);
  console.log(`  Bundle: ${path.relative(ROOT, BUNDLE_PATH)} (${sizeKB} KB)`);
  if (cfg.pageId) console.log(`  Page ID: ${cfg.pageId}`);
  if (cfg.pageName) console.log(`  Page name: ${cfg.pageName}`);

  const params = new URLSearchParams();
  params.set("usertoken", token);
  params.set("pagetype", "1"); // 1 = HTML/text
  if (cfg.pageId) params.set("pageid", String(cfg.pageId));
  if (cfg.pageName) params.set("pagename", cfg.pageName);
  params.set("pagebody", html);

  const url = `https://${cfg.realm}/db/${cfg.appDbid}?act=API_AddReplaceDBPage`;
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (err) {
    fail(`Network error: ${err.message}`);
  }
  const text = await res.text();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  if (!res.ok) {
    console.error(text.slice(0, 600));
    fail(`HTTP ${res.status} from Quickbase after ${elapsed}s.`);
  }

  const errcode = parseTag(text, "errcode");
  const errtext = parseTag(text, "errtext");
  const detail = parseTag(text, "errdetail");
  const returnedId = parseTag(text, "pageID") || parseTag(text, "pageid");

  if (errcode && errcode !== "0") {
    console.error(text.slice(0, 600));
    fail(`Quickbase API error ${errcode}: ${errtext}${detail ? " — " + detail : ""}`);
  }

  const finalId = returnedId || cfg.pageId;
  console.log(`✓ ${isCreate ? "Created" : "Updated"} in ${elapsed}s. Page ID: ${finalId}`);
  console.log(`  Open: https://${cfg.realm}/db/${cfg.appDbid}?a=dbpage&pageID=${finalId}`);

  if (isCreate && returnedId) {
    cfg.pageId = Number(returnedId);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
    console.log(`  Saved pageId ${returnedId} to ${path.relative(ROOT, CONFIG_PATH)}.`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
