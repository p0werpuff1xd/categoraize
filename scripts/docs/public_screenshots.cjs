// Figure 12 and landing screenshots from the deployed app (public pages only,
// no sign-in, no user data).
// Usage: NODE_PATH=<apps/web/node_modules> node scripts/docs/public_screenshots.cjs <outDir> [baseUrl]
const { chromium } = require("@playwright/test");

(async () => {
  const out = process.argv[2];
  const base = process.argv[3] || "https://categoraize-35rdktlybq-eu.a.run.app";
  const browser = await chromium.launch();
  const desktop = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1280, height: 800 } });
  const shots = [
    ["/", "fig12a-landing.png", false],
    ["/login", "fig12b-login.png", false],
    ["/login/options", "fig12c-login-options.png", false],
    ["/privacy", "fig12d-privacy-notice.png", false],
  ];
  for (const [path, file, full] of shots) {
    await desktop.goto(base + path, { waitUntil: "networkidle" });
    await desktop.waitForTimeout(800); // let reveal animations finish
    await desktop.screenshot({ path: `${out}/${file}`, fullPage: full });
  }
  const mobile = await browser.newPage({ deviceScaleFactor: 3, viewport: { width: 390, height: 844 }, isMobile: true });
  await mobile.goto(base + "/login", { waitUntil: "networkidle" });
  await mobile.screenshot({ path: `${out}/fig12e-login-mobile.png` });
  await browser.close();
})();
