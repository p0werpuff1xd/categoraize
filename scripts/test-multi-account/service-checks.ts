// T-SVC: direct checks against the stateless NLP service (no DB, no mailbox).
// Calendar boost and neutrality, Google- vs Microsoft-shaped busy periods,
// duplicate meetings, the Asia/Manila vs UTC deadline, credential rejection
// and statelessness. Uses only CATEGORAIZE_SERVICE_URL / _INTERNAL_KEY.
const URL_BASE = process.env.CATEGORAIZE_SERVICE_URL ?? "http://localhost:8000";
const KEY = process.env.CATEGORAIZE_INTERNAL_KEY ?? "";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -- ${detail}` : ""}`);
}

async function classify(body: Record<string, unknown>, key = KEY) {
  const res = await fetch(`${URL_BASE}/api/v1/classify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Key": key },
    body: JSON.stringify(body),
  });
  const json = res.ok ? await res.json() : await res.text();
  return { status: res.status, json: json as any };
}

// Monday 16 Nov 2026 10:00 Manila. "Friday 5pm" = Fri 20 Nov 17:00 Manila = 09:00Z.
const NOW = "2026-11-16T10:00:00+08:00";
const DEADLINE_EMAIL = {
  email_id: "catz-1",
  subject: "CATZ-TEST 1 deadline",
  body: "Hi, please send the signed budget report by Friday 5pm. Thanks!",
  received_at: NOW,
  now: NOW,
  timezone: "Asia/Manila",
  sender: { email: "catz-sender@example.com" },
  categories: [],
};
// Friday 16:00-18:00 Manila in each provider's wire format (as the fork emits them).
const GOOGLE_BUSY = { start: "2026-11-20T08:00:00Z", end: "2026-11-20T10:00:00Z" };
const MS_BUSY = {
  start: "2026-11-20T08:00:00.0000000Z",
  end: "2026-11-20T10:00:00.0000000Z",
};
const ELSEWHERE = { start: "2026-11-18T01:00:00Z", end: "2026-11-18T02:00:00Z" };

async function main() {
  const health = await fetch(`${URL_BASE}/healthz`).then((r) => r.status).catch(() => 0);
  check("service reachable /healthz", health === 200, `status ${health}`);
  if (health !== 200) return;

  console.log("\n-- calendar boost and neutrality (deadline Fri 17:00 Asia/Manila)");
  const variants: Record<string, unknown> = {
    "null (no calendar)": null,
    "[] (calendar empty/failed)": [],
    "Google busy Fri 16-18": [GOOGLE_BUSY],
    "Microsoft busy Fri 16-18": [MS_BUSY],
    "same meeting in both calendars": [GOOGLE_BUSY, MS_BUSY],
    "busy at another time": [ELSEWHERE],
  };
  const out: Record<string, any> = {};
  for (const [name, busy] of Object.entries(variants)) {
    const r = await classify({ ...DEADLINE_EMAIL, calendar_busy: busy });
    out[name] = r.json;
    console.log(
      `  ${name.padEnd(32)} status=${r.status} level=${r.json?.priority?.level} calendar=${r.json?.priority?.factors?.calendar} deadline=${r.json?.priority?.deadline}`,
    );
  }
  const base = out["null (no calendar)"]?.priority;
  check("deadline resolved to Fri 20 Nov 17:00 +08:00", new Date(base?.deadline).toISOString() === "2026-11-20T09:00:00.000Z", base?.deadline);
  check("no calendar -> calendar factor 0", base?.factors?.calendar === 0);
  check("empty/failed calendar -> factor 0, same level", out["[] (calendar empty/failed)"]?.priority?.factors?.calendar === 0 && out["[] (calendar empty/failed)"]?.priority?.level === base?.level);
  check("Google busy -> +1", out["Google busy Fri 16-18"]?.priority?.factors?.calendar === 1);
  check("Microsoft busy (7-digit fraction + Z) -> +1", out["Microsoft busy Fri 16-18"]?.priority?.factors?.calendar === 1);
  check("Google and Microsoft give the same level", out["Google busy Fri 16-18"]?.priority?.level === out["Microsoft busy Fri 16-18"]?.priority?.level);
  check("duplicate meeting counted once (+1, not +2)", out["same meeting in both calendars"]?.priority?.factors?.calendar === 1);
  check("busy elsewhere -> 0", out["busy at another time"]?.priority?.factors?.calendar === 0);
  check("no variant lowers priority below the no-calendar level", Object.values(out).every((r) => r?.priority?.level >= base?.level));

  console.log("\n-- time zone (C-3): same email, mailbox timezone missing -> UTC");
  const utc = await classify({ ...DEADLINE_EMAIL, timezone: "UTC", calendar_busy: [MS_BUSY] });
  console.log(`  UTC: deadline=${utc.json?.priority?.deadline} calendar=${utc.json?.priority?.factors?.calendar} level=${utc.json?.priority?.level}`);
  check("UTC mailbox resolves 'Friday 5pm' 8 h later than Asia/Manila (expected defect if timezone is NULL)", new Date(utc.json?.priority?.deadline).getTime() - new Date(base?.deadline).getTime() === 8 * 3_600_000);
  check("...and loses the calendar boost for the Manila meeting", utc.json?.priority?.factors?.calendar === 0);

  console.log("\n-- credentials and strict schema");
  const extraInBusy = await classify({ ...DEADLINE_EMAIL, calendar_busy: [{ ...GOOGLE_BUSY, access_token: "x" }] });
  check("busy period with an extra token field is rejected (422)", extraInBusy.status === 422, `status ${extraInBusy.status}`);
  const extraTop = await classify({ ...DEADLINE_EMAIL, refresh_token: "x" });
  check("top-level token field is rejected (422)", extraTop.status === 422, `status ${extraTop.status}`);
  const naive = await classify({ ...DEADLINE_EMAIL, calendar_busy: [{ start: "2026-11-20T08:00:00", end: "2026-11-20T10:00:00" }] });
  check("naive (no-offset) busy times are rejected (422) -- the fork must always send Z/offset", naive.status === 422, `status ${naive.status}`);
  const badKey = await classify(DEADLINE_EMAIL, "wrong-key");
  check("wrong X-Internal-Key is refused", badKey.status === 401 || badKey.status === 403, `status ${badKey.status}`);

  console.log("\n-- statelessness: account A, account B, account A again");
  const catA = [{ id: "acctA-cat", name: "Finance", description: "budget reports, invoices, payments", base_priority: 4 }];
  const catB = [{ id: "acctB-cat", name: "Finance", description: "newsletters and digests", base_priority: 2 }];
  const a1 = await classify({ ...DEADLINE_EMAIL, categories: catA });
  const b1 = await classify({ ...DEADLINE_EMAIL, categories: catB });
  const a2 = await classify({ ...DEADLINE_EMAIL, categories: catA });
  const strip = (j: any) => JSON.stringify({ ...j, timings_ms: undefined });
  check("A before and after B is identical (no state carried between accounts)", strip(a1.json) === strip(a2.json));
  check("same category name in two accounts does not collide (ids echoed per request)", a1.json?.ranked?.[0]?.id === "acctA-cat" && b1.json?.ranked?.[0]?.id === "acctB-cat");

  console.log(`\n${failures ? `${failures} FAIL` : "all PASS"}`);
}

main().then(() => process.exit(failures ? 1 : 0), (e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
