// A Track is anything playable: either a curated CC stream from the Internet
// Archive, or a local file the user dropped in. Both feed the same audio graph,
// so local files get the full reactive treatment with no DRM or licensing strings.
import { ACCEPTED_AUDIO, CC_STATION, PALETTES, STATIONS, radioUrl } from "./config";

export interface Track {
  src: string; // playable URL — radio proxy, archive.org URL, or a local object URL
  title: string;
  artist: string;
  license: string; // shown in the HUD
  hue: number; // base palette hue for the visuals
  local?: boolean; // true for user-dropped files
  station?: boolean; // true for continuous internet-radio streams
  sourceUrl?: string; // attribution link (CC tracks only)
}

// Internet radio stations (continuous streams, proxied for CORS).
export const STATION_TRACKS: Track[] = STATIONS.map((s) => ({
  src: radioUrl(s.stream),
  title: s.name,
  artist: `SomaFM · ${s.genre}`,
  license: "internet radio",
  hue: s.hue,
  station: true,
  sourceUrl: "https://somafm.com",
}));

// The CC-BY station tracks, sourced from the balance config.
export const CC_TRACKS: Track[] = CC_STATION.tracks.map((t, i) => ({
  ...t,
  hue: PALETTES[i % PALETTES.length].hue,
}));

export const isAudioFile = (f: File): boolean =>
  f.type.startsWith("audio/") || ACCEPTED_AUDIO.test(f.name);

let localHue = 20;
const nextHue = (): number => (localHue = (localHue + 47) % 360); // spread across the palette
const stripExt = (name: string): string => name.replace(/\.[^.]+$/, "");

// A just-dropped file: played instantly from an in-memory object URL.
export function trackFromFile(file: File): Track {
  return {
    src: URL.createObjectURL(file),
    title: stripExt(file.name),
    artist: "your library",
    license: "local file",
    hue: nextHue(),
    local: true,
  };
}

// A file already persisted on the server, served same-origin from /media.
export function trackFromMediaFile(name: string): Track {
  return {
    src: `/media/${encodeURIComponent(name)}`,
    title: stripExt(name),
    artist: "your library",
    license: "local file",
    hue: nextHue(),
    local: true,
  };
}
