import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const marketingToken = process.env.GITHUB_MARKETING_TOKEN;
if (!marketingToken) {
  console.log("ℹ️  No GITHUB_MARKETING_TOKEN provided – skipping private marketing clone.");
  process.exit(0);
}

const root = process.cwd();
const marketingDir = path.join(root, "apps", "web", "app", "(marketing)");
const landingDir = path.join(marketingDir, "(landing)");

if (existsSync(landingDir)) {
  console.log("✅ Marketing directory already exists – nothing to clone.");
  process.exit(0);
}

console.log("🚀 Cloning private marketing repository...");
const repoUrl = `https://${marketingToken}@github.com/inbox-zero/marketing.git`;
const result = spawnSync("git", ["clone", "--depth", "1", repoUrl, marketingDir], {
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`✅ Private marketing repository cloned to ${marketingDir}`);
