// Story of Winds camera settings and admin-made film presets.
//
// Stored like photos: `records` rows outside the cafe state (kind 'cameraConfig' and
// 'filmPreset'), and optional 3D LUTs as raw RGB bytes in R2 (`lut/<preset id>`).
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { database } from './store';
import { Fault } from './engine';
import { BUILTIN_FILM_IDS } from './film-ids';

export const DEFAULT_ROLL_SIZE = 15;
export const MAX_LUT_SIZE = 33;

export type CameraConfig = { rollSize: number; hiddenFilms: string[] };

const unit = z.number().min(0).max(1);
export const presetSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,40}$/),
  name: z.string().trim().min(1).max(30),
  note: z.string().trim().max(120).default(''),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  grade: z.object({
    gain: z.tuple([
      z.number().min(0.5).max(1.5),
      z.number().min(0.5).max(1.5),
      z.number().min(0.5).max(1.5),
    ]),
    lift: z.tuple([
      z.number().min(0).max(80),
      z.number().min(0).max(80),
      z.number().min(0).max(80),
    ]),
    contrast: z.number().min(0.6).max(1.4),
    saturation: z.number().min(0).max(1.6),
    mono: z.boolean().optional(),
  }),
  grain: z.number().min(0).max(0.25),
  vignette: unit,
  leak: z
    .object({ color: z.string().regex(/^\d{1,3},\d{1,3},\d{1,3}$/), strength: unit })
    .optional(),
  date: z.boolean().optional(),
  enabled: z.boolean().default(true),
  lutSize: z.number().int().min(2).max(MAX_LUT_SIZE).optional(),
  updatedAt: z.string().optional(),
});
export type FilmPreset = z.infer<typeof presetSchema>;

export async function readConfig(): Promise<CameraConfig> {
  const row = await database()
    .prepare("SELECT data FROM records WHERE id='camera-config' AND kind='cameraConfig'")
    .first<{ data: string }>();
  const saved = row ? (JSON.parse(row.data) as Partial<CameraConfig>) : {};
  return {
    rollSize: saved.rollSize ?? DEFAULT_ROLL_SIZE,
    hiddenFilms: saved.hiddenFilms ?? [],
  };
}

export async function saveConfig(input: unknown) {
  const config = z
    .object({
      rollSize: z.number().int().min(1).max(60),
      hiddenFilms: z.array(z.string().max(40)).max(50),
    })
    .parse(input);
  await database()
    .prepare(
      "INSERT INTO records(id,kind,data) VALUES('camera-config','cameraConfig',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
    )
    .bind(JSON.stringify(config))
    .run();
  return config;
}

export async function listPresets() {
  const rows = await database()
    .prepare("SELECT data FROM records WHERE kind='filmPreset'")
    .all<{ data: string }>();
  return rows.results
    .map((r) => JSON.parse(r.data) as FilmPreset)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Saves a preset; `lut` is base64 RGB bytes (size³ × 3) or null to remove the LUT. */
export async function savePreset(input: unknown, lut: string | null | undefined) {
  const preset = presetSchema.parse(input);
  if (BUILTIN_FILM_IDS.includes(preset.id)) throw new Fault('ID preset sudah dipakai film bawaan.');
  preset.updatedAt = new Date().toISOString();
  if (lut) {
    if (!env.BUCKET) throw new Fault('Penyimpanan file belum tersedia.', 503);
    const bytes = Uint8Array.from(atob(lut), (c) => c.charCodeAt(0)),
      size = Math.round(Math.cbrt(bytes.length / 3));
    if (size < 2 || size > MAX_LUT_SIZE || size ** 3 * 3 !== bytes.length)
      throw new Fault('File LUT tidak valid.');
    await env.BUCKET.put('lut/' + preset.id, bytes, {
      httpMetadata: { contentType: 'application/octet-stream' },
    });
    preset.lutSize = size;
  } else if (lut === null) {
    await env.BUCKET?.delete('lut/' + preset.id);
    delete preset.lutSize;
  }
  await database()
    .prepare(
      "INSERT INTO records(id,kind,data) VALUES(?,'filmPreset',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE kind='filmPreset'",
    )
    .bind('preset-' + preset.id, JSON.stringify(preset))
    .run();
  return preset;
}

export async function deletePreset(id: string) {
  await database()
    .prepare("DELETE FROM records WHERE id=? AND kind='filmPreset'")
    .bind('preset-' + id)
    .run();
  await env.BUCKET?.delete('lut/' + id);
}

/** Film ids a guest may shoot with right now. */
export async function availableFilmIds() {
  const [config, presets] = await Promise.all([readConfig(), listPresets()]);
  return [
    ...BUILTIN_FILM_IDS.filter((id) => !config.hiddenFilms.includes(id)),
    ...presets.filter((p) => p.enabled).map((p) => p.id),
  ];
}
