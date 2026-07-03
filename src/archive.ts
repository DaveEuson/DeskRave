// Client-side Internet Archive music discovery — the "get more music" engine.
// No server: the browser calls archive.org's public search + metadata APIs
// directly (they send CORS *), and streamed tracks feed the AnalyserNode like
// local files. License-safe by construction: only plain CC-BY / CC0 / PD passes,
// verified against each item's own metadata — the user can never add NC/SA/ND.
import { GENRE_HUE, type Genre } from "./config";
import type { Track } from "./tracks";

export interface ArchiveItem {
  id: string;
  title: string;
  artist: string;
  license: string;
}

interface RawFile { name: string; title?: string; }
interface RawMeta { metadata?: { creator?: string | string[]; title?: string; licenseurl?: string }; files?: RawFile[]; }

const PLAYABLE = ["mp3", "m4a", "opus", "ogg"];

// short, human license label — or null if the licence isn't safe to redistribute
function licenceLabel(url: string | undefined): string | null {
  const u = (url || "").toLowerCase();
  const seg = u.split("/licenses/")[1] || "";
  if (u.includes("/licenses/by/") && !/^by-(nc|sa|nd)/.test(seg)) {
    return u.includes("/4.0") ? "CC BY 4.0" : u.includes("/3.0") ? "CC BY 3.0" : "CC BY";
  }
  if (u.includes("publicdomain/zero")) return "CC0";
  if (u.includes("/publicdomain/")) return "Public Domain";
  return null;
}

const first = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? v[0] : v) || "Unknown";

// Search archive.org for CC-safe music. `genre` (optional) narrows by subject.
export async function searchMusic(query: string, genre?: Genre): Promise<ArchiveItem[]> {
  const terms = [
    "mediatype:audio",
    "(licenseurl:(*creativecommons.org\\/licenses\\/by\\/*) OR licenseurl:(*publicdomain*))",
    // keep it MUSIC, not archive.org's mountain of audiobooks / talks / OTR
    "-collection:librivoxaudio", "-collection:oldtimeradio", "-collection:radioprograms",
    "-collection:podcasts", "-collection:audio_bookspoetry",
    "-subject:audiobook", "-subject:librivox", "-subject:audiobooks",
  ];
  if (query.trim()) terms.push(`(${query.trim()})`);
  if (genre) terms.push(`subject:(${genre})`);
  const url =
    "https://archive.org/advancedsearch.php?q=" + encodeURIComponent(terms.join(" AND ")) +
    "&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&rows=28&sort[]=downloads+desc&output=json";
  const res = (await fetch(url).then((r) => r.json())) as { response?: { docs?: Record<string, unknown>[] } };
  const out: ArchiveItem[] = [];
  for (const d of res.response?.docs ?? []) {
    const lic = licenceLabel(d.licenseurl as string);
    if (!lic) continue; // belt + suspenders: re-filter client-side
    out.push({
      id: String(d.identifier),
      title: String(d.title ?? d.identifier),
      artist: first(d.creator as string | string[]),
      license: lic,
    });
  }
  return out;
}

// Resolve an item to playable streamed Tracks (verifies the licence again).
export async function itemTracks(id: string, genre: Genre): Promise<Track[]> {
  const meta = (await fetch(`https://archive.org/metadata/${id}`).then((r) => r.json())) as RawMeta;
  const lic = licenceLabel(meta.metadata?.licenseurl);
  if (!lic || !meta.files) return [];
  const artist = first(meta.metadata?.creator);
  const have = new Set(meta.files.map((f) => f.name.toLowerCase().split(".").pop()!));
  const ext = PLAYABLE.find((e) => have.has(e));
  if (!ext) return [];
  const files = meta.files.filter((f) => f.name.toLowerCase().endsWith("." + ext)).sort((a, b) => a.name.localeCompare(b.name));
  const single = files.length === 1;
  const hue = GENRE_HUE[genre];
  // cap per item: real albums rarely exceed this; a stray audiobook/mix that slips
  // the filters can't flood the library
  return files.slice(0, 25).map((f) => {
    let title = (f.title || "").trim();
    if (!title) title = single ? (meta.metadata?.title || f.name) : f.name.replace(/\.[^.]+$/, "");
    title = title.replace(/\s*[([].*?[)\]]\s*$/, "").replace(/^\d+\s*[-_.)]?\s*/, "").replace(/_/g, "'").trim();
    return {
      src: `https://archive.org/download/${id}/${encodeURIComponent(f.name)}`,
      title: title || id,
      artist,
      license: lic,
      hue,
      station: false,
      genre,
      sourceUrl: `https://archive.org/details/${id}`,
    };
  });
}
