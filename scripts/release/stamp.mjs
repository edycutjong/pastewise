// Stamps the latest GitHub release tag into the static landing page and pitch deck (public/about, public/pitch).
// Runs as `prebuild`, so `npm run build` (local, CI and Vercel) always refreshes it. The pages never call GitHub
// themselves: the tag is written into the markup at build time, so visitors make no third-party request (see CSP).
//
// Source of truth, in order:
//   1. GitHub API  repos/<repo>/releases/latest   (GITHUB_TOKEN if set, else unauthenticated; 5 s timeout)
//   2. git describe --tags --abbrev=0              (works offline; fails on a shallow clone with no tags)
//   3. package.json "version"                      (always there, so the build never fails on this step)
//
// Each page marks the spot with one anchor in this exact shape; only its href and text are rewritten:
//   <a class="release" data-release href="https://github.com/<repo>/releases/...">v0.1.0</a>
//
// Usage: node scripts/release/stamp.mjs [--offline]   (--offline skips step 1)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const REPO = "edycutjong/pastewise";
const RELEASES = `https://github.com/${REPO}/releases`;
const PAGES = ["public/about/index.html", "public/pitch/index.html"];
const ANCHOR = /<a class="release" data-release href="[^"]*">[^<]*<\/a>/g;
// Tags are written into HTML, so only plain semver-shaped tags are accepted.
const TAG = /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const asTag = (t) => (typeof t === "string" && TAG.test(t.trim()) ? t.trim() : null);
const tagUrl = (tag) => `${RELEASES}/tag/${encodeURIComponent(tag)}`;

async function fromGitHub() {
  const headers = { accept: "application/vnd.github+json", "user-agent": "pastewise-build", "x-github-api-version": "2022-11-28" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  const tag = asTag(body.tag_name);
  if (!tag) throw new Error(`unexpected tag_name ${JSON.stringify(body.tag_name)}`);
  const href = typeof body.html_url === "string" && body.html_url.startsWith(`${RELEASES}/`) ? body.html_url : tagUrl(tag);
  return { tag, href, source: "github-api" };
}

function fromGit() {
  const out = execFileSync("git", ["describe", "--tags", "--abbrev=0"], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] });
  const tag = asTag(out.toString());
  if (!tag) throw new Error("no semver tag");
  return { tag, href: tagUrl(tag), source: "git-describe" };
}

function fromPackage() {
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const tag = asTag(`v${version}`);
  if (!tag) throw new Error(`package.json version ${JSON.stringify(version)} is not semver`);
  // The version may not be released yet, so link the releases list rather than a tag that might not exist.
  return { tag, href: `${RELEASES}/latest`, source: "package.json" };
}

async function resolveRelease({ offline }) {
  const steps = offline ? [fromGit, fromPackage] : [fromGitHub, fromGit, fromPackage];
  for (const step of steps) {
    try {
      return await step();
    } catch (e) {
      console.warn(`release stamp: ${step.name} skipped (${e.message})`);
    }
  }
  throw new Error("unreachable: package.json fallback failed");
}

const release = await resolveRelease({ offline: process.argv.includes("--offline") });
const anchor = `<a class="release" data-release href="${release.href}">${release.tag}</a>`;
for (const rel of PAGES) {
  const file = path.join(ROOT, rel);
  const html = fs.readFileSync(file, "utf8");
  const count = (html.match(ANCHOR) ?? []).length;
  if (!count) throw new Error(`${rel}: no release anchor found; the page markup changed`);
  const next = html.replace(ANCHOR, anchor);
  if (next !== html) fs.writeFileSync(file, next);
  console.log(`release stamp: ${rel} → ${release.tag} (${count}×, ${release.source}${next === html ? ", unchanged" : ""})`);
}
