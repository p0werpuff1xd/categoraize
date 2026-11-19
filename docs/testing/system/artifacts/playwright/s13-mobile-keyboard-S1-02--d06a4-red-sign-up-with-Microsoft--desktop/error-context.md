# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: s13-mobile-keyboard.spec.ts >> S1-02 Microsoft sign-in is offered (sign up with Microsoft)
- Location: __tests__\system\s13-mobile-keyboard.spec.ts:63:5

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - main [ref=f1e2]:
    - generic [ref=f1e3]:
      - heading "Other options" [level=1] [ref=f1e4]
      - generic [ref=f1e5]:
        - link "Email code (existing accounts)" [ref=f1e6] [cursor=pointer]:
          - /url: /login/email?next=%2Fwelcome-redirect
        - link "Back" [ref=f1e7] [cursor=pointer]:
          - /url: /login?next=%2Fwelcome-redirect
  - region "Notifications alt+T"
  - alert [ref=f1e8]
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | // S13 Non-functional (UI half): 390 px mobile pass and keyboard-only navigation
  4  | // on the public pages. The signed-in inbox needs a test account (BLOCKED).
  5  | const PAGES = ["/login", "/privacy", "/terms"];
  6  | 
  7  | for (const pagePath of PAGES) {
  8  |   test(`S13-M0${PAGES.indexOf(pagePath) + 1} ${pagePath} fits a 390 px screen without sideways scrolling @mobile`, async ({ page }) => {
  9  |     await page.goto(pagePath);
  10 |     await page.waitForLoadState("networkidle");
  11 |     const { scroll, client } = await page.evaluate(() => ({
  12 |       scroll: document.documentElement.scrollWidth,
  13 |       client: document.documentElement.clientWidth,
  14 |     }));
  15 |     await page.screenshot({
  16 |       path: test.info().outputPath(`mobile-${pagePath.slice(1)}.png`),
  17 |       fullPage: true,
  18 |     });
  19 |     expect(scroll, `scrollWidth ${scroll} vs clientWidth ${client}`).toBeLessThanOrEqual(client + 1);
  20 |   });
  21 | }
  22 | 
  23 | async function tabUntil(page: import("@playwright/test").Page, pattern: RegExp) {
  24 |   const reached: string[] = [];
  25 |   let focusVisible = true;
  26 |   for (let i = 0; i < 20; i++) {
  27 |     await page.keyboard.press("Tab");
  28 |     const info = await page.evaluate(() => {
  29 |       const el = document.activeElement as HTMLElement | null;
  30 |       if (!el || el === document.body) return null;
  31 |       const style = getComputedStyle(el);
  32 |       const visible =
  33 |         style.outlineStyle !== "none" || style.boxShadow !== "none" || el.matches(":focus-visible");
  34 |       return { text: (el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 40), visible };
  35 |     });
  36 |     if (!info) continue;
  37 |     reached.push(info.text);
  38 |     focusVisible &&= info.visible;
  39 |     if (pattern.test(info.text)) return { found: true, reached, focusVisible };
  40 |   }
  41 |   return { found: false, reached, focusVisible };
  42 | }
  43 | 
  44 | test("S13-K01 sign-in is reachable and usable with the keyboard only", async ({ page }) => {
  45 |   await page.goto("/login");
  46 |   const google = await tabUntil(page, /google/i);
  47 |   expect(google.found, google.reached.join(" | ")).toBe(true);
  48 |   const other = await tabUntil(page, /other options/i);
  49 |   expect(other.found, other.reached.join(" | ")).toBe(true);
  50 |   await page.keyboard.press("Enter");
  51 |   await page.waitForURL(/\/login\/options/);
  52 |   await page.getByRole("link", { name: /back/i }).waitFor();
  53 |   const options = await tabUntil(page, /back/i);
  54 |   test.info().annotations.push({
  55 |     type: "tab-order",
  56 |     description: [...google.reached, ...other.reached, "(Enter)", ...options.reached].join(" | "),
  57 |   });
  58 |   await page.screenshot({ path: test.info().outputPath("keyboard-other-options.png") });
  59 |   expect(options.found, `Tab on /login/options reached: ${options.reached.join(" | ") || "nothing"}`).toBe(true);
  60 |   expect(google.focusVisible && other.focusVisible && options.focusVisible).toBe(true);
  61 | });
  62 | 
  63 | test("S1-02 Microsoft sign-in is offered (sign up with Microsoft)", async ({ page }) => {
  64 |   test.fail(true, "SYS-D05: production has no Microsoft OAuth settings, so no Microsoft sign-in");
  65 |   await page.goto("/login");
  66 |   const onLogin = await page.getByRole("button", { name: /microsoft/i }).count();
  67 |   await page.goto("/login/options");
  68 |   const onOptions = await page.getByRole("button", { name: /microsoft/i }).count();
  69 |   await page.screenshot({ path: test.info().outputPath("login-options-no-microsoft.png") });
  70 |   test.info().annotations.push({ type: "microsoft-buttons", description: `${onLogin} on /login, ${onOptions} on /login/options` });
> 71 |   expect(onLogin + onOptions).toBeGreaterThan(0);
     |                               ^ Error: expect(received).toBeGreaterThan(expected)
  72 | });
  73 | 
  74 | test("S13-I01 inbox page on mobile and keyboard", async () => {
  75 |   test.skip(true, "BLOCKED: the inbox needs a signed-in test account (test accounts not created yet)");
  76 | });
  77 | 
```