import { expect, test } from "@playwright/test";

// S14 Landing page: links, dead pages, nav/footer, auth redirects (signed out).
// The landing route "/" sends signed-out visitors to /login, so /login is the
// landing page; /privacy and /terms are the public pages it links to.
const PUBLIC_PAGES = ["/login", "/privacy", "/terms"];

test("S14-01 signed-out visitor at / lands on the sign-in page", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page).toHaveURL(/\/login(\?|$)/);
  await page.screenshot({
    path: test.info().outputPath("landing.png"),
    fullPage: true,
  });
});

for (const pagePath of PUBLIC_PAGES) {
  test(`S14-02 every link on ${pagePath} resolves`, async ({
    page,
    request,
  }) => {
    await page.goto(pagePath);
    const hrefs = await page
      .locator("body a[href]")
      .evaluateAll((links) => [
        ...new Set(links.map((a) => (a as HTMLAnchorElement).href)),
      ]);
    const broken: string[] = [];
    for (const href of hrefs) {
      if (!href.startsWith("http")) continue;
      const res = await request.get(href, {
        maxRedirects: 5,
        failOnStatusCode: false,
      });
      if (res.status() >= 400) broken.push(`${res.status()} ${href}`);
    }
    test
      .info()
      .annotations.push({ type: "links", description: hrefs.join(" ") });
    expect(broken, `broken links on ${pagePath}`).toEqual([]);
  });
}

test("S14-03 page links stay on CategorAIze pages (no leftover upstream links)", async ({
  page,
  baseURL,
}) => {
  const own = new URL(baseURL!).hostname.split("-")[0]; // "categoraize"
  const foreign: string[] = [];
  for (const pagePath of PUBLIC_PAGES) {
    await page.goto(pagePath);
    const hrefs = await page
      .locator("body a[href]")
      .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
    for (const href of hrefs) {
      const host = new URL(href).hostname;
      if (
        !host.startsWith(own) &&
        !/(google|microsoft|live)\.com$/.test(host)
      ) {
        foreign.push(`${pagePath} -> ${href}`);
      }
    }
  }
  expect(foreign).toEqual([]);
});

for (const protectedPath of [
  "/welcome-redirect",
  "/accounts",
  "/setup",
  "/settings",
]) {
  test(`S14-04 signed-out ${protectedPath} redirects to sign-in`, async ({
    page,
  }) => {
    await page.goto(protectedPath);
    await expect(page).toHaveURL(/\/login/);
  });
}

test("S14-05 unknown page shows the not-found page with status 404", async ({
  page,
}) => {
  const response = await page.goto("/this-page-does-not-exist-s14");
  expect(response?.status()).toBe(404);
  await expect(page.getByText(/not found|404/i).first()).toBeVisible();
});

test("S14-07 the not-found page links only to CategorAIze pages", async ({
  page,
}) => {
  test.fail(
    true,
    "SYS-D04: the not-found page links to the upstream Inbox Zero documentation",
  );
  await page.goto("/this-page-does-not-exist-s14");
  const upstream = await page
    .locator('a[href*="getinboxzero.com"]')
    .evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href));
  test.info().annotations.push({
    type: "upstream-links",
    description: upstream.join(" "),
  });
  expect(upstream).toEqual([]);
});

test("S14-06 signed-in visitor at / goes to the app", async () => {
  test.skip(
    true,
    "BLOCKED: needs a signed-in test account (test accounts not created yet)",
  );
});
