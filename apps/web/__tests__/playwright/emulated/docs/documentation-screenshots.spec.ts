import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { getEmailAccountId } from "../account-test-helpers";
import {
  PLAYWRIGHT_TEST_EMAIL,
  setupCalendarTestState,
} from "../calendars/calendar-test-helpers";

// Documentation screenshots (Figures 13-15, 17, 18) from the emulated stack:
// emulated Google mailbox, synthetic seeded emails only. Not part of CI; run
// only when DOCS_SHOT_DIR is set.
const OUT = process.env.DOCS_SHOT_DIR;
test.skip(!OUT, "set DOCS_SHOT_DIR to capture documentation screenshots");
test.describe.configure({ mode: "serial" });
test.setTimeout(15 * 60_000);

// Same values playwright.config.mjs gives the Next server, so the seed process
// passes env validation and decrypts the emulated calendar tokens the same way.
const tsxEnv = {
  ...process.env,
  NODE_ENV: "development",
  TSX_TSCONFIG_PATH: "scripts/categoraize-seed.tsconfig.json",
  AUTH_SECRET: process.env.AUTH_SECRET ?? "secret",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "client_id",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "client_secret",
  GOOGLE_PUBSUB_TOPIC_NAME: process.env.GOOGLE_PUBSUB_TOPIC_NAME ?? "topic",
  GOOGLE_PUBSUB_VERIFICATION_TOKEN: process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN ?? "playwright-token",
  EMAIL_ENCRYPT_SECRET: process.env.EMAIL_ENCRYPT_SECRET ?? "secret",
  EMAIL_ENCRYPT_SALT: process.env.EMAIL_ENCRYPT_SALT ?? "salt",
  API_KEY_SALT: process.env.API_KEY_SALT ?? "playwright-api-key-salt",
  DEFAULT_LLMS: "openai-compatible:emulated",
};

function runScript(script: string, args: string[]) {
  const output = execFileSync(process.execPath, ["--import", "tsx", script, ...args], {
    cwd: process.cwd(),
    env: tsxEnv,
    encoding: "utf8",
    timeout: 10 * 60_000,
  });
  test.info().annotations.push({ type: script, description: output.trim().split("\n").slice(-3).join(" / ") });
  return output;
}

function meetingStartFromSeed() {
  const runId = process.env.PLAYWRIGHT_RUN_ID;
  const seed = readFileSync(
    path.join(process.cwd(), ".tmp", "playwright", `${runId}`, "emulate.playwright.generated.yaml"),
    "utf8",
  );
  const block = seed.slice(seed.indexOf("evt_playwright_meeting_bot"));
  const match = block.match(/start_date_time: "([^"]+)"/);
  if (!match) throw new Error("meeting start not found in the emulator seed");
  return new Date(match[1]);
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(1200); // let lists and reveal animations settle
  await page.screenshot({ path: path.join(OUT!, name) });
}

test("capture CategorAIze screens with synthetic data", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const emailAccountId = await getEmailAccountId(page, { timeout: 120_000 });

  // Consent gate (FR-1.8): accept the Terms, leave external AI off.
  await page.goto(`/${emailAccountId}/categoraize/triage`, { waitUntil: "domcontentloaded" });
  if (page.url().includes("/consent")) {
    const box = page.getByRole("checkbox", { name: /accept the Terms and the Privacy Notice/i });
    await expect(box).toBeVisible({ timeout: 60_000 });
    await page.waitForLoadState("networkidle");
    await box.click();
    await expect(box).toHaveAttribute("aria-checked", "true");
    await page.screenshot({ path: path.join(OUT!, "fig12f-consent.png") });
    await page.getByRole("button", { name: "Accept and continue" }).click();
    await expect(page).not.toHaveURL(/\/consent/, { timeout: 60_000 });
  }

  // Calendar connection, 45 synthetic emails, one deadline inside the seeded event.
  if (!process.env.DOCS_SKIP_SEED) {
    await setupCalendarTestState();
    runScript("scripts/categoraize-seed.ts", ["--email", PLAYWRIGHT_TEST_EMAIL]);
    const deadline = new Date(meetingStartFromSeed().getTime() + 10 * 60_000);
    runScript("scripts/docs-conflict-email.ts", ["--email", PLAYWRIGHT_TEST_EMAIL, "--at", deadline.toISOString()]);
  }

  // Figure 13: Priority Inbox.
  await page.goto(`/${emailAccountId}/categoraize/triage`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Priority Inbox" })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText("Quick fix").first()).toBeVisible({ timeout: 60_000 });
  await shot(page, "fig13-priority-inbox.png");

  // Figure 14: category and priority labels (P4+ filter).
  await page.getByRole("button", { name: /^P4\+/ }).first().click();
  await shot(page, "fig14-category-priority-labels.png");
  await page.getByRole("button", { name: /^All/ }).first().click();

  // Figure 15: detail view with TASK/DATE spans (a Taglish seeded email).
  await page.getByText("Quick fix").first().click();
  await shot(page, "fig15-email-detail-spans.png");
  await page.getByText("Paalala sa enrollment").first().click();
  await shot(page, "fig15c-email-detail-filipino.png");

  // Task Sheet (supporting screenshot).
  const taskSheet = page.getByRole("button", { name: /Task Sheet/i });
  if (await taskSheet.isVisible().catch(() => false)) {
    await taskSheet.click();
    await shot(page, "fig15b-task-sheet.png");
    await page.keyboard.press("Escape");
  }

  // Figure 18: Label Studio (category management).
  await page.goto(`/${emailAccountId}/categoraize/rules`, { waitUntil: "networkidle" });
  await page.waitForTimeout(8000); // suggested labels and the label list load after the page
  await shot(page, "fig18-label-studio.png");
  await page.screenshot({ path: path.join(OUT!, "fig18c-label-studio-full.png"), fullPage: true });

  // Contacts with roles and VIP (supporting screenshot).
  await page.goto(`/${emailAccountId}/categoraize/contacts`, { waitUntil: "networkidle" });
  await shot(page, "fig18b-contacts-vip.png");
});
