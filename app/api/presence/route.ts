import { authenticate } from '@/lib/auth';
import { database } from '@/lib/store';
import { checkMutation, errorResponse, body } from '@/lib/store';
import { Fault } from '@/lib/engine';

export const dynamic = 'force-dynamic';
const ttl = 30_000;

export async function GET() {
  try {
    const cutoff = new Date(Date.now() - ttl).toISOString();
    const row = await database()
      .prepare(
        "SELECT count(*) AS n FROM records WHERE kind='presence' AND json_extract(data,'$.updatedAt')>? ",
      )
      .bind(cutoff)
      .first<{ n: number }>();
    return Response.json(
      { active: (row?.n || 0) > 0 },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    checkMutation(req);
    const actor = await authenticate(req);
    const input = await body(req);
    if (typeof input.active !== 'boolean') throw new Fault('Status aktivitas tidak valid.');
    const db = database(),
      now = Date.now();
    await db
      .prepare("DELETE FROM records WHERE kind='presence' AND json_extract(data,'$.updatedAt')<=?")
      .bind(new Date(now - ttl).toISOString())
      .run();
    const id = 'presence:' + actor.employeeId;
    if (input.active)
      await db
        .prepare(
          "INSERT INTO records(id,kind,data) VALUES(?,'presence',?) ON CONFLICT(id) DO UPDATE SET kind='presence',data=excluded.data",
        )
        .bind(id, JSON.stringify({ updatedAt: new Date(now).toISOString() }))
        .run();
    else await db.prepare("DELETE FROM records WHERE id=? AND kind='presence'").bind(id).run();
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
