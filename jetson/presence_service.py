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


def write_presence(present, count, faces):
    tmp = PRESENCE + ".tmp"
    with open(tmp, "w") as f:
        json.dump({"present": bool(present), "count": int(count), "ts": time.time(), "faces": faces}, f)
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
                write_presence(False, 0, [])  # camera unavailable (e.g. the browser has it)
                time.sleep(2)
                continue
        ok, frame = cap.read()
        if not ok or frame is None:
            cap.release(); cap = None
            time.sleep(0.5)
            continue

        small = cv2.resize(frame, (320, 240))
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        # conservative: more neighbours + a larger min size kills background false
        # positives (you sit close at a desk, so your face is big in frame)
        faces = cascade.detectMultiScale(gray, 1.15, 8, minSize=(64, 64))
        count = len(faces)
        now = time.time()
        if count > 0:
            last_seen = now
        present = (now - last_seen) < GRACE
        # normalized, mirrored-x face centers (selfie view). The browser draws an
        # abstract stick figure from these — no image ever leaves the camera, and
        # it's far lighter than streaming a JPEG.
        norm = []
        if present:
            for (x, y, w, h) in faces:
                norm.append({"x": round(1.0 - (x + w / 2) / 320.0, 3),
                             "y": round((y + h / 2) / 240.0, 3),
                             "s": round(w / 320.0, 3)})
        write_presence(present, count if present else 0, norm)
        time.sleep(0.12)  # ~8 Hz (cheap now — no image encode)


if __name__ == "__main__":
    main()
