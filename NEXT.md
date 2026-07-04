# Desk Rave — direction & backlog

> **Product rule (tape this to the monitor):**
> **Desk Rave may reward healthy work rhythms. It must NOT reward compulsively engaging with Desk Rave.**

## The thesis (corrected, 2026-06-27)

An **ADHD focus companion that gamifies healthy desk habits** — focus music + light
progression + presence — where the **unlocks are the come-back hook** and **presence is the
clever hook**. Gamification is intentional scaffolding for a dopamine-seeking brain.

Two rounds of outside review (4 AIs each) sharpened it hard. The key correction:

- **"All carrot, no stick" was the wrong axis.** Removing penalties kills the *aversive*
  compulsion (shame/RSD — correct to remove) but leaves the *appetitive/seeking* compulsion
  (variable reward, "what'll I unlock") fully intact — and consequence-free, which is slot-machine
  architecture. ADHD is a dopamine-*seeking* profile, so that's the dangerous engine.
- **The real axes are: reward the GOAL not the PROXY, and BOUNDED not unbounded.**

## v1 design (built 2026-06-27 — dogfood THIS)

Implemented this session — the corrected reward model:

1. **Reward the cycle, not presence.** Cred is earned at the *boundaries* of a healthy rhythm —
   completing a focus block, and (worth more) taking the break — never per-minute-present.
   Presence/time was a bad proxy: you can doomscroll in the chair and still earn. You reinforce
   what you measure, so we measure the behavior we actually want.
2. **The break pays more than staying** — un-breaks the break. (Removing the overstay-decay had
   left the economy paying you, at full rate, forever, to ignore the break. Fixed.)
3. **Daily satiation cap** — the carrot ends ("you've banked today's max"). A built-in *enough* +
   a natural stop, which a seeking brain needs.
4. **No optimization surfaces** — removed genre/time/daily-bonus multipliers from earning, the
   Music bonus banner, the genre-match toasts, the per-station ×bonus badges, the ☀/🌙 pill marker.
   Rewards are flat and un-min-maxable. (`genreMult`/`timeMult`/`dailyBonus` left defined but unused
   in config.ts — delete in a cleanup pass.)
5. **Low salience** — Cred no longer ticks live; it changes only at block/break boundaries with a
   gentle behavior-affirming toast (not a number-chase). Cred is visible in the Store/DJ tab when
   you deliberately go look — not an always-on HUD hook.

Test affordance: `?fast=1` shrinks the Pomodoro timings ~60× so the full cycle can be exercised in
~a minute (verification only; harmless without the param).

## Dogfood protocol (do THIS, not building)

Run it on the kiosk during real work ~3 weeks. Keep one note:
- Did I do real work, or did I fiddle with Desk Rave? (the core failure mode)
- Did the break nudge land, and did I take it?
- Could I forget it existed for an hour and still benefit? (if no → too salient)
- Did the music ever cut out while I was right there? (presence-grace check; grace is 60s)

## Banked — AFTER dogfood only

### Hand-mirror (avatar mirrors your raised hands) — the clever headline
Reciprocal *expression*, deepens the presence hook. Reward must be FELT (crowd roars, lights spike),
**never a bonus**. **Do NOT ship in v1** — pose tracking is unambiguously biometric + camera-always-on;
BIPA/GDPR liability that shouldn't gate a launch. Ship presence first, earn trust, add it later as an
optional toy *outside* the reward loop. Needs a Jetson feasibility spike (pose fps/latency) first.

### Crowd reactions — maybe, ambient only
Emotes on peaks (🔥/🙌), never a chat feed. The resting view already has too many narrators.

### Quest log (goals to chase) — good FORM, content is everything
An MMO-style quest list (e.g. left side, lights up when completed). The form is a great ADHD
scaffold — visible goals. But it lives or dies on content:
- ✅ quests about your PRACTICE / discovery: "3 focus blocks today," "take all your breaks,"
  "5-day streak of healthy cycles," "explore a venue you haven't visited," "try a new station."
- ❌ quests about optimizing the app: "right song in the right venue ×3," "grow your crowd." These
  re-add the exact optimization/compulsion layer we removed — train you to min-max listening/presence
  instead of doing the work. Do NOT build these.
First confirm via the dogfood whether you want *goals* or just the *optimization hit* — the urge to
add this two days into the flat model was itself the seeking-loop the flat model is meant to starve.

### Design punch-list (Claude design)
1. **Tame the clock** — loudest object on a calm screen; ~40% smaller, desaturated, tucked.
2. **Pixel authenticity** — dither/reduce the bloom (~20%), band the smooth light-beam gradients
   (the main "vector pretending to be pixels" tell).
3. **Restructure Store rows** to the Music-tab model (bold name, small genre subtitle, single right `◆ price`).
- Camera card = privacy preview (shows what the on-device cam sees), NOT redundant status — shrink to a
  glyph by default, don't delete. • Whole venue pill tappable. • Press Start only for in-world text
  (marquee, on-scene DJ name), UI sans for menu chrome. • Lift crowd silhouettes out of the dead-contrast zone.

## Shipping gates (before ANY public release)
- **Camera off by default; works fully without it.** Make local-only architecturally enforced + visible in UX.
- **30 min with a real lawyer** on BIPA/GDPR (esp. before body-mirroring).
- **No ADHD-treatment claims.** "Designed by/for an ADHD brain" ok; "improves focus / treats ADHD" = FDA territory.
- **Decide age posture** (COPPA) — pixel art + unlocks may attract under-13s.
- **Don't optimize for DAU/session-length/unlock-velocity** — that optimizes toward compulsion.
  Track completed focus+break cycles and "did real work" instead.

## ❌ Rejected (logged so they don't get rebuilt)
- "Bonus for hyping the crowd" — the economy reflex; rewards should be the crowd *reacting*, not a number.
- Daily-rotating bonus pairing — a daily-*login* mechanic; pure retention, zero focus benefit.

Positioning line for when you share it: **"A living pixel-art space that reacts to your music and presence."**
