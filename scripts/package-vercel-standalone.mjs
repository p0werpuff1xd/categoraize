import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const appsWebDir = path.join(repoRoot, "apps", "web");
const standaloneDir = path.join(appsWebDir, ".next", "standalone");
const nextStaticDir = path.join(appsWebDir, ".next", "static");
const publicDir = path.join(appsWebDir, "public");

// Locations to generate .vercel/output (both root and apps/web for maximum compatibility)
const outputDirs = [
  path.join(repoRoot, ".vercel", "output"),
  path.join(appsWebDir, ".vercel", "output"),
];

console.log("[vercel-standalone] Packaging Next.js standalone build into Vercel Build Output API...");

if (!fs.existsSync(standaloneDir)) {
  console.error(`[vercel-standalone] Error: Standalone directory not found at ${standaloneDir}`);
  console.error("[vercel-standalone] Ensure next.config.ts has output: 'standalone' enabled during the build.");
  process.exit(1);
}

for (const outputDir of outputDirs) {
  console.log(`[vercel-standalone] Populating ${outputDir}...`);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  // 1. Static Assets (.vercel/output/static)
  const staticOutputDir = path.join(outputDir, "static");
  fs.mkdirSync(staticOutputDir, { recursive: true });

  if (fs.existsSync(publicDir)) {
    fs.cpSync(publicDir, staticOutputDir, { recursive: true });
  }

  const vercelNextStaticDir = path.join(staticOutputDir, "_next", "static");
  fs.mkdirSync(vercelNextStaticDir, { recursive: true });
  if (fs.existsSync(nextStaticDir)) {
    fs.cpSync(nextStaticDir, vercelNextStaticDir, { recursive: true });
  }

  // 2. Config File (.vercel/output/config.json)
  const config = {
    version: 3,
    routes: [
      {
        src: "/_next/static/(.*)",
        headers: {
          "cache-control": "public, max-age=31536000, immutable",
        },
        dest: "/_next/static/$1",
      },
      {
        handle: "filesystem",
      },
      {
        src: "/(.*)",
        dest: "/index",
      },
    ],
  };

  fs.writeFileSync(
    path.join(outputDir, "config.json"),
    JSON.stringify(config, null, 2),
    "utf-8"
  );

  // 3. Single Function (.vercel/output/functions/index.func)
  const funcDir = path.join(outputDir, "functions", "index.func");
  fs.mkdirSync(funcDir, { recursive: true });

  // Copy standalone files into function directory
  fs.cpSync(standaloneDir, funcDir, { recursive: true });

  // Ensure .next/static and public exist inside function for internal SSR rendering
  const funcWebNextStatic = path.join(funcDir, "apps", "web", ".next", "static");
  const funcWebPublic = path.join(funcDir, "apps", "web", "public");

  if (fs.existsSync(nextStaticDir)) {
    fs.mkdirSync(path.dirname(funcWebNextStatic), { recursive: true });
    fs.cpSync(nextStaticDir, funcWebNextStatic, { recursive: true });
  }
  if (fs.existsSync(publicDir)) {
    fs.cpSync(publicDir, funcWebPublic, { recursive: true });
  }

  // Write .vc-config.json
  const vcConfig = {
    runtime: "nodejs22.x",
    handler: "index.js",
    launcherType: "Nodejs",
    shouldAddHelpers: true,
    maxDuration: 60,
  };

  fs.writeFileSync(
    path.join(funcDir, ".vc-config.json"),
    JSON.stringify(vcConfig, null, 2),
    "utf-8"
  );

  // Write index.js launcher
  const indexJsContent = `// Auto-generated Monolithic Next.js Serverless Function Adapter for Vercel Hobby
const path = require("node:path");
const NextServer = require("next/dist/server/next-server").default;

const serverDir = path.join(__dirname, "apps", "web");
let conf = {};
try {
  conf = require(path.join(serverDir, ".next", "required-server-files.json")).config || {};
} catch (e) {
  console.warn("Could not load required-server-files.json:", e.message);
}

const nextApp = new NextServer({
  hostname: "0.0.0.0",
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  dir: serverDir,
  dev: false,
  conf,
});

const handle = nextApp.getRequestHandler();

let prepared = false;
let preparePromise = null;

module.exports = async function handler(req, res) {
  if (!prepared) {
    if (!preparePromise) {
      preparePromise = nextApp.prepare().then(() => {
        prepared = true;
      });
    }
    await preparePromise;
  }
  return handle(req, res);
};
`;

  fs.writeFileSync(path.join(funcDir, "index.js"), indexJsContent, "utf-8");
}

console.log("[vercel-standalone] Successfully packaged standalone Next.js build into 1 Vercel Function!");

