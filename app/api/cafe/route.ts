import { authenticate } from '@/lib/auth';
import { publicOrder } from '@/lib/model';
import {
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
    // Who is asking and the café itself are fetched at the same time, not one after the other.
    const [actor, loaded] = await Promise.all([
      authenticate(req),
      read(undefined, typeof data?.key === 'string' ? data.key : undefined),
    ]);
    if (data.action === 'save' && data.payload?.kind === 'settings' && data.payload.data)
      data.payload.data = await settingsMap(data.payload.data, loaded.state.settings[0]);
    const result = await commit(
      loaded,
      actor,
      data.action,
      data.payload || {},
      data.revision,
      data.key,
    );
    // The saved café goes back with the answer, so the app shows it without asking again (one
    // round trip and one full read less per tap). A repeated request changed nothing: no state.
    const saved = !(result as { duplicate?: boolean } | undefined)?.duplicate;
    const [revision, extra] = (loaded.version || '0.0').split('.').map(Number);
    return Response.json(
      {
        ok: true,
        result: actor.role !== 'admin' && result?.items ? publicOrder(result) : result,
        ...(saved
          ? {
              actor,
              setup: false,
              revision: revision + 1,
              version: `${revision + 1}.${extra || 0}`,
              state: visible(loaded.state, actor),
              estimates: estimatesFor(loaded.state, actor),
            }
          : {}),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
