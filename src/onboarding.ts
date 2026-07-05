// A short, skippable first-run intro that ends with a tiny setup step (pick a
// presence source, then Start — so the music begins on the user's click, never a
// surprise on launch). Shown once (gated by profile.settings.onboarded);
// ?onboard=1 forces it back for testing.
import { DESKTOP } from "./config";

type PresenceMode = "off" | "activity" | "mic" | "camera";
interface Card { icon: string; title: string; body: string }

const CARDS: Card[] = [
  { icon: "🎧", title: "Welcome to Desk Rave", body: "A tiny club on your desk that moves to whatever you play — a built-in Creative-Commons soundtrack, your own files, or more music you find in Discover. Tap the scene anytime to open the menu." },
  { icon: "🛒", title: "Unlock the world", body: "You earn Cred just by being present and working. Spend it in the Store on 40 venues — a morning café, a neon club, a rooftop at golden hour, a forest rave — plus cosmetic prizes for your DJ." },
  { icon: "🎯", title: "Play the right vibe", body: "Match the music's genre to the venue for bonus Cred. Today's hot pairing is shown in the Bonuses, top-left." },
  { icon: "🌿", title: "It's got your back", body: "This isn't a leash — after a good focus stretch it nudges you to take a break. Work, vibe, rest, repeat." },
];

const PRESENCE_OPTS: { id: PresenceMode; label: string; note: string }[] = [
  { id: "activity", label: "⌨️ Keyboard & mouse", note: "Wakes when you type or move the mouse. Private, no permissions — the easy default." },
  { id: "mic", label: "🎙️ Microphone", note: "Wakes to room sound (a loudness reading only — no recording). Best with headphones." },
  { id: "camera", label: "📷 Camera", note: "Wakes when a webcam sees a face. 100% on-device — no frames ever leave your machine." },
  { id: "off", label: "🚫 Off — just music", note: "No sensing. The music plays until you stop it." },
];

export function showOnboarding(onDone: (setup: { presenceMode: PresenceMode; start: boolean; startFullscreen: boolean; autostart: boolean }) => void): void {
  let i = 0;
  let chosen: PresenceMode = "activity";
  let fs = false, boot = false; // desktop appliance prefs (only shown on the desktop app)
  const total = CARDS.length + 1; // info cards + the setup step
  const root = document.createElement("div");
  root.id = "onboard";
  document.body.appendChild(root);
  const finish = (start: boolean): void => { root.remove(); onDone({ presenceMode: chosen, start, startFullscreen: fs, autostart: boot }); };
  const dots = (): string => `<div class="ob-dots">${Array.from({ length: total }, (_, k) => `<span class="${k === i ? "on" : ""}"></span>`).join("")}</div>`;

  const render = (): void => {
    if (i === CARDS.length) {
      // ── setup step ──
      root.innerHTML = `
        <div class="ob-card">
          <button class="ob-skip" type="button">skip</button>
          <div class="ob-icon">🙌</div>
          <h2>Set it up</h2>
          <p>Desk Rave wakes when you're at your desk. Pick how it senses you — change it anytime in Options.</p>
          <div class="ob-opts">
            ${PRESENCE_OPTS.map((o) => `<button class="ob-opt ${o.id === chosen ? "on" : ""}" data-p="${o.id}" type="button"><b>${o.label}</b><small>${o.note}</small></button>`).join("")}
          </div>
          ${DESKTOP ? `<div class="ob-appliance">
            <label class="ob-check"><input type="checkbox" class="ob-fs" ${fs ? "checked" : ""}/><span>⛶ Start in fullscreen</span></label>
            <label class="ob-check"><input type="checkbox" class="ob-boot" ${boot ? "checked" : ""}/><span>🚀 Launch when my computer starts</span></label>
          </div>` : ""}
          ${dots()}
          <div class="ob-nav">
            <button class="ob-back" type="button">Back</button>
            <button class="ob-start" type="button">Start ▶</button>
          </div>
        </div>`;
      root.querySelectorAll<HTMLButtonElement>(".ob-opt").forEach((b) => (b.onclick = () => { chosen = b.dataset.p as PresenceMode; render(); }));
      const fsEl = root.querySelector(".ob-fs") as HTMLInputElement | null;
      if (fsEl) fsEl.onchange = () => { fs = fsEl.checked; };
      const bootEl = root.querySelector(".ob-boot") as HTMLInputElement | null;
      if (bootEl) bootEl.onchange = () => { boot = bootEl.checked; };
      (root.querySelector(".ob-start") as HTMLElement).onclick = () => finish(true);
      (root.querySelector(".ob-skip") as HTMLElement).onclick = () => finish(false);
      (root.querySelector(".ob-back") as HTMLElement).onclick = () => { i--; render(); };
      return;
    }
    const c = CARDS[i];
    root.innerHTML = `
      <div class="ob-card">
        <button class="ob-skip" type="button">skip</button>
        <div class="ob-icon">${c.icon}</div>
        <h2>${c.title}</h2>
        <p>${c.body}</p>
        ${dots()}
        <div class="ob-nav">
          ${i > 0 ? `<button class="ob-back" type="button">Back</button>` : `<span></span>`}
          <button class="ob-next" type="button">Next →</button>
        </div>
      </div>`;
    (root.querySelector(".ob-skip") as HTMLElement).onclick = () => finish(false);
    (root.querySelector(".ob-next") as HTMLElement).onclick = () => { i++; render(); };
    const back = root.querySelector(".ob-back") as HTMLElement | null;
    if (back) back.onclick = () => { i--; render(); };
  };
  render();
}
