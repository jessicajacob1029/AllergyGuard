# AllergyGuard style v2 (from Figma Make)

Source: Figma Make file `phxBYfmCTg7ukfQ8ktS7HM` (named "Flashcard-Study-App"), `src/App.tsx` and `src/index.css`,
read 2026-10-29. It is a one-file React prototype with placeholder content. Screenshots in `screens/` were rendered
from that code at 390px (home also at 320px). `inspo/` holds the four mood images that came with the file.

**Use it for look and feel only.** Our features, data, rules and copy stay. Everything below lists what the
prototype does, then what we change to meet our rules (WCAG AA, body ≥ 14px, labels ≥ 11px, taps ≥ 44px).

## Type

| Role | Prototype | Notes |
|---|---|---|
| Body, buttons, headings | DM Sans 400/500/600/700 | Base 14px. Self-host with `next/font` (replaces Nunito). |
| Eyebrows, labels, pills, nav, numbers | Space Mono 700, 11px, letter-spacing 0.1em, UPPERCASE | Self-host with `next/font`. |
| h1 | 38–42px, weight 500, line-height 0.98, letter-spacing −0.055em | 36px under 360px wide. |
| h2 | 34px (hero 46px), weight 500, −0.05em | Hero 42px under 360px. |
| h3 | 20px, weight 600, −0.035em | |

Change: the prototype uses 13px in the severity segment, history filters and the reaction severity line. We use 14px.

## Colour

| Token | Value | Use |
|---|---|---|
| ink | `#201d24` | Text, dark primary buttons |
| muted | `#68636d` | Secondary text (5.6:1 on glass) |
| eyebrow | `#5d5862` | Space Mono labels (6.3:1) |
| line | `rgba(45,37,49,.12)` | Dividers |
| glass | `rgba(255,255,255,.58)` + 1px `rgba(255,255,255,.82)` border, blur 22px, soft shadow | Cards |
| violet | `#6d5bce` (accent text, large only), `#604ec5` (active nav), `#5948ad` (date pill) | |
| lilac | `#ddd7ff` | Icon tiles, selected chips, date pill |
| peach | `#ffcdb6` | Allergy chips, symptom pills, gradients |
| yellow | `#ffe7a8` | Gradients, notices |
| mint | `#c3ead8` | Allergy chips, success states |
| red | `#c62828` | Emergency (white on it: 5.6:1) |
| Page background | `#e9e5e7` with radial yellow (top-left) and lilac (right) glows, plus two blurred ambient blobs (lilac, peach) | |

Verdict pills (Space Mono 11px, icon + word): Safe `#115e3b` on `#d7f1e4` (6.5:1), Caution `#704600` on `#ffe7b5`
(6.8:1), Unsafe `#8f1d1d` on `#f8d4d1` (6.5:1). Verdict circle: gradient tint with a 42px icon, then the pill and a
big heading.

Contrast fixes we need: placeholder `#817b85` is 4.0:1 on fields, so we use `#6e6890` or darker. Inactive nav
`#77717c` is 4.7:1 on the nav glass (tight over gradients), so we darken it to about `#666070`.

## Shapes and spacing

- Radii: cards 25px, hero 28px, buttons 16px, fields 14px, chips 12px, pills full.
- Screen padding 20px 16px (13px under 360px); 14px between cards; card padding 22px.
- Buttons: 50px tall, 16px radius, DM Sans 700 14px. Dark (`ink` fill, white text), light (white 72% + thin
  border), danger (`#c62828`). Pressed: scale 0.98.

Tap-target fixes: chips (39px), history filters (38px), severity segment (40px), the header icon buttons (42px) and
the prototype's Emergency button (42px) are all under 44px. We make them at least 44px.

## Components

- **Header:** brand tile (42px violet gradient, shield), optional centred title, red Emergency button.
  **We keep our own Emergency button** (solid red, plain `<a href="/emergency">`, top right) and only match its font,
  radius and spacing.
- **Bottom nav:** floating glass bar, 72px tall, 23px radius, 12px from the bottom, 4 items (Home, Scan, Diary,
  Profile), Space Mono 11px labels, violet when active.
- **Glass card** with eyebrow + h3 title and a Space Mono "Manage ›" / "View all ›" link.
- **Home:** greeting (date eyebrow, h1 with the name in violet), summary card (allergen count, contacts), scan hero
  (gradient glass, kicker, big h2, dark button with icon tile, decorative orb bottom-right), allergies card
  (peach/lilac/mint chips), latest scans list (barcode icon tile, name, brand, verdict pill).
  **Known issue:** the hero paragraph runs under the orb at 390px and 320px; we must lay it out so it never does.
- **Scan:** dark viewfinder with corner frame, dark primary button, light secondary, "OR" divider, photo option row.
- **Result:** verdict circle, pill, h1, product card (gradient glass, Space Mono barcode), "Why" card with the
  ingredient text and `<mark>` highlights, actions.
- **Scan history:** filter row (All / Safe / Caution / Unsafe; active = dark fill), glass list of rows with
  time and verdict pill.
- **Diary:** intro with a square dark "+" button, reaction cards (lilac date pill with day and month in Space Mono,
  food, 3 severity dots + word, symptom pills), form card (date + time, food, symptom chips, severity segment,
  treatment, notes), detail hero (big date pill, eyebrow time, h1 food, severity), delete confirm.
- **Profile:** sections with an icon tile, rows with severity tags, PRIMARY badge, expired medication in red.
- **Emergency card:** warm white page, red shield tile, big h1, full-width red call button (70px), allergy rows with
  a red (severe) or amber (moderate) 2px border, medication and contact rows, Space Mono offline note.
- **Empty, offline, 404:** big gradient orb, Space Mono code, h1, one dark button.

## Motion

Button press scale 0.98; scanner line animation; `prefers-reduced-motion` turns animations off. No dark mode in the
prototype.
