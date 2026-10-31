#!/usr/bin/env node
// Makes a smaller backup package (.winds.jsonl) that keeps only the menu, its photos, HPP and
// recipes, for moving the café to a new host. Everything else (orders, shifts, staff, chat, ...)
// is left out. Settings and wage tiers stay because a restore needs them.
//
//   node scripts/filter-backup.mjs <in.winds.jsonl> <out.winds.jsonl>
//
// The output contains real recipes: keep it outside the repository.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const KEEP = ['products', 'categories', 'ingredients', 'recipes', 'settings', 'tiers'];
const CHUNK_SIZE = 1024 * 1024; // must match lib/backups.ts

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Pakai: node scripts/filter-backup.mjs <cadangan.winds.jsonl> <hasil.winds.jsonl>');
  process.exit(1);
}

const lines = readFileSync(input, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const header = lines[0];
if (header.type !== 'header' || header.format !== 'winds-space-backup-v2')
  throw new Error('Bukan paket cadangan Winds Space (.winds.jsonl).');
const chunksOf = (partId) =>
  lines.filter((l) => l.type === 'chunk' && l.partId === partId).sort((a, b) => a.index - b.index);
const bytesOf = (partId) =>
  Buffer.concat(chunksOf(partId).map((c) => Buffer.from(c.data, 'base64')));

const statePart = header.parts.find((p) => p.kind === 'state');
const state = JSON.parse(bytesOf(statePart.partId).toString('utf8'));
const data = {};
for (const kind of Object.keys(state.data))
  data[kind] = KEEP.includes(kind) ? state.data[kind] : [];
const kept = { ...state, data };

const used = new Set(
  [...JSON.stringify(data).matchAll(/\/api\/files\/([a-f0-9-]{36})/g)].map((m) => m[1]),
);
const images = header.parts.filter(
  (p) => p.kind === 'image' && p.status === 'ready' && used.has(p.metadata.originalId),
);

const stateBytes = Buffer.from(JSON.stringify(kept), 'utf8');
const sha256 = createHash('sha256').update(stateBytes).digest('hex');
const out = [
  {
    type: 'header',
    format: 'winds-space-backup-v2',
    createdAt: header.createdAt,
    revision: header.revision,
    reason: 'Pindah hosting: menu, foto menu, HPP, resep',
    parts: [{ ...statePart, size: stateBytes.length, sha256 }, ...images],
  },
];
for (let index = 0; index * CHUNK_SIZE < stateBytes.length; index++)
  out.push({
    type: 'chunk',
    partId: statePart.partId,
    index,
    data: stateBytes.subarray(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE).toString('base64'),
  });
for (const image of images) out.push(...chunksOf(image.partId));
out.push({ type: 'end' });
writeFileSync(output, out.map((l) => JSON.stringify(l)).join('\n') + '\n');

console.log('Paket baru:', output);
for (const kind of KEEP) console.log(`  ${kind}: ${data[kind].length}`);
console.log(`  foto: ${images.length}`);
