import { CC_TRACKS, isAudioFile, trackFromFile, type Track } from "./tracks";

import { BANDS } from "./config";

export interface Levels {
  bass: number; // 0..1
  mid: number; // 0..1
  treble: number; // 0..1
  level: number; // overall 0..1
  centroid: number; // spectral centroid 0..1 (brightness)
  beat: boolean; // bass transient detected this frame
  spectrum: number[]; // coarse EQ bands 0..1 for the LED-wall visualizer
}

const EQ_BANDS = 24;

// Wraps a single <audio> element in a Web Audio graph:
//   MediaElementSource -> AnalyserNode -> master gain -> destination
// The analyser is what makes the visuals react to whatever is actually playing.
export class AudioStream {
  private ctx: AudioContext;
  private el: HTMLAudioElement;
  private analyser: AnalyserNode;
  private master: GainNode;
  private freq: Uint8Array<ArrayBuffer>;
  private bassAvg = 0;
  private lastBeat = 0;
  private volume = 0.8;
  private mutedState = false;
  index = 0;
  playlist: Track[] = [...CC_TRACKS];
  onTrackChange?: (t: Track) => void;
  onPlayState?: (playing: boolean) => void;
  onPlaylistChange?: () => void;
  onError?: (msg: string) => void;

  constructor() {
    this.ctx = new AudioContext();
    this.el = new Audio();
    this.el.crossOrigin = "anonymous"; // required for the analyser to read the data
    this.el.preload = "auto";

    const src = this.ctx.createMediaElementSource(this.el);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.8;
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;

    src.connect(this.analyser);
    this.analyser.connect(this.master);
    this.master.connect(this.ctx.destination);

    this.freq = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    this.el.addEventListener("ended", () => void this.next());
    this.el.addEventListener("play", () => this.onPlayState?.(true));
    this.el.addEventListener("pause", () => this.onPlayState?.(false));
    this.el.addEventListener("error", () => {
      if (!this.el.src) return; // ignore the empty-src reset
      this.onError?.(`Couldn't play "${this.current?.title ?? "track"}" — that format may be unsupported here`);
    });
  }

  load(i: number): void {
    if (this.playlist.length === 0) return;
    this.index = ((i % this.playlist.length) + this.playlist.length) % this.playlist.length;
    const t = this.playlist[this.index];
    this.el.src = t.src;
    this.onTrackChange?.(t);
  }

  // Add dropped/picked files to the playlist. Returns the index of the first new
  // track (so the caller can jump to it), or -1 if nothing was audio.
  addFiles(files: ArrayLike<File>): number {
    const incoming = Array.from(files).filter(isAudioFile).map(trackFromFile);
    if (incoming.length === 0) return -1;
    const firstNew = this.playlist.length;
    this.playlist.push(...incoming);
    this.onPlaylistChange?.();
    return firstNew;
  }

  // Add already-built tracks (e.g. the persisted server library loaded on boot),
  // skipping any whose src is already present so a reload doesn't duplicate them.
  addTracks(tracks: Track[]): void {
    const have = new Set(this.playlist.map((t) => t.src));
    const incoming = tracks.filter((t) => !have.has(t.src));
    if (incoming.length === 0) return;
    this.playlist.push(...incoming);
    this.onPlaylistChange?.();
  }

  async play(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (!this.el.src) this.load(this.index);
    await this.el.play();
  }

  pause(): void {
    this.el.pause();
  }

  async toggle(): Promise<void> {
    if (this.el.paused) await this.play();
    else this.pause();
  }

  async next(): Promise<void> {
    const wasPlaying = !this.el.paused;
    this.load(this.index + 1);
    if (wasPlaying) await this.play();
  }

  async prev(): Promise<void> {
    const wasPlaying = !this.el.paused;
    this.load(this.index - 1);
    if (wasPlaying) await this.play();
  }

  get tracks(): Track[] {
    return this.playlist;
  }

  // Remove a track from the playlist (server-file deletion is the caller's job).
  // Keeps playback sane: adjusts the index and reloads if the current track went.
  removeTrack(i: number): void {
    if (i < 0 || i >= this.playlist.length) return;
    const wasCurrent = i === this.index;
    const wasPlaying = this.playing;
    this.playlist.splice(i, 1);
    if (this.playlist.length === 0) {
      this.pause();
      this.el.removeAttribute("src");
      this.index = 0;
    } else {
      if (this.index > i) this.index--;
      this.index = Math.min(this.index, this.playlist.length - 1);
      if (wasCurrent) {
        this.load(this.index);
        if (wasPlaying) void this.play();
      }
    }
    this.onPlaylistChange?.();
  }

  async select(i: number): Promise<void> {
    this.load(i);
    await this.play();
  }

  get playing(): boolean {
    return !this.el.paused;
  }

  get current(): Track {
    return this.playlist[this.index];
  }

  setVolume(v: number): void {
    this.volume = v;
    if (!this.mutedState) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  get muted(): boolean {
    return this.mutedState;
  }

  toggleMute(): boolean {
    this.mutedState = !this.mutedState;
    this.master.gain.setTargetAtTime(this.mutedState ? 0 : this.volume, this.ctx.currentTime, 0.03);
    return this.mutedState;
  }

  // Read the analyser and reduce the spectrum to a few useful numbers + a beat flag.
  levels(): Levels {
    this.analyser.getByteFrequencyData(this.freq);
    const bins = this.freq.length;
    const band = (lo: number, hi: number): number => {
      let sum = 0;
      for (let i = lo; i < hi; i++) sum += this.freq[i];
      return sum / (hi - lo) / 255;
    };
    const bass = band(0, Math.max(1, Math.floor(bins * BANDS.bassEnd)));
    const mid = band(Math.floor(bins * BANDS.bassEnd), Math.floor(bins * BANDS.midEnd));
    const treble = band(Math.floor(bins * BANDS.midEnd), bins);
    const level = (bass + mid + treble) / 3;

    // coarse EQ spectrum for the LED wall — first ~60% of bins (musical range)
    const spectrum: number[] = [];
    const usable = Math.floor(bins * 0.6);
    const per = usable / EQ_BANDS;
    for (let i = 0; i < EQ_BANDS; i++) spectrum.push(band(Math.floor(i * per), Math.floor((i + 1) * per)));

    // Spectral centroid (brightness): the "center of mass" of the spectrum, 0..1.
    let weighted = 0;
    let total = 0;
    for (let i = 0; i < bins; i++) {
      weighted += i * this.freq[i];
      total += this.freq[i];
    }
    const centroid = total > 0 ? weighted / total / bins : 0;

    // Beat = bass spikes above its running average, with a refractory gap.
    this.bassAvg = this.bassAvg * 0.95 + bass * 0.05;
    const now = performance.now();
    let beat = false;
    if (bass > this.bassAvg * 1.3 && bass > 0.4 && now - this.lastBeat > 220) {
      beat = true;
      this.lastBeat = now;
    }
    return { bass, mid, treble, level, centroid, beat, spectrum };
  }
}
