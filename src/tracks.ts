// A Track is anything playable: either a curated CC stream from the Internet
// Archive, or a local file the user dropped in. Both feed the same audio graph,
// so local files get the full reactive treatment with no DRM or licensing strings.
import { ACCEPTED_AUDIO, CC_STATION, CC_STREAM, PALETTES, STANDALONE, STATIONS, radioUrl, type Genre } from "./config";

export interface Track {
  src: string; // playable URL — radio proxy, archive.org URL, or a local object URL
  title: string;
  artist: string;
  license: string; // shown in the HUD
  hue: number; // base palette hue for the visuals
  local?: boolean; // true for user-dropped files
  station?: boolean; // true for continuous internet-radio streams
  custom?: boolean; // a user-added station (removable)
  stream?: string; // raw stream URL (custom stations — used to remove them)
  genre?: Genre; // station genre — drives the venue×genre Cred multiplier
  sourceUrl?: string; // attribution link (CC tracks only)
}

// A user-added internet-radio station → a playable Track (proxied for the FFT).
export function trackFromStation(s: { name: string; stream: string; genre: Genre; hue: number }): Track {
  return {
    src: radioUrl(s.stream),
    title: s.name,
    artist: `custom · ${s.genre}`,
    license: "internet radio",
    hue: s.hue,
    station: true,
    custom: true,
    stream: s.stream,
    genre: s.genre,
  };
}

// Internet radio stations (continuous streams, proxied for CORS).
// Kiosk-only: the SomaFM presets are for the personal device — a distributed
// build can't ship someone else's streams (licensing), so standalone starts
// with the bundled CC tracks and the user's own stations/files instead.
export const STATION_TRACKS: Track[] = STANDALONE ? [] : STATIONS.map((s) => ({
  src: radioUrl(s.stream),
  title: s.name,
  artist: `SomaFM · ${s.genre}`,
  license: "internet radio",
  hue: s.hue,
  station: true,
  genre: s.genre,
  sourceUrl: "https://somafm.com",
}));

// The bundled offline core + the streamed Internet-Archive catalogue → one CC
// library. Genre + attribution flow straight through from the config; hue is
// spread across the palette so consecutive tracks don't all glow the same.
export const CC_TRACKS: Track[] = [...CC_STATION.tracks, ...CC_STREAM].map((t, i) => ({
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
