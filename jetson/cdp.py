# Reload/navigate the RUNNING kiosk chromium via CDP (never restart chromium —
# SSH-launched chromium fails hardware EGL init on this box).
#   python3 cdp.py                      -> Page.reload (ignoreCache)
#   python3 cdp.py "http://.../?x=1"    -> Page.navigate
# Raw-socket websocket handshake: the box has no python websocket lib.
import socket, base64, os, json, sys, time

try:
    import urllib.request as u
    data = json.load(u.urlopen("http://localhost:9222/json"))
    ws = [t for t in data if t.get("type") == "page"][0]["webSocketDebuggerUrl"]
    path = ws.split("9222", 1)[1]
    key = base64.b64encode(os.urandom(16)).decode()
    req = ("GET %s HTTP/1.1\r\nHost: localhost:9222\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
           "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n") % (path, key)
    s = socket.create_connection(("localhost", 9222)); s.sendall(req.encode()); s.recv(4096)
    if len(sys.argv) > 1:
        msg = {"id": 1, "method": "Page.navigate", "params": {"url": sys.argv[1]}}
    else:
        msg = {"id": 1, "method": "Page.reload", "params": {"ignoreCache": True}}
    payload = json.dumps(msg).encode(); mask = os.urandom(4)
    masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    s.sendall(bytes([0x81, 0x80 | len(payload)]) + mask + masked); time.sleep(0.4); s.close()
    print("ok")
except Exception as e:
    print("ERR", e)
    sys.exit(1)
