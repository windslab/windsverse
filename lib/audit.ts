import type { State, Kind } from './model';
import { kinds } from './model';
export function stripOperationalSecrets(value: any): any {
  if (Array.isArray(value)) return value.map(stripOperationalSecrets);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            !/^(pin|pin_hash|password|passwordHash|salt|token|sessionHash|apiKey|secret)$/i.test(
              key,
            ),
        )
        .map(([key, v]) => [key, stripOperationalSecrets(v)]),
    );
  return value;
}
export type AuditChange = {
  kind: Kind;
  recordId: string;
  before: unknown | null;
  after: unknown | null;
};
// Only operational records are compared. Credential hashes, PINs, tokens and request bodies never enter the audit.
export function stateChanges(
  before: Map<string, { kind: Kind; data: string }>,
  after: State,
): AuditChange[] {
  const pending = new Map(before),
    changes: AuditChange[] = [];
  for (const kind of kinds)
    for (const row of after[kind]) {
      const old = pending.get(row.id),
        data = JSON.stringify(row);
      if (!old || old.kind !== kind || old.data !== data)
        changes.push({
          kind,
          recordId: row.id,
          before: old ? stripOperationalSecrets(JSON.parse(old.data)) : null,
          after: stripOperationalSecrets(row),
        });
      pending.delete(row.id);
    }
  for (const [recordId, old] of pending)
    changes.push({
      kind: old.kind,
      recordId,
      before: stripOperationalSecrets(JSON.parse(old.data)),
      after: null,
    });
  return changes;
}
export const stateMap = (state: State) =>
  new Map(
    kinds.flatMap((kind) =>
      state[kind].map((row) => [row.id, { kind, data: JSON.stringify(row) }] as const),
    ),
  );
export function parseAuditDetail(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return { summary: value };
  }
}

export function validateArchivedAudit(kind: string, bytes: Uint8Array) {
  const rows = JSON.parse(new TextDecoder().decode(bytes));
  if (!Array.isArray(rows) || rows.length > 1000) throw Error('Format arsip audit tidak valid.');
  for (const row of rows) {
    if (!row || typeof row !== 'object') throw Error('Catatan audit tidak valid.');
    if (kind.includes('changes')) {
      if (typeof row.kind !== 'string' || typeof row.record_id !== 'string')
        throw Error('Referensi perubahan tidak valid.');
      for (const key of ['before_data', 'after_data'])
        if (row[key] !== null) {
          if (typeof row[key] !== 'string') throw Error('Nilai audit tidak valid.');
          const record = JSON.parse(row[key]);
          if (!record || typeof record !== 'object' || Array.isArray(record))
            throw Error('Catatan perubahan tidak valid.');
        }
    } else if (
      typeof row.action !== 'string' ||
      typeof row.detail !== 'string' ||
      !Number.isFinite(Date.parse(row.created_at))
    )
      throw Error('Waktu atau tindakan audit tidak valid.');
  }
  return rows;
}
