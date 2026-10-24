// Noisegasm: background music for the landing page.
//
// Uploaded songs live in R2 (`music/<id>`) with a `records` row (kind 'track'); settings are one
// `records` row (kind 'musicConfig'). Like the camera data, none of this enters the cafe state.
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { database } from './store';
import { Fault } from './engine';

export const MAX_TRACK_BYTES = 20 * 1024 * 1024;
export const MAX_TRACKS = 60;

export type MusicConfig = {
  source: 'upload' | 'youtube';
  youtube: string;
  autoplay: boolean;
  volume: number;
};
export type Track = {
  id: string;
  title: string;
  artist: string;
  type: string;
  size: number;
  order: number;
  createdAt: string;
};

const DEFAULT_CONFIG: MusicConfig = { source: 'upload', youtube: '', autoplay: true, volume: 0.5 };

/** Accepts a YouTube playlist or video link and keeps only what the player needs. */
export function youtubeTarget(value: string) {
  const text = value.trim();
  if (!text) return '';
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Fault('Link YouTube tidak valid.');
  }
  const host = url.hostname.replace(/^www\.|^m\.|^music\./, '');
  if (!['youtube.com', 'youtu.be'].includes(host)) throw new Fault('Gunakan link dari YouTube.');
  const list = url.searchParams.get('list'),
    video = host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
  if (list && /^[\w-]{10,64}$/.test(list)) return 'list:' + list;
  if (video && /^[\w-]{11}$/.test(video)) return 'video:' + video;
  throw new Fault('Link harus berupa playlist atau video YouTube.');
}

export async function readMusicConfig(): Promise<MusicConfig> {
  const row = await database()
    .prepare("SELECT data FROM records WHERE id='music-config' AND kind='musicConfig'")
    .first<{ data: string }>();
  return { ...DEFAULT_CONFIG, ...(row ? (JSON.parse(row.data) as Partial<MusicConfig>) : {}) };
}

export async function saveMusicConfig(input: unknown) {
  const parsed = z
    .object({
      source: z.enum(['upload', 'youtube']),
      youtube: z.string().max(500),
      autoplay: z.boolean(),
      volume: z.number().min(0).max(1),
    })
    .parse(input);
  const config: MusicConfig = { ...parsed, youtube: youtubeTarget(parsed.youtube) };
  if (config.source === 'youtube' && !config.youtube)
    throw new Fault('Tempel link playlist YouTube dulu.');
  await database()
    .prepare(
      "INSERT INTO records(id,kind,data) VALUES('music-config','musicConfig',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    )
    .bind(JSON.stringify(config))
    .run();
  return config;
}

export async function listTracks() {
  const rows = await database()
    .prepare("SELECT data FROM records WHERE kind='track'")
    .all<{ data: string }>();
  return rows.results
    .map((r) => JSON.parse(r.data) as Track)
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

export async function getTrack(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const row = await database()
    .prepare("SELECT data FROM records WHERE id=? AND kind='track'")
    .bind('track-' + id)
    .first<{ data: string }>();
  return row ? (JSON.parse(row.data) as Track) : null;
}

async function putTrack(track: Track) {
  await database()
    .prepare(
      "INSERT INTO records(id,kind,data) VALUES(?,'track',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE kind='track'",
    )
    .bind('track-' + track.id, JSON.stringify(track))
    .run();
}

/** Recognises common audio files by their first bytes. */
export function audioType(b: Uint8Array) {
  const text = (start: number, end: number) => String.fromCharCode(...b.subarray(start, end));
  if (text(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (text(4, 8) === 'ftyp') return 'audio/mp4';
  if (text(0, 4) === 'OggS') return 'audio/ogg';
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WAVE') return 'audio/wav';
  if (text(0, 4) === 'fLaC') return 'audio/flac';
  return '';
}

export async function addTrack(bytes: ArrayBuffer, title: string, artist: string) {
  if (!env.BUCKET) throw new Fault('Penyimpanan file belum tersedia.', 503);
  if (bytes.byteLength > MAX_TRACK_BYTES) throw new Fault('Lagu maksimal 20 MB.', 413);
  const type = audioType(new Uint8Array(bytes, 0, Math.min(16, bytes.byteLength)));
  if (!type) throw new Fault('Gunakan file MP3, M4A, OGG, WAV, atau FLAC.');
  const tracks = await listTracks();
  if (tracks.length >= MAX_TRACKS) throw new Fault('Maksimal ' + MAX_TRACKS + ' lagu.');
  const track: Track = {
    id: crypto.randomUUID(),
    title: title.trim().slice(0, 80) || 'Tanpa judul',
    artist: artist.trim().slice(0, 80),
    type,
    size: bytes.byteLength,
    order: (tracks.at(-1)?.order ?? 0) + 1,
    createdAt: new Date().toISOString(),
  };
  await env.BUCKET.put('music/' + track.id, bytes, { httpMetadata: { contentType: type } });
  await putTrack(track);
  return track;
}

export async function updateTrack(id: string, input: unknown) {
  const track = await getTrack(id);
  if (!track) throw new Fault('Lagu tidak ditemukan.', 404);
  const p = z
    .object({ title: z.string().trim().min(1).max(80), artist: z.string().trim().max(80) })
    .parse(input);
  await putTrack({ ...track, ...p });
}

/** Saves a new order: `ids` lists every track from first to last. */
export async function reorderTracks(ids: unknown) {
  const order = z.array(z.string()).max(MAX_TRACKS).parse(ids);
  for (const track of await listTracks()) {
    const index = order.indexOf(track.id);
    if (index >= 0 && index + 1 !== track.order) await putTrack({ ...track, order: index + 1 });
  }
}

export async function deleteTrack(id: string) {
  await database()
    .prepare("DELETE FROM records WHERE id=? AND kind='track'")
    .bind('track-' + id)
    .run();
  await env.BUCKET?.delete('music/' + id);
}
