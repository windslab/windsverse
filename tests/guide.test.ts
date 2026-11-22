import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../lib/engine';
import { initial, type Actor } from '../lib/model';
import { parseGuide, inline } from '../lib/guide-text';
import { CHAPTERS } from '../app/guide-content';

const owner: Actor = {
  id: 'o',
  employeeId: 'owner',
  name: 'Pemilik',
  email: 'o@t.example',
  role: 'admin',
};
const staff: Actor = {
  id: 's',
  employeeId: 'staff',
  name: 'Barista',
  email: 's@t.example',
  role: 'karyawan',
};
const now = new Date('2026-11-22T08:00:00+08:00');

test('guide text: lists, notes, flows and choices', () => {
  const blocks = parseGuide(`## Membuka kafe
1. Nyalakan mesin
2. Cek stok
- poin satu
- poin dua
> catatan
! awas
Datang -> Cek in | di Ringkasan -> Buka
? Pelanggan komplain?
* Minuman salah: Minta maaf -> Buat ulang
* Lainnya: Lapor admin
Kalimat biasa
masih paragraf yang sama`);
  assert.deepEqual(blocks, [
    { h: 'Membuka kafe' },
    { ol: ['Nyalakan mesin', 'Cek stok'] },
    { ul: ['poin satu', 'poin dua'] },
    { note: 'catatan' },
    { warn: 'awas' },
    { flow: [{ title: 'Datang' }, { title: 'Cek in', sub: 'di Ringkasan' }, { title: 'Buka' }] },
    {
      choice: 'Pelanggan komplain?',
      options: [
        { label: 'Minuman salah', steps: [{ title: 'Minta maaf' }, { title: 'Buat ulang' }] },
        { label: 'Lainnya', steps: [{ title: 'Lapor admin' }] },
      ],
    },
    { p: 'Kalimat biasa masih paragraf yang sama' },
  ]);
  assert.deepEqual(inline('a **b** c'), [
    { bold: false, text: 'a ' },
    { bold: true, text: 'b' },
    { bold: false, text: ' c' },
  ]);
});

test('guide: the admin writes, edits and deletes rules; staff cannot', () => {
  const s = initial(owner);
  const data = { title: 'SOP buka kafe', group: 'aturan', body: 'Datang -> Cek in', sortOrder: 0 };
  assert.throws(() => apply(s, staff, 'save', { kind: 'guides', data }, now), /admin/);
  const row = apply(s, owner, 'save', { kind: 'guides', data }, now);
  assert.equal(s.guides.length, 1);
  assert.equal(s.guides[0].updatedBy, 'Pemilik');
  apply(s, owner, 'save', { kind: 'guides', id: row.id, data: { ...data, body: 'Baru' } }, now);
  assert.equal(s.guides[0].body, 'Baru');
  assert.throws(() =>
    apply(s, owner, 'save', { kind: 'guides', data: { ...data, group: 'lain' } }, now),
  );
  apply(s, owner, 'delete', { kind: 'guides', id: row.id, reason: 'uji' }, now);
  assert.equal(s.guides.length, 0);
});

test('guide: built-in chapters have unique ids and never carry recipe amounts', () => {
  const ids = CHAPTERS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  const text = JSON.stringify(CHAPTERS);
  assert.ok(!/\d+\s*(ml|gr|gram)\b.*(espresso|susu|gula)/i.test(text));
});
