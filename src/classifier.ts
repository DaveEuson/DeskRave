import type { Levels } from "./AudioStream";
import type { VibeName } from "./config";

export interface Classification {
  vibe: VibeName;
  bpm: number;
  energy: number;
}

// Reads energy + tempo + spectral brightness over the first few seconds of a
// track and maps to a vibe (chill/groove/rave). Dependency-free DSP — reliable on
// the energy axis. Swap `decide()` for Essentia.js later behind this interface.
export class Classifier {
  private frames = 0;
  private sumEnergy = 0;
  private sumCentroid = 0;
  private beats = 0;
  private startMs = 0;
  private done = false;

  private static readonly MIN_FRAMES = 150;
  private static readonly MIN_MS = 3500;

  onResult?: (c: Classification) => void;

  reset(nowMs: number): void {
    this.frames = 0;
    this.sumEnergy = 0;
    this.sumCentroid = 0;
    this.beats = 0;
    this.startMs = nowMs;
    this.done = false;
  }

  observe(lv: Levels, nowMs: number): void {
    if (this.done) return;
    this.frames++;
    this.sumEnergy += lv.level;
    this.sumCentroid += lv.centroid;
    if (lv.beat) this.beats++;
    const elapsed = nowMs - this.startMs;
    if (this.frames >= Classifier.MIN_FRAMES && elapsed >= Classifier.MIN_MS) {
      this.done = true;
      this.onResult?.(this.decide(elapsed / 1000));
    }
  }

  private decide(seconds: number): Classification {
    const energy = this.sumEnergy / this.frames;
    const bright = this.sumCentroid / this.frames;
    const bpm = Math.round((this.beats / seconds) * 60);
    let vibe: VibeName;
    if (energy < 0.26) vibe = "chill";
    else if (energy < 0.5) vibe = bright > 0.45 ? "rave" : "groove";
    else vibe = "rave";
    return { vibe, bpm, energy };
  }
}
