// Two-user Row Level Security test against the live Supabase project.
//
// Creates two temporary confirmed users (rls-test-<random>-a/b@example.com),
// signs in as each with the public anon key and uses the REST API exactly like
// the app, then checks that user B can't read, edit, delete or insert user A's
// rows in: reactions (Phase 6), reminder_settings, push_subscriptions and
// medication_reminders (Phase 7), and that nobody else can read A's
// unsubscribe token. Signed-out requests are checked too.
//
// The two test users are ALWAYS deleted at the end (also when a check fails
// or the script crashes); everything they created goes with them (on delete
// cascade). The script refuses to delete any user it didn't create.
//
// Run:  node scripts/rls-two-user.mjs
// Needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (from
// .env.local) and SUPABASE_SERVICE_ROLE_KEY (from .env.rls.local or the
// environment; git-ignored, never printed). The service role key is only used to
// create and delete the two test users and to write one medication_reminders
// row for A (users can't write that table; the daily job does).

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

function readEnv(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
      }),
  );
}
const env = { ...readEnv(".env.local"), ...readEnv(".env.rls.local"), ...process.env };
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are needed (.env.local)");
if (!SERVICE) throw new Error("SUPABASE_SERVICE_ROLE_KEY is needed (put it in .env.rls.local, which git ignores)");

const RUN = randomBytes(4).toString("hex");
const TEST_EMAIL = /^rls-test-[0-9a-f]{8}-[ab]@example\.com$/;
const password = `Rls-${randomBytes(12).toString("hex")}`;

// ---------------------------------------------------------------------------
// HTTP helpers

async function call(method, path, { token, key = ANON, body } = {}) {
  const res = await fetch(`${URL}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token ?? key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}
const rest = (token, method, path, body) => call(method, `/rest/v1/${path}`, { token, body });
const admin = (method, path, body) => call(method, path, { key: SERVICE, body });

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
const rows = (r) => (Array.isArray(r.data) ? r.data.length : -1);
const rejected = (r) => r.status >= 400 && r.status < 500;
const nothing = (r) => rows(r) === 0 || rejected(r);
const desc = (r) => `${r.status} ${Array.isArray(r.data) ? `${r.data.length} rows` : (r.data?.code ?? (typeof r.data === "boolean" ? r.data : ""))}`;
const must = (r, what) => {
  const row = Array.isArray(r.data) ? r.data[0] : r.data;
  if (r.status >= 300 || !row) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
  return row;
};

// ---------------------------------------------------------------------------
// Test users

const created = [];

async function createUser(letter) {
  const email = `rls-test-${RUN}-${letter}@example.com`;
  const user = must(await admin("POST", "/auth/v1/admin/users", { email, password, email_confirm: true }), `create ${email}`);
  created.push({ id: user.id, email });
  const session = await call("POST", "/auth/v1/token?grant_type=password", { body: { email, password } });
  if (session.status !== 200) throw new Error(`sign in ${email}: ${session.status}`);
  return { id: user.id, email, token: session.data.access_token };
}

async function deleteTestUsers() {
  for (const { id, email } of created) {
    if (!TEST_EMAIL.test(email)) {
      console.log(`SKIP  not deleting ${email}: not a test user`);
      continue;
    }
    const del = await admin("DELETE", `/auth/v1/admin/users/${id}`);
    const gone = await admin("GET", `/auth/v1/admin/users/${id}`);
    console.log(`cleanup: deleted ${email} → ${del.status}; lookup afterwards → ${gone.status}`);
    if (gone.status !== 404) failed += 1;
  }
}

// ---------------------------------------------------------------------------

async function main() {
  const A = await createUser("a");
  const B = await createUser("b");
  console.log(`setup: test users ${A.email} and ${B.email}`);

  // A's data, created through the API as A (B's as B), like the app.
  const profileA = must(await rest(A.token, "POST", "profiles", { name: "RLS test A" }), "profile A");
  const profileB = must(await rest(B.token, "POST", "profiles", { name: "RLS test B" }), "profile B");
  const scan = (profileId) => ({ profile_id: profileId, barcode: "3017620422003", input: "manual", product_found: false, verdict: "caution", result: { verdict: "caution" } });
  const scanA = must(await rest(A.token, "POST", "scans", scan(profileA.id)), "scan A");
  const scanB = must(await rest(B.token, "POST", "scans", scan(profileB.id)), "scan B");
  const reaction = (profileId, extra = {}) => ({ profile_id: profileId, occurred_at: new Date().toISOString(), food: "RLS probe", symptoms: ["itching"], severity: "mild", ...extra });
  const reactionA = must(await rest(A.token, "POST", "reactions", reaction(profileA.id, { food: "A's reaction", scan_id: scanA.id, notes: "private" })), "reaction A");
  const reactionB = must(await rest(B.token, "POST", "reactions", reaction(profileB.id, { food: "B's reaction" })), "reaction B");

  const medA = must(await rest(A.token, "POST", "medications", { profile_id: profileA.id, name: "RLS EpiPen A", expiry_date: "2026-11-20" }), "medication A");
  const medB = must(await rest(B.token, "POST", "medications", { profile_id: profileB.id, name: "RLS EpiPen B", expiry_date: "2026-11-20" }), "medication B");
  const settingsA = must(await rest(A.token, "POST", "reminder_settings", { owner_id: A.id, push_enabled: true, email_enabled: true }), "settings A");
  must(await rest(B.token, "POST", "reminder_settings", { owner_id: B.id, push_enabled: false, email_enabled: true }), "settings B");
  const endpointA = `https://push.example.invalid/rls-${RUN}-a`;
  const deviceA = must(await rest(A.token, "POST", "rpc/save_push_subscription", { p_endpoint: endpointA, p_p256dh: "keyA", p_auth_key: "authA", p_user_agent: "rls-test" }), "device A");
  must(await rest(B.token, "POST", "rpc/save_push_subscription", { p_endpoint: `https://push.example.invalid/rls-${RUN}-b`, p_p256dh: "keyB", p_auth_key: "authB", p_user_agent: "rls-test" }), "device B");
  // Only the daily job writes sent reminders: one for A, written with the service role.
  const sentA = must(await call("POST", "/rest/v1/medication_reminders", { key: SERVICE, body: { medication_id: medA.id, profile_id: profileA.id, expiry_date: "2026-11-20", stage: "30d", status: "delivered", email_result: "sent" } }), "reminder A");
  console.log("setup: each user has a profile, scan, reaction, medication, reminder settings and a device; A has a sent reminder\n");

  let r;

  console.log("— controls: each user can use their own rows");
  r = await rest(A.token, "GET", `reactions?id=eq.${reactionA.id}&select=id`);
  check("A reads own reaction", rows(r) === 1, desc(r));
  r = await rest(A.token, "GET", "reminder_settings?select=owner_id,unsubscribe_token");
  check("A reads own reminder settings, with its 64-character token", rows(r) === 1 && /^[0-9a-f]{64}$/.test(r.data[0].unsubscribe_token), desc(r));
  const tokenA = r.data?.[0]?.unsubscribe_token;
  r = await rest(A.token, "GET", "push_subscriptions?select=id");
  check("A reads own device", rows(r) === 1, desc(r));
  r = await rest(A.token, "GET", "medication_reminders?select=id");
  check("A reads own sent reminder", rows(r) === 1, desc(r));
  r = await rest(B.token, "PATCH", `reminder_settings?owner_id=eq.${B.id}`, { email_enabled: false });
  check("B turns own email reminders off", rows(r) === 1, desc(r));

  console.log("\n— reactions (Phase 6)");
  r = await rest(B.token, "GET", "reactions?select=id");
  check("B lists reactions: sees only own", rows(r) === 1 && r.data[0].id === reactionB.id, desc(r));
  r = await rest(B.token, "GET", `reactions?id=eq.${reactionA.id}&select=*`);
  check("B reads A's reaction by id: 0 rows", rows(r) === 0, desc(r));
  r = await rest(B.token, "PATCH", `reactions?id=eq.${reactionA.id}`, { food: "edited by B" });
  check("B edits A's reaction: 0 rows changed", rows(r) === 0, desc(r));
  r = await rest(B.token, "DELETE", `reactions?id=eq.${reactionA.id}`);
  check("B deletes A's reaction: 0 rows deleted", rows(r) === 0, desc(r));
  r = await rest(B.token, "POST", "reactions", reaction(profileA.id));
  check("B adds a reaction to A's profile: rejected", rejected(r), desc(r));
  r = await rest(B.token, "PATCH", `reactions?id=eq.${reactionB.id}`, { scan_id: scanA.id });
  check("B links own reaction to A's scan: rejected", rejected(r), desc(r));

  console.log("\n— reminder_settings");
  r = await rest(B.token, "GET", "reminder_settings?select=owner_id,unsubscribe_token");
  check("B lists settings: sees only own", rows(r) === 1 && r.data[0].owner_id === B.id, desc(r));
  r = await rest(B.token, "GET", `reminder_settings?owner_id=eq.${A.id}&select=*`);
  check("B reads A's settings: 0 rows", rows(r) === 0, desc(r));
  r = await rest(B.token, "GET", `reminder_settings?unsubscribe_token=eq.${tokenA}&select=owner_id`);
  check("B looks up A's settings by A's token: 0 rows", rows(r) === 0, desc(r));
  r = await rest(B.token, "PATCH", `reminder_settings?owner_id=eq.${A.id}`, { email_enabled: false, push_enabled: false });
  check("B turns A's reminders off: 0 rows changed", nothing(r), desc(r));
  r = await rest(B.token, "PATCH", `reminder_settings?owner_id=eq.${B.id}`, { owner_id: A.id });
  check("B moves own settings to A: rejected", rejected(r), desc(r));
  r = await rest(B.token, "PATCH", `reminder_settings?owner_id=eq.${B.id}`, { unsubscribe_token: "0".repeat(64) });
  check("B sets own unsubscribe token: rejected (only generated by the database)", rejected(r), desc(r));
  r = await rest(B.token, "DELETE", `reminder_settings?owner_id=eq.${A.id}`);
  check("B deletes A's settings: nothing deleted", nothing(r), desc(r));
  r = await rest(B.token, "POST", "reminder_settings", { owner_id: A.id, push_enabled: false, email_enabled: false });
  check("B inserts settings for A: rejected", rejected(r), desc(r));

  console.log("\n— unsubscribe tokens");
  r = await rest(null, "GET", "reminder_settings?select=owner_id,unsubscribe_token");
  check("signed out reads settings/tokens: nothing", nothing(r), desc(r));
  r = await rest(B.token, "POST", "rpc/due_medication_reminders", { p_today: "2026-11-01" });
  check("B calls the job's due_medication_reminders (returns tokens): rejected", rejected(r), desc(r));
  r = await rest(null, "POST", "rpc/due_medication_reminders", { p_today: "2026-11-01" });
  check("signed out calls due_medication_reminders: rejected", rejected(r), desc(r));
  r = await rest(B.token, "POST", "rpc/unsubscribe_email", { p_token: randomBytes(32).toString("hex") });
  check("B unsubscribes with a guessed token: nothing changed (false)", r.status === 200 && r.data === false, desc(r));
  r = await rest(null, "POST", "rpc/unsubscribe_email", { p_token: "' or 1=1 --" });
  check("signed out unsubscribes with a malformed token: nothing changed (false)", r.status === 200 && r.data === false, desc(r));
  r = await rest(A.token, "GET", "reminder_settings?select=email_enabled,push_enabled");
  check("A's settings unchanged so far (email on, push on)", rows(r) === 1 && r.data[0].email_enabled === true && r.data[0].push_enabled === true, JSON.stringify(r.data));

  console.log("\n— push_subscriptions");
  r = await rest(B.token, "GET", "push_subscriptions?select=id,endpoint");
  check("B lists devices: sees only own", rows(r) === 1 && r.data[0].endpoint !== endpointA, desc(r));
  r = await rest(B.token, "GET", `push_subscriptions?id=eq.${deviceA}&select=*`);
  check("B reads A's device by id: 0 rows", rows(r) === 0, desc(r));
  r = await rest(B.token, "GET", `push_subscriptions?owner_id=eq.${A.id}&select=*`);
  check("B reads A's devices by owner: 0 rows", rows(r) === 0, desc(r));
  r = await rest(B.token, "PATCH", `push_subscriptions?id=eq.${deviceA}`, { owner_id: B.id });
  check("B edits A's device: rejected", nothing(r), desc(r));
  r = await rest(B.token, "DELETE", `push_subscriptions?id=eq.${deviceA}`);
  check("B deletes A's device: 0 rows deleted", rows(r) === 0, desc(r));
  r = await rest(B.token, "POST", "push_subscriptions", { owner_id: A.id, endpoint: `https://push.example.invalid/rls-${RUN}-x`, p256dh: "k", auth_key: "a" });
  check("B inserts a device for A: rejected", rejected(r), desc(r));
  r = await rest(B.token, "POST", "rpc/save_push_subscription", { p_endpoint: endpointA, p_p256dh: "keyB", p_auth_key: "authB", p_user_agent: "rls-test" });
  check("B takes over A's device with A's address but other keys: rejected", rejected(r), desc(r));
  r = await rest(null, "POST", "rpc/save_push_subscription", { p_endpoint: endpointA, p_p256dh: "k", p_auth_key: "a" });
  check("signed out saves a device: rejected", rejected(r), desc(r));
  r = await rest(A.token, "GET", "push_subscriptions?select=id,endpoint,p256dh");
  check("A's device unchanged (still A's, same keys)", rows(r) === 1 && r.data[0].id === deviceA && r.data[0].p256dh === "keyA", JSON.stringify(r.data));

  console.log("\n— medication_reminders");
  r = await rest(B.token, "GET", "medication_reminders?select=id");
  check("B lists sent reminders: none (B has none)", rows(r) === 0, desc(r));
  r = await rest(B.token, "GET", `medication_reminders?id=eq.${sentA.id}&select=*`);
  check("B reads A's sent reminder: 0 rows", rows(r) === 0, desc(r));
  r = await rest(B.token, "PATCH", `medication_reminders?id=eq.${sentA.id}`, { status: "failed" });
  check("B edits A's sent reminder: rejected", nothing(r), desc(r));
  r = await rest(B.token, "DELETE", `medication_reminders?id=eq.${sentA.id}`);
  check("B deletes A's sent reminder: rejected", nothing(r), desc(r));
  r = await rest(B.token, "POST", "medication_reminders", { medication_id: medA.id, profile_id: profileA.id, expiry_date: "2026-11-20", stage: "7d" });
  check("B inserts a reminder record for A: rejected", rejected(r), desc(r));
  r = await rest(B.token, "POST", "medication_reminders", { medication_id: medB.id, profile_id: profileB.id, expiry_date: "2026-11-20", stage: "7d" });
  check("B inserts a reminder record for own medication: rejected (only the job writes)", rejected(r), desc(r));
  r = await rest(B.token, "POST", "rpc/claim_medication_reminder", { p_medication_id: medA.id, p_profile_id: profileA.id, p_expiry_date: "2026-11-20", p_stage: "7d" });
  check("B calls the job's claim_medication_reminder: rejected", rejected(r), desc(r));
  r = await rest(A.token, "POST", "medication_reminders", { medication_id: medA.id, profile_id: profileA.id, expiry_date: "2026-11-20", stage: "7d" });
  check("A inserts a reminder record for own medication: rejected (only the job writes)", rejected(r), desc(r));

  console.log("\n— signed out");
  for (const table of ["reactions", "reminder_settings", "push_subscriptions", "medication_reminders"]) {
    r = await rest(null, "GET", `${table}?select=*`);
    check(`signed out reads ${table}: nothing`, nothing(r), desc(r));
  }
  r = await rest(null, "DELETE", `push_subscriptions?id=eq.${deviceA}`);
  check("signed out deletes A's device: nothing deleted", nothing(r), desc(r));
  r = await rest(null, "PATCH", `reminder_settings?owner_id=eq.${A.id}`, { email_enabled: false });
  check("signed out edits A's settings: nothing changed", nothing(r), desc(r));

  console.log("\n— the unsubscribe link itself");
  r = await rest(null, "POST", "rpc/unsubscribe_email", { p_token: tokenA });
  check("signed out with A's real token: turns A's email off (true)", r.status === 200 && r.data === true, desc(r));
  r = await rest(A.token, "GET", "reminder_settings?select=email_enabled,push_enabled");
  check("…only A's email switch changed (push still on)", rows(r) === 1 && r.data[0].email_enabled === false && r.data[0].push_enabled === true, JSON.stringify(r.data));
  r = await rest(B.token, "GET", "reminder_settings?select=email_enabled");
  check("…B's settings untouched", rows(r) === 1 && r.data[0].email_enabled === false, JSON.stringify(r.data));

  console.log("\n— A's data afterwards");
  r = await rest(A.token, "GET", `reactions?select=id,food,notes,scan_id`);
  check("A's reaction unchanged", rows(r) === 1 && r.data[0].food === "A's reaction" && r.data[0].notes === "private" && r.data[0].scan_id === scanA.id, JSON.stringify(r.data));
  r = await rest(A.token, "GET", `medication_reminders?select=id,status,stage`);
  check("A's sent reminder unchanged", rows(r) === 1 && r.data[0].status === "delivered" && r.data[0].stage === "30d", JSON.stringify(r.data));
  void settingsA;
  void scanB;
}

try {
  await main();
} catch (error) {
  failed += 1;
  console.log(`ERROR ${error.message}`);
} finally {
  console.log("");
  await deleteTestUsers();
}
console.log(`\n${passed} of ${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
