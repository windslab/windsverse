import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandMapsLink, mapsEmbed, mapsLink } from '../lib/maps';

test('only https Google links are accepted', () => {
  assert.equal(mapsLink('https://evil.example/maps/place/x'), null);
  assert.equal(mapsLink('http://maps.google.com/?q=x'), null);
  assert.equal(mapsLink('bukan link'), null);
  assert.ok(mapsLink('https://maps.app.goo.gl/AbC123'));
  assert.ok(mapsLink('  https://www.google.co.id/maps/place/Winds+Space  '));
});

test('a place link becomes an embed with its pin', () => {
  const url = mapsLink(
    'https://www.google.com/maps/place/Winds+Space/@-4.8301,119.5502,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x1!8m2!3d-4.8299!4d119.5511',
  )!;
  assert.equal(
    mapsEmbed(url),
    'https://www.google.com/maps?q=Winds%20Space&ll=-4.8299,119.5511&z=16&output=embed',
  );
});

test('search links, bare coordinates and embed codes all work', () => {
  assert.equal(
    mapsEmbed(mapsLink('https://www.google.com/maps?q=Winds+Space+Pangkep')!),
    'https://www.google.com/maps?q=Winds%20Space%20Pangkep&z=16&output=embed',
  );
  assert.equal(
    mapsEmbed(mapsLink('https://www.google.com/maps/@-4.83,119.55,15z')!),
    'https://www.google.com/maps?q=-4.83%2C119.55&z=16&output=embed',
  );
  const code =
    '<iframe src="https://www.google.com/maps/embed?pb=!1m18!2sWinds" width="600" height="450"></iframe>';
  assert.equal(mapsEmbed(mapsLink(code)!), 'https://www.google.com/maps/embed?pb=!1m18!2sWinds');
  assert.equal(mapsEmbed(mapsLink('https://www.google.com/search?q=winds')!), null);
});

test('short links are followed to the full link', async () => {
  const hops: Record<string, string> = {
    'https://maps.app.goo.gl/AbC':
      'https://www.google.com/maps/place/Winds+Space/@-4.83,119.55,17z',
  };
  const fetcher = (async (href: string) =>
    new Response(null, { status: 302, headers: { location: hops[href] } })) as typeof fetch;
  const full = await expandMapsLink(mapsLink('https://maps.app.goo.gl/AbC')!, fetcher);
  assert.equal(full?.pathname, '/maps/place/Winds+Space/@-4.83,119.55,17z');
  const nowhere = (async () => new Response(null, { status: 404 })) as typeof fetch;
  assert.equal(await expandMapsLink(mapsLink('https://maps.app.goo.gl/x')!, nowhere), null);
});
