// A short, skippable first-run intro that explains the loop. Shown once (gated by
// profile.settings.onboarded); ?onboard=1 forces it back for testing.
interface Card { icon: string; title: string; body: string }

const CARDS: Card[] = [
  { icon: "🎧", title: "Welcome to Pixel DJ", body: "A tiny club on your desk that moves to whatever you play — internet radio or your own files. Tap the scene anytime to open the menu." },
  { icon: "👁", title: "It knows you're here", body: "Flip on the camera in Options and the DJ wakes when it sees you. You earn Cred just by being at your desk, working." },
  { icon: "🛒", title: "Unlock the world", body: "Spend Cred in the Store on 40 venues — café, warehouse, space station — plus cosmetic prizes for your DJ." },
  { icon: "🎯", title: "Play the right vibe", body: "Match the music's genre to the venue for bonus Cred. Today's hot pairing is shown right in the Music tab." },
  { icon: "🌿", title: "It's got your back", body: "This isn't a leash — after a good focus stretch it nudges you to take a break. Work, vibe, rest, repeat." },
];

export function showOnboarding(onDone: () => void): void {
  let i = 0;
  const root = document.createElement("div");
  root.id = "onboard";
  document.body.appendChild(root);
  const finish = (): void => { root.remove(); onDone(); };
  const render = (): void => {
    const c = CARDS[i], last = i === CARDS.length - 1;
    root.innerHTML = `
      <div class="ob-card">
        <button class="ob-skip" type="button">skip</button>
        <div class="ob-icon">${c.icon}</div>
        <h2>${c.title}</h2>
        <p>${c.body}</p>
        <div class="ob-dots">${CARDS.map((_, k) => `<span class="${k === i ? "on" : ""}"></span>`).join("")}</div>
        <div class="ob-nav">
          ${i > 0 ? `<button class="ob-back" type="button">Back</button>` : `<span></span>`}
          <button class="ob-next" type="button">${last ? "Let's go! 🎉" : "Next →"}</button>
        </div>
      </div>`;
    (root.querySelector(".ob-skip") as HTMLElement).onclick = finish;
    (root.querySelector(".ob-next") as HTMLElement).onclick = () => { if (last) finish(); else { i++; render(); } };
    const back = root.querySelector(".ob-back") as HTMLElement | null;
    if (back) back.onclick = () => { i--; render(); };
  };
  render();
}
