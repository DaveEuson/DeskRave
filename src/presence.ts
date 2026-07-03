import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";

// "Is someone at the desk?" via in-browser face detection — face-based (not motion)
// so it stays true while you sit still working. All on-device; no frames leave.
export interface PresenceState {
  present: boolean;
  count: number;
}

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

export class Presence {
  private state: PresenceState = { present: false, count: 0 };
  private video: HTMLVideoElement | null = null;
  private detector: FaceDetector | null = null;
  private running = false;
  private lastSeen = 0;
  private lastBoxes: { x: number; y: number; w: number; h: number }[] = [];
  private nativeFaces: { x: number; y: number; s: number }[] = [];
  private native = false;
  // ── "at desk" score: hysteresis + interaction fusion over the raw detector ──
  // The kiosk camera sits off-axis (you work at your main monitor), so raw face
  // detection flickers. Both detector paths feed observe(); state only flips when
  // the evidence is solid in BOTH directions:
  //  · absent→present needs CONFIRM consecutive sightings (~0.6s) — a shadow or a
  //    single misfired frame doesn't wake the DJ…
  //  · …but touching the screen does, instantly (you can't tap it from another room)
  //  · present→absent needs absentGraceMs with no face AND no touch — leaning to
  //    your other monitor for 20s is not leaving
  private rawStreak = 0; // consecutive positive raw observations
  private lastInteraction = 0; // last pointer/key on the kiosk
  private heldCount = 1; // last confirmed face count (held through grace gaps)
  private readonly CONFIRM = 2;
  private graceMs = 30000; // how long presence holds after the last signal (per mode)
  // ── mode: how "are you here?" is sensed ──────────────────────────────────────
  //  camera   → on-device face detection (a party trick; needs a webcam + permission)
  //  activity → keyboard/mouse (private, zero permission — the desktop default)
  //  mic      → room sound level (private-ish; best with headphones so it doesn't
  //             just hear the app's own music)
  private mode: "" | "native" | "camera" | "activity" | "mic" = "";
  private heartbeat = 0; // interval id for the activity/mic tick
  private micCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micBuf: Float32Array<ArrayBuffer> | null = null;
  private micLevelRaw = 0; // 0..1 smoothed room-sound level (for the UI meter)
  private readonly MIC_THRESHOLD = 0.02; // RMS above this = "someone's in the room"
  // signal-quality telemetry: raw detector flips in the last few minutes (high =
  // bad camera angle). Read by the cam preview; costs nothing to keep.
  private rawWas = false;
  private flipLog: number[] = [];
  lastError = "";
  onChange?: (s: PresenceState) => void;

  get isNative(): boolean {
    return this.native;
  }
  // detected face centers (normalized, mirrored) from the native service — used to
  // draw the abstract stick-figure preview
  get faces(): { x: number; y: number; s: number }[] {
    return this.nativeFaces;
  }

  get current(): PresenceState {
    return this.state;
  }
  get active(): boolean {
    return this.running;
  }
  // for the on-screen "what the camera sees" preview
  get stream(): MediaStream | null {
    return (this.video?.srcObject as MediaStream) ?? null;
  }
  get boxes(): { x: number; y: number; w: number; h: number }[] {
    return this.lastBoxes;
  }

  private set(present: boolean, count: number): void {
    if (present !== this.state.present || count !== this.state.count) {
      this.state = { present, count };
      this.onChange?.(this.state);
    }
  }

  // one raw detector reading (from either path) → smoothed presence state
  private observe(rawCount: number): void {
    const now = performance.now();
    const raw = rawCount > 0;
    if (raw !== this.rawWas) { this.rawWas = raw; this.flipLog.push(now); }
    if (this.flipLog.length && now - this.flipLog[0] > 300000) this.flipLog = this.flipLog.filter((t) => now - t <= 300000);
    if (raw) {
      this.rawStreak++;
      // from cold, wait for CONFIRM consecutive sightings; once present, any
      // single sighting keeps the clock fresh
      if (this.state.present || this.rawStreak >= this.CONFIRM) {
        this.lastSeen = now;
        this.heldCount = rawCount;
      }
    } else {
      this.rawStreak = 0;
    }
    const seen = Math.max(this.lastSeen, this.lastInteraction);
    const present = seen > 0 && now - seen < this.graceMs;
    this.set(present, present ? Math.max(1, this.heldCount) : 0);
  }

  // a pointer/key on the kiosk is the strongest presence signal there is —
  // counts as a confirmed sighting and wakes the state immediately
  noteInteraction(): void {
    if (!this.running) return; // camera off → callers use the audio fallback
    this.lastInteraction = performance.now();
    this.set(true, Math.max(1, this.heldCount));
  }

  // raw-signal flips over the last 5 min (≳12 means the camera view is choppy)
  get flipsPer5Min(): number {
    return this.flipLog.length;
  }

  // mock for testing the behaviour without a camera — bypasses the hysteresis
  // on purpose so tests stay deterministic
  setMock(present: boolean, count = present ? 1 : 0): void {
    if (!present) { this.lastSeen = 0; this.lastInteraction = 0; this.rawStreak = 0; }
    this.set(present, count);
  }

  // Prefer the native on-device detector (jetson/presence_service.py) if it's
  // running; otherwise fall back to in-browser detection on the given <video>.
  // Retries the service check briefly to dodge a startup race.
  async start(video: HTMLVideoElement, skipNative = false): Promise<"native" | "browser" | "none"> {
    if (skipNative) return (await this.startCamera(video)) ? "browser" : "none"; // static build has no native service
    for (let i = 0; i < 4; i++) {
      try {
        const d = await fetch("/api/presence", { cache: "no-store" }).then((r) => r.json());
        if (d && typeof d.ts === "number" && Date.now() / 1000 - d.ts < 6) {
          this.startNative();
          return "native";
        }
      } catch {
        break; // endpoint not there at all → no service
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    return (await this.startCamera(video)) ? "browser" : "none";
  }

  startNative(): void {
    if (this.running) return;
    this.running = true;
    this.native = true;
    this.mode = "native";
    this.graceMs = 30000;
    const poll = async (): Promise<void> => {
      if (!this.running || !this.native) return;
      try {
        const d = await fetch("/api/presence", { cache: "no-store" }).then((r) => r.json());
        const fresh = Date.now() / 1000 - (d.ts ?? 0) < 5;
        this.nativeFaces = fresh && Array.isArray(d.faces) ? d.faces : [];
        // raw reading → hysteresis; a stale service reads as "no face", which the
        // absence grace absorbs unless it stays stale for a real stretch
        this.observe(fresh && d.present ? Math.max(1, d.count ?? 1) : 0);
      } catch {
        // one failed fetch (dev-server restart, wifi blip) is not "everyone left"
        this.nativeFaces = [];
        this.observe(0);
      }
      setTimeout(poll, 300);
    };
    void poll();
  }

  // Start the webcam + detector on a VISIBLE <video> element (must be on-screen so
  // the browser actually decodes frames — hidden/offscreen video often won't, which
  // starves the detector). Needs a user gesture + secure context (localhost/https).
  async startCamera(video: HTMLVideoElement): Promise<boolean> {
    if (this.running) return true;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.lastError = "needs localhost or https (open it on the device itself)";
      return false;
    }
    this.releaseStream(); // drop any lingering stream from a prior attempt/reload
    let stream: MediaStream | null = null;
    try {
      // let Chromium negotiate the camera's native format (this webcam is MJPG-only;
      // pinning a raw resolution can make it fail to open on some drivers)
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      this.video = video;

      const vision = await FilesetResolver.forVisionTasks(WASM);
      this.detector = await FaceDetector.createFromOptions(vision, {
        // CPU delegate: avoids WebGL inference, which is unreliable on this Jetson's
        // Chromium. Cheap at our ~4 Hz detection rate.
        baseOptions: { modelAssetPath: MODEL, delegate: "CPU" },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.4,
      });
      this.running = true;
      this.mode = "camera";
      this.graceMs = 30000; // a face is continuous — short grace
      this.loop();
      return true;
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop()); // release the camera so a retry isn't "busy"
      this.video = null;
      this.detector = null;
      const err = e as Error;
      this.lastError =
        err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError" ? "no camera found — check it's plugged in"
        : err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError" ? "camera permission was blocked"
        : err?.name === "NotReadableError" ? "camera is busy — close other Chromium windows / re-toggle"
        : err?.message || "camera unavailable";
      console.warn("presence: camera failed —", err?.name, err?.message);
      return false;
    }
  }

  // ── Activity mode: presence from keyboard/mouse only (no sensor, no permission).
  // Interactions arrive via noteInteraction(); a heartbeat re-evaluates so presence
  // lapses after the (generous) grace when you stop touching things. Best default
  // for a desktop focus toy — you ARE typing when you're working. ──────────────
  startActivity(): void {
    if (this.running) return;
    this.running = true;
    this.mode = "activity";
    this.graceMs = 150000; // 2.5 min — typing is intermittent during focus work
    this.lastInteraction = performance.now(); // enabling it counts as "you're here"
    this.set(true, 1);
    clearInterval(this.heartbeat);
    this.heartbeat = window.setInterval(() => this.observe(0), 700); // just ages the state
  }

  // ── Microphone mode: presence from room sound level (RMS over the mic). Private
  // — no recording, no speech, just a loudness number. Note: on speakers it hears
  // the app's own music, so it's best with headphones (surfaced in the UI). ────
  async startMic(): Promise<boolean> {
    if (this.running) return true;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.lastError = "needs localhost or https"; return false;
    }
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      this.micCtx = new AudioContext();
      const src = this.micCtx.createMediaStreamSource(this.micStream);
      this.micAnalyser = this.micCtx.createAnalyser();
      this.micAnalyser.fftSize = 1024;
      src.connect(this.micAnalyser); // NOT connected to destination — no feedback loop
      this.micBuf = new Float32Array(new ArrayBuffer(this.micAnalyser.fftSize * 4));
      this.running = true;
      this.mode = "mic";
      this.graceMs = 60000; // a minute of silence before it counts as "gone"
      clearInterval(this.heartbeat);
      this.heartbeat = window.setInterval(() => {
        if (!this.micAnalyser || !this.micBuf) return;
        this.micAnalyser.getFloatTimeDomainData(this.micBuf);
        let sum = 0; for (let i = 0; i < this.micBuf.length; i++) sum += this.micBuf[i] * this.micBuf[i];
        const rms = Math.sqrt(sum / this.micBuf.length);
        this.micLevelRaw = this.micLevelRaw * 0.6 + rms * 0.4; // smooth
        this.observe(this.micLevelRaw > this.MIC_THRESHOLD ? 1 : 0);
      }, 300);
      return true;
    } catch (e) {
      this.stopMic();
      const err = e as Error;
      this.lastError = err?.name === "NotAllowedError" ? "microphone permission was blocked"
        : err?.name === "NotFoundError" ? "no microphone found" : err?.message || "microphone unavailable";
      return false;
    }
  }

  private stopMic(): void {
    this.micStream?.getTracks().forEach((t) => t.stop());
    void this.micCtx?.close().catch(() => {});
    this.micStream = null; this.micCtx = null; this.micAnalyser = null; this.micBuf = null; this.micLevelRaw = 0;
  }

  get sensingMode(): string { return this.mode; }
  get micLevel(): number { return Math.min(1, this.micLevelRaw / (this.MIC_THRESHOLD * 3)); } // 0..1 for a meter

  // release the camera before a fresh acquire (defensive; tabs/HMR can leave one open)
  private releaseStream(): void {
    (this.video?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
  }

  private loop(): void {
    if (!this.running || !this.video || !this.detector) return;
    let count = 0;
    if (this.video.readyState >= 2) {
      try {
        const dets = this.detector.detectForVideo(this.video, performance.now()).detections;
        count = dets.length;
        const vw = this.video.videoWidth || 320, vh = this.video.videoHeight || 240;
        this.lastBoxes = dets.map((d) => {
          const b = d.boundingBox!;
          return { x: 1 - (b.originX + b.width) / vw, y: b.originY / vh, w: b.width / vw, h: b.height / vh }; // mirrored x for the mirrored preview
        });
      } catch {
        /* frame not ready */
      }
    }
    this.observe(count);
    setTimeout(() => this.loop(), 250); // ~4 Hz — cheap, plenty for presence
  }

  stop(): void {
    this.running = false;
    this.native = false;
    this.mode = "";
    clearInterval(this.heartbeat); this.heartbeat = 0;
    this.stopMic();
    (this.video?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
    this.video = null;
    this.detector = null;
    this.lastSeen = 0; this.lastInteraction = 0; this.rawStreak = 0; this.flipLog = []; this.rawWas = false;
    this.set(false, 0);
  }
}
