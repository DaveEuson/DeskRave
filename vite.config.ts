import { defineConfig, type Plugin, type Connect } from "vite";
import { createWriteStream, promises as fs } from "node:fs";
import { networkInterfaces } from "node:os";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MEDIA_DIR = path.join(ROOT, "public", "media");
const DATA_DIR = path.join(ROOT, ".data");
const PROFILES_FILE = path.join(DATA_DIR, "profiles.json");
const AUDIO_RE = /\.(mp3|wav|wave|aif|aiff|aifc|flac|m4a|mp4|aac|ogg|oga|opus)$/i;

// server-authoritative profile store (localStorage on the client is just a mirror)
async function loadProfiles(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(PROFILES_FILE, "utf8"));
  } catch {
    return {};
  }
}
async function saveProfiles(all: Record<string, unknown>): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(PROFILES_FILE, JSON.stringify(all, null, 2));
}
function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => resolve(d));
    req.on("error", reject);
  });
}

function lanUrl(port: number): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === "IPv4" && !ni.internal) return `http://${ni.address}:${port}`;
    }
  }
  return `http://localhost:${port}`;
}

// Tiny kiosk file subsystem: upload audio to disk, list it, report the LAN URL.
// Files land in public/media so Vite serves them same-origin at /media/<name>
// (which the AnalyserNode can read without any CORS dance).
const mediaApi = (port: number): Connect.NextHandleFunction => {
  return async (req, res, next) => {
    const url = req.url ?? "";

    if (req.method === "POST" && url.startsWith("/api/upload")) {
      const raw = decodeURIComponent((req.headers["x-filename"] as string) || "upload.bin");
      const safe = raw.replace(/[^\w.\- ]/g, "_").replace(/^\.+/, "").slice(0, 200) || "upload.bin";
      if (!AUDIO_RE.test(safe)) {
        res.statusCode = 415;
        return res.end('{"ok":false,"error":"not audio"}');
      }
      await fs.mkdir(MEDIA_DIR, { recursive: true });
      const out = createWriteStream(path.join(MEDIA_DIR, safe));
      req.pipe(out);
      out.on("finish", () => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, file: safe }));
      });
      out.on("error", () => {
        res.statusCode = 500;
        res.end('{"ok":false}');
      });
      return;
    }

    if (req.method === "DELETE" && url.startsWith("/api/file")) {
      const raw = decodeURIComponent((req.headers["x-filename"] as string) || "");
      const safe = raw.replace(/[^\w.\- ]/g, "_").replace(/^\.+/, "");
      if (safe) {
        try {
          await fs.unlink(path.join(MEDIA_DIR, safe));
        } catch {
          /* already gone */
        }
      }
      res.setHeader("content-type", "application/json");
      return res.end('{"ok":true}');
    }

    if (req.method === "GET" && url.startsWith("/api/library")) {
      let files: string[] = [];
      try {
        files = (await fs.readdir(MEDIA_DIR)).filter((f) => AUDIO_RE.test(f));
      } catch {
        /* no media dir yet */
      }
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify(files));
    }

    if (req.method === "GET" && url.startsWith("/api/info")) {
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify({ host: lanUrl(port) }));
    }

    // ── native presence (written by jetson/presence_service.py) ─────────────
    if (req.method === "GET" && url.startsWith("/api/presence-frame")) {
      try {
        const buf = await fs.readFile(path.join(DATA_DIR, "presence.jpg"));
        res.setHeader("content-type", "image/jpeg");
        res.setHeader("cache-control", "no-store");
        return res.end(buf);
      } catch {
        res.statusCode = 404;
        return res.end();
      }
    }
    if (req.method === "GET" && url.startsWith("/api/presence")) {
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "no-store");
      try {
        return res.end(await fs.readFile(path.join(DATA_DIR, "presence.json"), "utf8"));
      } catch {
        return res.end('{"present":false,"count":0,"ts":0}'); // service not running
      }
    }

    // ── internet-radio proxy (re-serves a stream same-origin so the FFT works) ──
    if (req.method === "GET" && url.startsWith("/api/radio")) {
      const target = new URL(url, "http://x").searchParams.get("url") || "";
      let host = "";
      try { host = new URL(target).hostname; } catch { /* invalid url */ }
      if (!/(^|\.)somafm\.com$/i.test(host)) {
        res.statusCode = 400;
        return res.end("station not allowed");
      }
      try {
        const up = await fetch(target, { headers: { "user-agent": "PixelDJ/0.1", icy: "0" } });
        res.setHeader("content-type", up.headers.get("content-type") || "audio/mpeg");
        res.setHeader("access-control-allow-origin", "*");
        res.setHeader("cache-control", "no-store");
        if (up.body) Readable.fromWeb(up.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
        else res.end();
      } catch {
        res.statusCode = 502;
        res.end("stream error");
      }
      return;
    }

    // ── profile persistence (server-authoritative) ──────────────────────────
    if (req.method === "GET" && url.startsWith("/api/profile")) {
      const id = new URL(url, "http://x").searchParams.get("id") || "";
      const all = await loadProfiles();
      res.setHeader("content-type", "application/json");
      return res.end(JSON.stringify(all[id] ?? null));
    }
    if (req.method === "PUT" && url.startsWith("/api/profile")) {
      try {
        const body = JSON.parse(await readBody(req)) as { id?: unknown };
        if (typeof body.id !== "string") {
          res.statusCode = 400;
          return res.end('{"ok":false,"error":"missing id"}');
        }
        const all = await loadProfiles();
        all[body.id] = body;
        await saveProfiles(all);
        res.setHeader("content-type", "application/json");
        return res.end('{"ok":true}');
      } catch {
        res.statusCode = 400;
        return res.end('{"ok":false,"error":"bad json"}');
      }
    }

    next();
  };
};

function mediaServer(port: number): Plugin {
  return {
    name: "pixel-rave-media",
    configureServer(server) {
      server.middlewares.use(mediaApi(port));
    },
    configurePreviewServer(server) {
      server.middlewares.use(mediaApi(port));
    },
  };
}

const PORT = 5190;

export default defineConfig({
  plugins: [mediaServer(PORT)],
  server: { port: PORT, host: "0.0.0.0" },
  preview: { port: PORT, host: "0.0.0.0" },
});
