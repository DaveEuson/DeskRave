import { LEVEL_CAP, LEVEL_MINUTES, LEVEL_UNLOCKS, NOVELTY_BONUS_MIN, AVATARS, VENUES } from "./config";
import type { Profile } from "./profile";

// Total "XP minutes" needed to advance FROM a given level.
export function minutesForLevel(level: number): number {
  return LEVEL_MINUTES[level] ?? LEVEL_MINUTES[LEVEL_MINUTES.length - 1];
}

// Effective XP minutes = real minutes listened + novelty bonus per unique track.
export function xpMinutes(p: Profile): number {
  return p.listenedMinutes + p.uniqueTracks.length * NOVELTY_BONUS_MIN;
}

export interface LevelUpResult {
  leveledUp: boolean;
  newLevels: number[]; // levels crossed this update
  unlocked: string[]; // venue/avatar ids newly granted
}

// Recompute level + xp-fraction from lifetime minutes, applying any unlocks.
// Mutates the profile's level/xp/unlocks and returns what changed (for toasts).
export function recomputeProgress(p: Profile): LevelUpResult {
  const startLevel = p.level;
  const unlocked: string[] = [];

  // walk up the cumulative curve from the current level
  let level = p.level;
  let remaining = xpMinutes(p);
  for (let l = 1; l < level; l++) remaining -= minutesForLevel(l); // spend already-earned levels

  while (level < LEVEL_CAP) {
    const need = minutesForLevel(level);
    if (remaining >= need) {
      remaining -= need;
      level++;
      for (const id of LEVEL_UNLOCKS[level]?.avatars ?? []) if (!p.unlocks.includes(id)) (p.unlocks.push(id), unlocked.push(id));
    } else break;
  }

  p.level = level;
  const need = minutesForLevel(level);
  p.xp = level >= LEVEL_CAP ? 1 : Math.max(0, Math.min(1, remaining / need));

  const newLevels: number[] = [];
  for (let l = startLevel + 1; l <= level; l++) newLevels.push(l);
  return { leveledUp: level > startLevel, newLevels, unlocked };
}

// Add listening time (and optionally a freshly-played track) then recompute.
export function accrue(p: Profile, minutes: number, trackId?: string): LevelUpResult {
  p.listenedMinutes += minutes;
  if (trackId && !p.uniqueTracks.includes(trackId)) {
    p.uniqueTracks.push(trackId);
    if (p.history[0] !== trackId) p.history.unshift(trackId);
    p.history = p.history.slice(0, 6);
  }
  return recomputeProgress(p);
}

export function isUnlocked(p: Profile, id: string): boolean {
  return p.unlocks.includes(id);
}

// Human label for an unlocked id (venue or avatar), for toasts/lists.
export function unlockLabel(id: string): string {
  if (id in VENUES) return VENUES[id as keyof typeof VENUES].name;
  if (id in AVATARS) return AVATARS[id as keyof typeof AVATARS].name;
  return id;
}
