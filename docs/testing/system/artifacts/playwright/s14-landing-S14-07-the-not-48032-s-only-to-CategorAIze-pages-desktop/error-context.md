# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: s14-landing.spec.ts >> S14-07 the not-found page links only to CategorAIze pages
- Location: __tests__\system\s14-landing.spec.ts:63:5

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "https://docs.getinboxzero.com/",
+ ]
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e3]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - heading "Page Not Found" [level=3] [ref=e7]
        - paragraph [ref=e8]: The page you are looking for could not be found.
      - generic [ref=e10]:
        - link "Return Home" [ref=e11] [cursor=pointer]:
          - /url: /
        - link "Documentation" [ref=e12] [cursor=pointer]:
          - /url: https://docs.getinboxzero.com
  - region "Notifications alt+T"
  - alert [ref=e13]
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | // S14 Landing page: links, dead pages, nav/footer, auth redirects (signed out).
  4  | // The landing route "/" sends signed-out visitors to /login, so /login is the
  5  | // landing page; /privacy and /terms are the public pages it links to.
  6  | const PUBLIC_PAGES = ["/login", "/privacy", "/terms"];
  7  | 
  8  | test("S14-01 signed-out visitor at / lands on the sign-in page", async ({ page }) => {
  9  |   const response = await page.goto("/");
  10 |   expect(response?.ok()).toBe(true);
  11 |   await expect(page).toHaveURL(/\/login(\?|$)/);
  12 |   await page.screenshot({ path: test.info().outputPath("landing.png"), fullPage: true });
  13 | });
  14 | 
  15 | for (const pagePath of PUBLIC_PAGES) {
  16 |   test(`S14-02 every link on ${pagePath} resolves`, async ({ page, request }) => {
  17 |     await page.goto(pagePath);
  18 |     const hrefs = await page
  19 |       .locator("body a[href]")
  20 |       .evaluateAll((links) => [...new Set(links.map((a) => (a as HTMLAnchorElement).href))]);
  21 |     const broken: string[] = [];
  22 |     for (const href of hrefs) {
  23 |       if (!href.startsWith("http")) continue;
  24 |       const res = await request.get(href, { maxRedirects: 5, failOnStatusCode: false });
  25 |       if (res.status() >= 400) broken.push(`${res.status()} ${href}`);
  26 |     }
  27 |     test.info().annotations.push({ type: "links", description: hrefs.join(" ") });
  28 |     expect(broken, `broken links on ${pagePath}`).toEqual([]);
  29 |   });
  30 | }
  31 | 
  32 | test("S14-03 page links stay on CategorAIze pages (no leftover upstream links)", async ({ page, baseURL }) => {
  33 |   const own = new URL(baseURL!).hostname.split("-")[0]; // "categoraize"
  34 |   const foreign: string[] = [];
  35 |   for (const pagePath of PUBLIC_PAGES) {
  36 |     await page.goto(pagePath);
  37 |     const hrefs = await page
  38 |       .locator("body a[href]")
  39 |       .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
  40 |     for (const href of hrefs) {
  41 |       const host = new URL(href).hostname;
  42 |       if (!host.startsWith(own) && !/(google|microsoft|live)\.com$/.test(host)) {
  43 |         foreign.push(`${pagePath} -> ${href}`);
  44 |       }
  45 |     }
  46 |   }
  47 |   expect(foreign).toEqual([]);
  48 | });
  49 | 
  50 | for (const protectedPath of ["/welcome-redirect", "/accounts", "/setup", "/settings"]) {
  51 |   test(`S14-04 signed-out ${protectedPath} redirects to sign-in`, async ({ page }) => {
  52 |     await page.goto(protectedPath);
  53 |     await expect(page).toHaveURL(/\/login/);
  54 |   });
  55 | }
  56 | 
  57 | test("S14-05 unknown page shows the not-found page with status 404", async ({ page }) => {
  58 |   const response = await page.goto("/this-page-does-not-exist-s14");
  59 |   expect(response?.status()).toBe(404);
  60 |   await expect(page.getByText(/not found|404/i).first()).toBeVisible();
  61 | });
  62 | 
  63 | test("S14-07 the not-found page links only to CategorAIze pages", async ({ page }) => {
  64 |   test.fail(true, "SYS-D04: the not-found page links to the upstream Inbox Zero documentation");
  65 |   await page.goto("/this-page-does-not-exist-s14");
  66 |   const upstream = await page.locator('a[href*="getinboxzero.com"]').evaluateAll((links) =>
  67 |     links.map((a) => (a as HTMLAnchorElement).href),
  68 |   );
  69 |   test.info().annotations.push({ type: "upstream-links", description: upstream.join(" ") });
> 70 |   expect(upstream).toEqual([]);
     |                    ^ Error: expect(received).toEqual(expected) // deep equality
  71 | });
  72 | 
  73 | test("S14-06 signed-in visitor at / goes to the app", async () => {
  74 |   test.skip(true, "BLOCKED: needs a signed-in test account (test accounts not created yet)");
  75 | });
  76 | 
```