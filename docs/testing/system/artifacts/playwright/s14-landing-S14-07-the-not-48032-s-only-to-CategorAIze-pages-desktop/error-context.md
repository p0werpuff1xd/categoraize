# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: s14-landing.spec.ts >> S14-07 the not-found page links only to CategorAIze pages
- Location: __tests__\system\s14-landing.spec.ts:93:5

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
  8   | test("S14-01 signed-out visitor at / lands on the sign-in page", async ({
  9   |   page,
  10  | }) => {
  11  |   const response = await page.goto("/");
  12  |   expect(response?.ok()).toBe(true);
  13  |   await expect(page).toHaveURL(/\/login(\?|$)/);
  14  |   await page.screenshot({
  15  |     path: test.info().outputPath("landing.png"),
  16  |     fullPage: true,
  17  |   });
  18  | });
  19  | 
  20  | for (const pagePath of PUBLIC_PAGES) {
  21  |   test(`S14-02 every link on ${pagePath} resolves`, async ({
  22  |     page,
  23  |     request,
  24  |   }) => {
  25  |     await page.goto(pagePath);
  26  |     const hrefs = await page
  27  |       .locator("body a[href]")
  28  |       .evaluateAll((links) => [
  29  |         ...new Set(links.map((a) => (a as HTMLAnchorElement).href)),
  30  |       ]);
  31  |     const broken: string[] = [];
  32  |     for (const href of hrefs) {
  33  |       if (!href.startsWith("http")) continue;
  34  |       const res = await request.get(href, {
  35  |         maxRedirects: 5,
  36  |         failOnStatusCode: false,
  37  |       });
  38  |       if (res.status() >= 400) broken.push(`${res.status()} ${href}`);
  39  |     }
  40  |     test
  41  |       .info()
  42  |       .annotations.push({ type: "links", description: hrefs.join(" ") });
  43  |     expect(broken, `broken links on ${pagePath}`).toEqual([]);
  44  |   });
  45  | }
  46  | 
  47  | test("S14-03 page links stay on CategorAIze pages (no leftover upstream links)", async ({
  48  |   page,
  49  |   baseURL,
  50  | }) => {
  51  |   const own = new URL(baseURL!).hostname.split("-")[0]; // "categoraize"
  52  |   const foreign: string[] = [];
  53  |   for (const pagePath of PUBLIC_PAGES) {
  54  |     await page.goto(pagePath);
  55  |     const hrefs = await page
  56  |       .locator("body a[href]")
  57  |       .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
  58  |     for (const href of hrefs) {
  59  |       const host = new URL(href).hostname;
  60  |       if (
  61  |         !host.startsWith(own) &&
  62  |         !/(google|microsoft|live)\.com$/.test(host)
  63  |       ) {
  64  |         foreign.push(`${pagePath} -> ${href}`);
  65  |       }
  66  |     }
  67  |   }
  68  |   expect(foreign).toEqual([]);
  69  | });
  70  | 
  71  | for (const protectedPath of [
  72  |   "/welcome-redirect",
  73  |   "/accounts",
  74  |   "/setup",
  75  |   "/settings",
  76  | ]) {
  77  |   test(`S14-04 signed-out ${protectedPath} redirects to sign-in`, async ({
  78  |     page,
  79  |   }) => {
  80  |     await page.goto(protectedPath);
  81  |     await expect(page).toHaveURL(/\/login/);
  82  |   });
  83  | }
  84  | 
  85  | test("S14-05 unknown page shows the not-found page with status 404", async ({
  86  |   page,
  87  | }) => {
  88  |   const response = await page.goto("/this-page-does-not-exist-s14");
  89  |   expect(response?.status()).toBe(404);
  90  |   await expect(page.getByText(/not found|404/i).first()).toBeVisible();
  91  | });
  92  | 
  93  | test("S14-07 the not-found page links only to CategorAIze pages", async ({
  94  |   page,
  95  | }) => {
  96  |   test.fail(
  97  |     true,
  98  |     "SYS-D04: the not-found page links to the upstream Inbox Zero documentation",
  99  |   );
  100 |   await page.goto("/this-page-does-not-exist-s14");
  101 |   const upstream = await page
  102 |     .locator('a[href*="getinboxzero.com"]')
  103 |     .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
  104 |   test.info().annotations.push({
  105 |     type: "upstream-links",
  106 |     description: upstream.join(" "),
  107 |   });
> 108 |   expect(upstream).toEqual([]);
      |                    ^ Error: expect(received).toEqual(expected) // deep equality
  109 | });
  110 | 
  111 | test("S14-06 signed-in visitor at / goes to the app", async () => {
  112 |   test.skip(
  113 |     true,
  114 |     "BLOCKED: needs a signed-in test account (test accounts not created yet)",
  115 |   );
  116 | });
  117 | 
```