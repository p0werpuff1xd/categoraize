import { expect, test } from "@playwright/test";

// S13 Non-functional (UI half): 390 px mobile pass and keyboard-only navigation
// on the public pages. The signed-in inbox needs a test account (BLOCKED).
const PAGES = ["/login", "/privacy", "/terms"];

for (const pagePath of PAGES) {
  test(`S13-M0${PAGES.indexOf(pagePath) + 1} ${pagePath} fits a 390 px screen without sideways scrolling @mobile`, async ({
    page,
  }) => {
    await page.goto(pagePath);
    await page.waitForLoadState("networkidle");
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    await page.screenshot({
      path: test.info().outputPath(`mobile-${pagePath.slice(1)}.png`),
      fullPage: true,
    });
    expect(
      scroll,
      `scrollWidth ${scroll} vs clientWidth ${client}`,
    ).toBeLessThanOrEqual(client + 1);
  });
}

async function tabUntil(
  page: import("@playwright/test").Page,
  pattern: RegExp,
) {
  const reached: string[] = [];
  let focusVisible = true;
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const visible =
        style.outlineStyle !== "none" ||
        style.boxShadow !== "none" ||
        el.matches(":focus-visible");
      return {
        text: (el.innerText || el.getAttribute("aria-label") || el.tagName)
          .trim()
          .slice(0, 40),
        visible,
      };
    });
    if (!info) continue;
    reached.push(info.text);
    focusVisible &&= info.visible;
    if (pattern.test(info.text)) return { found: true, reached, focusVisible };
  }
  return { found: false, reached, focusVisible };
}

test("S13-K01 sign-in is reachable and usable with the keyboard only", async ({
  page,
}) => {
  await page.goto("/login");
  const google = await tabUntil(page, /google/i);
  expect(google.found, google.reached.join(" | ")).toBe(true);
  const other = await tabUntil(page, /other options/i);
  expect(other.found, other.reached.join(" | ")).toBe(true);
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/login\/options/);
  await page.getByRole("link", { name: /back/i }).waitFor();
  const options = await tabUntil(page, /back/i);
  test.info().annotations.push({
    type: "tab-order",
    description: [
      ...google.reached,
      ...other.reached,
      "(Enter)",
      ...options.reached,
    ].join(" | "),
  });
  await page.screenshot({
    path: test.info().outputPath("keyboard-other-options.png"),
  });
  expect(
    options.found,
    `Tab on /login/options reached: ${options.reached.join(" | ") || "nothing"}`,
  ).toBe(true);
  expect(
    google.focusVisible && other.focusVisible && options.focusVisible,
  ).toBe(true);
});

test("S1-02 Microsoft sign-in is offered (sign up with Microsoft)", async ({
  page,
}) => {
  test.fail(
    true,
    "SYS-D05: production has no Microsoft OAuth settings, so no Microsoft sign-in",
  );
  await page.goto("/login");
  const onLogin = await page
    .getByRole("button", { name: /microsoft/i })
    .count();
  await page.goto("/login/options");
  const onOptions = await page
    .getByRole("button", { name: /microsoft/i })
    .count();
  await page.screenshot({
    path: test.info().outputPath("login-options-no-microsoft.png"),
  });
  test.info().annotations.push({
    type: "microsoft-buttons",
    description: `${onLogin} on /login, ${onOptions} on /login/options`,
  });
  expect(onLogin + onOptions).toBeGreaterThan(0);
});

test("S13-I01 inbox page on mobile and keyboard", async () => {
  test.skip(
    true,
    "BLOCKED: the inbox needs a signed-in test account (test accounts not created yet)",
  );
});
