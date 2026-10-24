import { body, checkMutation, errorResponse } from '@/lib/store';
import { Fault } from '@/lib/engine';
import { adminOrNull } from '@/lib/photos';
import { deletePreset, listPresets, readConfig, saveConfig, savePreset } from '@/lib/camera-config';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

/** Guests: roll size and enabled presets. Admins (?admin=1): everything, including hidden ones. */
export async function GET(req: Request) {
  try {
    const all = new URL(req.url).searchParams.get('admin') === '1';
    if (all && !(await adminOrNull(req)))
      throw new Fault('Hanya admin yang dapat mengatur kamera.', 403);
    const [config, presets] = await Promise.all([readConfig(), listPresets()]);
    return Response.json(
      { config, presets: all ? presets : presets.filter((p) => p.enabled) },
      { headers: noStore },
    );
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    checkMutation(req);
    if (!(await adminOrNull(req))) throw new Fault('Hanya admin yang dapat mengatur kamera.', 403);
    const p = await body(req);
    if (p.action === 'config') return Response.json({ config: await saveConfig(p.config) });
    if (p.action === 'preset') return Response.json({ preset: await savePreset(p.preset, p.lut) });
    if (p.action === 'deletePreset') {
      if (typeof p.id !== 'string') throw new Fault('Preset tidak ditemukan.');
      await deletePreset(p.id);
      return Response.json({ ok: true });
    }
    throw new Fault('Perintah tidak dikenal.');
  } catch (e) {
    return errorResponse(e);
  }
}
