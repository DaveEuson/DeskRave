# Full-resolution PNG screenshot of the RUNNING kiosk page via CDP
# (Page.captureScreenshot — more reliable than gnome-screenshot on this box).
#   python3 cdpfull.py /tmp/shot.png
import socket, base64, os, json, sys, urllib.request

out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/shot.png"
data = json.load(urllib.request.urlopen("http://localhost:9222/json"))
ws = [t for t in data if t.get("type") == "page"][0]["webSocketDebuggerUrl"]
path = ws.split("9222", 1)[1]
key = base64.b64encode(os.urandom(16)).decode()
req = ("GET %s HTTP/1.1\r\nHost: localhost:9222\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
       "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n") % (path, key)
s = socket.create_connection(("localhost", 9222)); s.sendall(req.encode()); s.recv(4096)

def send(obj):
    p = json.dumps(obj).encode(); m = os.urandom(4)
    masked = bytes(b ^ m[i % 4] for i, b in enumerate(p))
    hdr = bytes([0x81]); n = len(p)
    if n < 126: hdr += bytes([0x80 | n])
    elif n < 65536: hdr += bytes([0x80 | 126]) + n.to_bytes(2, "big")
    else: hdr += bytes([0x80 | 127]) + n.to_bytes(8, "big")
    s.sendall(hdr + m + masked)

def recvn(n):
    buf = b""
    while len(buf) < n:
        d = s.recv(n - len(buf))
        if not d: raise RuntimeError("socket closed")
        buf += d
    return buf

def recv():
    h = recvn(2); ln = h[1] & 0x7f
    if ln == 126: ln = int.from_bytes(recvn(2), "big")
    elif ln == 127: ln = int.from_bytes(recvn(8), "big")
    return json.loads(recvn(ln).decode())

send({"id": 1, "method": "Page.captureScreenshot", "params": {"format": "png"}})
for _ in range(200):
    r = recv()
    if r.get("id") == 1:
        open(out, "wb").write(base64.b64decode(r["result"]["data"]))
        print("ok", out)
        break
s.close()
