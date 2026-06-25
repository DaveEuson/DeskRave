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
  private graceMs = 2500; // stay "present" briefly after the last sighting (anti-flicker)
  onChange?: (s: PresenceState) => void;

  get current(): PresenceState {
    return this.state;
  }
  get active(): boolean {
    return this.running;
  }

  private set(present: boolean, count: number): void {
    if (present !== this.state.present || count !== this.state.count) {
      this.state = { present, count };
      this.onChange?.(this.state);
    }
  }

  // mock for testing the behaviour without a camera
  setMock(present: boolean, count = present ? 1 : 0): void {
    this.set(present, count);
  }

  // Start the webcam + detector. Needs a user gesture + a secure context
  // (localhost or https). Returns false if unavailable/denied.
  async startCamera(): Promise<boolean> {
    if (this.running) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      this.video = video;

      const vision = await FilesetResolver.forVisionTasks(WASM);
      this.detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.5,
      });
      this.running = true;
      this.loop();
      return true;
    } catch (e) {
      console.warn("presence: camera unavailable —", (e as Error)?.message ?? e);
      return false;
    }
  }

  private loop(): void {
    if (!this.running || !this.video || !this.detector) return;
    let count = 0;
    if (this.video.readyState >= 2) {
      try {
        count = this.detector.detectForVideo(this.video, performance.now()).detections.length;
      } catch {
        /* frame not ready */
      }
    }
    const now = performance.now();
    if (count > 0) this.lastSeen = now;
    const present = now - this.lastSeen < this.graceMs;
    this.set(present, present ? Math.max(1, count) : 0);
    setTimeout(() => this.loop(), 250); // ~4 Hz — cheap, plenty for presence
  }

  stop(): void {
    this.running = false;
    (this.video?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
    this.video = null;
    this.detector = null;
    this.set(false, 0);
  }
}
