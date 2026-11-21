// Screenshot the #fig element of local HTML files to PNG at 2x scale.
// Usage: NODE_PATH=<apps/web/node_modules> node scripts/docs/html2png.cjs in.html out.png [in2.html out2.png ...]
const { chromium } = require("@playwright/test");

(async () => {
  const pairs = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1300, height: 900 } });
  for (let i = 0; i < pairs.length; i += 2) {
    const url = "file:///" + pairs[i].split(String.fromCharCode(92)).join("/");
    await page.goto(url);
    await page.locator("#fig").screenshot({ path: pairs[i + 1] });
  }
  await browser.close();
})();
