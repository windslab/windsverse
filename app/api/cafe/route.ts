import { authenticate } from '@/lib/auth';
import { localDate, publicOrder } from '@/lib/model';
import { Fault } from '@/lib/engine';
import {
  RECENT_ACTIONS,
  read,
  visible,
  checkMutation,
  body,
  commit,
  errorResponse,
  dataVersion,
} from '@/lib/store';
import { estimatesFor } from '@/lib/payroll-estimate';
import { settingsMap } from '@/lib/settings-map';
import { recodeMembers } from '@/lib/midnight';
import { isMemberCode } from '@/lib/member-code';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    // The app polls every few seconds with the version it already has: if nothing changed, one
    // row is read instead of the whole café. The session check runs alongside that read.
    const since = url.searchParams.get('v');
    const poll = since && url.searchParams.get('audit') !== '1';
    const [actor, version] = await Promise.all([
      authenticate(req),
      poll ? dataVersion() : Promise.resolve(''),
    ]);
    if (poll) {
      if (version && version === since)
        return Response.json(
          { unchanged: true, version },
          { headers: { 'Cache-Control': 'no-store' } },
        );
    }
    let loaded = await read();
    // Cards from before random codes get theirs the first time staff open the app.
    if (loaded.state.members.some((m) => !isMemberCode(m.code)) && (await recodeMembers()))
      loaded = await read();
    const extra =
      actor.role === 'admin' && url.searchParams.get('audit') === '1'
        ? await loaded.db
            .prepare(
              'SELECT actor_id,action,detail,created_at FROM audit ORDER BY created_at DESC LIMIT 100',
            )
            .all()
        : null;
    return Response.json(
      {
        actor,
        setup: !loaded.control,
        revision: loaded.control?.revision || 0,
        version: loaded.version,
        state: visible(loaded.state, actor),
        estimates: estimatesFor(loaded.state, actor),
        audit: extra?.results,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    checkMutation(req);
    const data = await body(req);
    const key = typeof data?.key === 'string' ? data.key : undefined;
    const payload = data.payload || {};
    // A daily tap on the till reads only the recent café (lib/store RECENT_SQL), not books, games
    // or months of finished orders; everything else reads it all.
    const recent = RECENT_ACTIONS.includes(data.action)
      ? {
          month: localDate().slice(0, 7) + '-01',
          memberId: typeof payload.memberId === 'string' ? payload.memberId : undefined,
          orderId: typeof payload.id === 'string' ? payload.id : undefined,
        }
      : undefined;
    // Who is asking and the café itself are fetched at the same time, not one after the other.
    const [actor, first] = await Promise.all([authenticate(req), read(undefined, key, recent)]);
    let loaded = first;
    if (data.action === 'save' && payload.kind === 'settings' && payload.data)
      payload.data = await settingsMap(payload.data, loaded.state.settings[0]);
    let out = { written: [] as { kind: string; id: string }[], removed: [] as string[] };
    const run = () =>
      commit(
        loaded,
        actor,
        data.action,
        structuredClone(payload),
        data.revision,
        key!,
        undefined,
        out,
      );
    let result;
    try {
      result = await run();
    } catch (e) {
      // Refused on the recent part alone (an old shift chosen, say, or a real refusal): ask again
      // with the whole café, so the answer is the same as it always was. A conflict stays one.
      if (!loaded.recentFrom || !(e instanceof Fault) || e.status === 409) throw e;
      loaded = await read(undefined, key);
      out = { written: [], removed: [] };
      result = await run();
    }
    const saved = !(result as { duplicate?: boolean } | undefined)?.duplicate;
    const [revision, extra] = (loaded.version || '0.0').split('.').map(Number);
    const next = {
      actor,
      setup: false,
      revision: revision + 1,
      version: `${revision + 1}.${extra || 0}`,
    };
    const answer = actor.role !== 'admin' && result?.items ? publicOrder(result) : result;
    let fresh = {};
    if (saved && loaded.recentFrom) {
      // Only part of the café was read: the answer carries just the records this tap changed, and
      // the payroll estimates of the months read whole. The app puts them into what it shows.
      const from = loaded.recentFrom;
      const shown = visible(loaded.state, actor) as Record<string, { id: string }[]>;
      const written = out.written.flatMap(({ kind, id }) => {
        const record = shown[kind]?.find((r) => r.id === id);
        return record ? [{ kind, record }] : [];
      });
      fresh = {
        ...next,
        patch: {
          written,
          removed: [
            ...out.removed,
            ...out.written
              .filter((w) => !written.some((x) => x.record.id === w.id))
              .map((w) => w.id),
          ],
          estimatesFrom: from,
          estimates: estimatesFor(loaded.state, actor).filter((e) => e.period + '-01' >= from),
        },
      };
    } else if (saved)
      // The saved café goes back with the answer, so the app shows it without asking again.
      fresh = {
        ...next,
        state: visible(loaded.state, actor),
        estimates: estimatesFor(loaded.state, actor),
      };
    return Response.json(
      { ok: true, result: answer, ...fresh },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
