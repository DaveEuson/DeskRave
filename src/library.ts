import { isAudioFile, trackFromMediaFile, type Track } from "./tracks";

// Client side of the kiosk file subsystem (server lives in vite.config.ts).

// Files already persisted on the server — loaded on boot so the library survives reload.
export async function fetchLibrary(): Promise<Track[]> {
  try {
    const res = await fetch("/api/library");
    if (!res.ok) return [];
    const files: string[] = await res.json();
    return files.map(trackFromMediaFile);
  } catch {
    return []; // running without the dev/preview server (e.g. a static file:// open)
  }
}

// Persist a file to the server. Raw body + filename header — no multipart, no deps.
export async function uploadFile(file: File): Promise<boolean> {
  if (!isAudioFile(file)) return false;
  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "x-filename": encodeURIComponent(file.name) },
      body: file,
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Delete a persisted file from the server (best-effort).
export async function deleteFile(name: string): Promise<void> {
  try {
    await fetch("/api/file", { method: "DELETE", headers: { "x-filename": encodeURIComponent(name) } });
  } catch {
    /* server not running — nothing to delete */
  }
}

// The LAN URL a phone can hit to reach this kiosk.
export async function serverInfo(): Promise<string | null> {
  try {
    const res = await fetch("/api/info");
    if (!res.ok) return null;
    return (await res.json()).host as string;
  } catch {
    return null;
  }
}
