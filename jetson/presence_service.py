#!/usr/bin/env python3
"""Native presence detector for the Jetson kiosk.

Reads the USB camera and runs OpenCV Haar face detection on the device (the
in-browser MediaPipe path doesn't work on this Jetson's Chromium). Writes:
  ~/pixel-rave/.data/presence.json  -> {present, count, ts}
  ~/pixel-rave/.data/presence.jpg   -> 160x120 annotated snapshot (for the UI)
The Vite middleware serves both at /api/presence and /api/presence-frame; the
web app polls them. All on-device — no frames leave the box.
"""
import cv2, time, json, os
import numpy as np

DATA = os.path.expanduser("~/pixel-rave/.data")
os.makedirs(DATA, exist_ok=True)
PRESENCE = os.path.join(DATA, "presence.json")
FRAME = os.path.join(DATA, "presence.jpg")
CASCADE = "/usr/share/opencv4/haarcascades/haarcascade_frontalface_default.xml"

GRACE = 2.5  # stay "present" this long after the last sighting (anti-flicker)


def open_cam():
    """This webcam is MJPG-only; the default raw pipeline fails. Use explicit MJPG."""
    pipe = ("v4l2src device=/dev/video0 ! image/jpeg,width=640,height=480,framerate=15/1 "
            "! jpegdec ! videoconvert ! video/x-raw,format=BGR ! appsink drop=1 max-buffers=1 sync=false")
    cap = cv2.VideoCapture(pipe, cv2.CAP_GSTREAMER)
    if cap.isOpened():
        ok, _ = cap.read()
        if ok:
            return cap
        cap.release()
    cap = cv2.VideoCapture(0, cv2.CAP_V4L2)
    cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*"MJPG"))
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    return cap


def write_presence(present, count):
    tmp = PRESENCE + ".tmp"
    with open(tmp, "w") as f:
        json.dump({"present": bool(present), "count": int(count), "ts": time.time()}, f)
    os.replace(tmp, PRESENCE)


def main():
    cascade = cv2.CascadeClassifier(CASCADE)
    cap = None
    last_seen = 0.0
    while True:
        if cap is None or not cap.isOpened():
            if cap:
                cap.release()
            cap = open_cam()
            if not cap or not cap.isOpened():
                write_presence(False, 0)  # camera unavailable (e.g. the browser has it)
                time.sleep(2)
                continue
        ok, frame = cap.read()
        if not ok or frame is None:
            cap.release(); cap = None
            time.sleep(0.5)
            continue

        small = cv2.resize(frame, (320, 240))
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        faces = cascade.detectMultiScale(gray, 1.2, 5, minSize=(40, 40))
        count = len(faces)
        now = time.time()
        if count > 0:
            last_seen = now
        present = (now - last_seen) < GRACE
        write_presence(present, count if present else 0)

        # stylized "what it sees" preview: pixelate + neon duotone (not a plain selfie)
        tiny = cv2.resize(frame, (80, 60), interpolation=cv2.INTER_AREA)
        g = cv2.cvtColor(tiny, cv2.COLOR_BGR2GRAY).astype("float32") / 255.0
        lo = np.array([70, 20, 50], dtype="float32")    # BGR dark violet
        hi = np.array([255, 180, 90], dtype="float32")  # BGR bright teal
        duo = (lo + (hi - lo) * g[..., None]).astype("uint8")
        prev = cv2.resize(duo, (160, 120), interpolation=cv2.INTER_NEAREST)  # chunky pixels
        sx, sy = 160 / 320.0, 120 / 240.0
        for (x, y, w, h) in faces:
            cv2.rectangle(prev, (int(x * sx), int(y * sy)), (int((x + w) * sx), int((y + h) * sy)), (120, 240, 80), 2)
        cv2.imwrite(FRAME, prev, [cv2.IMWRITE_JPEG_QUALITY, 75])
        time.sleep(0.18)  # ~5 Hz


if __name__ == "__main__":
    main()
