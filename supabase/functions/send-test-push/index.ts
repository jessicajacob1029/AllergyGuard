// "Send a test notification" from Profile → Reminders. Needs a signed-in
// user's token, and only reaches that user's own devices (the query runs with
// their token, so RLS applies). Devices the push service reports as gone
// (404/410) are deleted.
//
// Body (JSON): { "endpoint": "https://…" } to test one device (this browser);
// leave it out to test all of the user's devices.

import { createClient } from "npm:@supabase/supabase-js@2.117.1";
import webpush from "npm:web-push@3.6.7";
import { pushToDevices } from "../_shared/run-reminders.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Not signed in" }, 401);

  const vapid = ["VAPID_SUBJECT", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"].map((k) => Deno.env.get(k));
  if (vapid.some((v) => !v)) return json({ error: "Notifications aren't set up on the server yet." }, 500);
  webpush.setVapidDetails(vapid[0]!, vapid[1]!, vapid[2]!);

  // The user's own token: RLS limits every query below to their rows.
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: user, error: userError } = await db.auth.getUser(token);
  if (userError || !user.user) return json({ error: "Not signed in" }, 401);

  let endpoint: string | undefined;
  try {
    const body = await req.json();
    if (typeof body?.endpoint === "string") endpoint = body.endpoint;
  } catch {
    // No body: test every device.
  }

  let query = db.from("push_subscriptions").select("id, endpoint, p256dh, auth:auth_key").eq("owner_id", user.user.id);
  if (endpoint) query = query.eq("endpoint", endpoint);
  const { data: devices, error } = await query;
  if (error) return json({ error: "Couldn't load your devices." }, 500);
  if (!devices?.length) return json({ delivered: 0, removed: 0, failed: 0, devices: 0 });

  const result = await pushToDevices(
    devices,
    {
      title: "Notifications are on",
      body: "This is a test from AllergyGuard. Medication expiry reminders will look like this.",
      tag: "test",
      url: "/profile#reminders",
    },
    {
      async sendPush(device, payload) {
        try {
          await webpush.sendNotification(
            { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
            JSON.stringify(payload),
            { TTL: 60 * 60 },
          );
          return { ok: true };
        } catch (err) {
          const e = err as { statusCode?: number; message?: string };
          return { ok: false, status: e.statusCode ?? null, message: String(e.message ?? err) };
        }
      },
      async deleteDevice(id) {
        await db.from("push_subscriptions").delete().eq("id", id);
      },
    },
  );
  return json({ ...result, devices: devices.length });
});
