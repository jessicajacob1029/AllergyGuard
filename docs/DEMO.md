# AllergyGuard demo (5 minutes)

Site: **https://allergy-guard-nine.vercel.app** (the fork's `main`). Phone in portrait; the app is built for it.

## Demo account

| | |
|---|---|
| Email | `<demo account email>` |
| Password | `<demo account password>` |
| Profile name | `<e.g. Priya>` |
| Allergies | Milk (severe), Peanut (severe) |
| Primary contact | `<name>`, `+91 …` |
| Medication | `<e.g. EpiPen 0.3 mg>` |

Keep the password off the slides. Use a **separate demo account** (e.g. `yourname+demo@gmail.com`), not your
personal one: the personal account currently has only "kiwi" and an EpiPen that shows **Expired 2026-10-10** on
the emergency card, which would distract. Set the demo account up the day before (see "Before the demo"); give
its medication a future expiry date.

## Barcodes (checked live on 2026-10-28 for a Milk + Peanut profile)

| Product | Barcode | Expected | What it shows |
|---|---|---|---|
| Amul Pasteurized Butter | `8901262010016` | **Unsafe** | Contains Milk ("Butter"), highlighted in the ingredients |
| Kissan Tomato Ketchup | `8901030865237` | **Safe** | Nothing matched; "Always read the label" |
| Parle-G | `8901719110016` | **Caution** | Not on Open Food Facts: missing data is never Safe |
| Spare: Maggi Masala noodles | `8901058851298` | **Unsafe** | Contains Peanut ("Hydrolyzed peanut protein") |

Open Food Facts can change a product's data. Re-check the four the evening before (type them on `/scan`).

## Script

**0:00 – The problem (30 s).** "People with food allergies read every label in the shop. AllergyGuard checks a
product against *your* allergies and keeps your emergency details on the phone, even with no signal."

**0:30 – Profile (45 s).** Logged in already. On **Home**: "This is my profile: Milk and Peanut, severe."
Tap **Profile**: show allergies with severity, the emergency contact marked **Primary**, the medication.
"Everything is saved to the cloud and to the phone at the same time."

**1:15 – Scan: Unsafe (60 s).** Tap **Scan**. Type `8901262010016` → **Check product** (or **Open camera** and
scan the real pack if you have one). The lookup takes **3–4 seconds** ("Looking up…"): keep talking through it. Result **Unsafe**: "It says *why*: Milk, from 'Butter', highlighted in the
ingredient list we got from Open Food Facts. Unsafe is never softened to Caution."

**2:15 – Safe and Caution (60 s).** **Scan another** → `8901030865237` → **Safe**: "Safe only when we actually
got the ingredients and nothing matched, and it still says to read the label." **Scan another** →
`8901719110016` → **Caution**: "This one isn't in the database. No data is never Safe."

**3:15 – Offline emergency card (75 s).** Turn on **Airplane mode**. Tap the red **Emergency** button (top
right, on every screen). "No network, and the card still opens: allergies, medications, and a big **Call**
button for my primary contact." Tap **Call** to show the dialer, then cancel. "It's stored on the phone, and
it's always one tap away." Turn Airplane mode off.

**4:30 – Close (30 s).** "Built with Next.js and Supabase, row-level security so only you see your data, and
an offline-first emergency card. Next: a reaction diary, and checking labels from a photo." Mention it's an aid,
not medical advice.

## Before the demo

0. **Supabase confirm-email link:** Authentication → Emails → Confirm signup must use
   `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email&next=/onboarding`. Otherwise a new account's link only
   works in the browser that signed up (opened elsewhere, the app now says "Your email is confirmed. Log in…").
1. **The day before:** open the Supabase dashboard and check the project is **Active** (free projects pause
   after about a week without use; **Restore** takes a few minutes). Log in to the site once.
2. **On the demo phone:** log in, open **Home** once (this saves the emergency card), open **Emergency** once,
   then **Add to Home Screen** from Safari's Share menu. Open it from the Home Screen icon for the demo.
3. Type the four barcodes once to check the verdicts still match the table.
4. Charge the phone; turn off notifications (Focus mode); set brightness high.

## Backup plan

| Problem | What to do |
|---|---|
| Venue Wi-Fi is down or slow | Use the phone's mobile data or a hotspot. The emergency card part works with no network at all. |
| Supabase is paused or down (login or scans fail) | The emergency card still opens from the phone (it doesn't need Supabase). Show the scan part from the backup screenshots/recording below. |
| Open Food Facts is slow or down | The app says "We couldn't reach the product database… Try again" and saves nothing. Show the saved results from the backup, or try the spare barcode once. |
| Camera doesn't focus on a barcode | Type the number under the barcode instead (same result). |
| Logged out by accident | Log in again; then open Home once so the emergency card is saved again. Logging out on the laptop no longer logs the phone out (fixed 2026-10-28). |
| A page shows "Page not found" | Tap **Go to home**. |

**Backup material to prepare the day before:** a 60-second screen recording of the full script on the phone
(Control Centre → Screen Recording), and screenshots of each result (Unsafe, Safe, Caution) and of the
emergency card. Keep them in Photos, ready to show.

## QA before the demo (2026-10-28, production, 390px)

Checked on `allergy-guard-nine.vercel.app` (WebKit and Chromium at 390px):
- **Signed out:** home, log in, sign up, emergency (empty), offline page, 404, and every signed-in page
  redirecting to Log in and back. Wrong password, empty fields, invalid email, short password, offline submit:
  all show plain messages. Signing up with an existing email shows the same "Check your email" screen (on purpose).
- **Signed in (the personal account, nothing changed):** home links, profile (forms open, validate and cancel),
  emergency card online and with the network fully cut (card loads; every other page shows "You're offline"),
  typed scans for the four barcodes (3–4 s each, saved, reload shows the same result, Scan another / Home work),
  bad barcode message, another user's scan id → "Page not found", Log out → card cleared on that device.
- **Fixed:** styled 404 page; confirm link opened in another browser now goes to Log in; Log out only ends this
  device's session (it used to end every session); "Milk-⏎free" split across lines is Caution again.
- **Not yet run on a fresh account** (needs a new confirmed account so nothing real changes): onboarding (Milk +
  Peanut with severity, +91 contact, medication), then profile saves (second contact, make primary, delete one,
  edit allergies). Do this while setting up the demo account and note anything odd.
- **Camera scan:** check once on the demo phone (the test browser has no camera).
