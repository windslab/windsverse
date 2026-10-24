import { Fault } from './engine';
const encoder = new TextEncoder();
export const ITERATIONS = 100_000; // Cloudflare Workers WebCrypto PBKDF2 limit.
export function hex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export function randomSecret(bytes = 32) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}
export async function digest(value: string) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}
export function loginId(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/.test(value.trim()))
    throw new Fault('ID harus 3–32 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.');
  return value.trim().toLowerCase();
}
export function validatePin(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^\d{8,12}$/.test(value))
    throw new Fault('PIN harus terdiri dari 8–12 angka.');
  if (
    /^(\d)\1+$/.test(value) ||
    '01234567890123456789'.includes(value) ||
    '98765432109876543210'.includes(value)
  )
    throw new Fault('Gunakan PIN yang tidak berulang atau berurutan.');
}
export async function hashPin(pin: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ]);
  return hex(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: encoder.encode(salt), iterations: ITERATIONS, hash: 'SHA-256' },
      key,
      256,
    ),
  );
}
export async function verifyPin(pin: unknown, credential: { salt: string; pin_hash: string }) {
  const value = typeof pin === 'string' && pin.length <= 64 ? pin : '';
  const actual = await hashPin(value, credential.salt);
  let diff = actual.length ^ credential.pin_hash.length;
  for (let i = 0; i < actual.length; i++)
    diff |= actual.charCodeAt(i) ^ (credential.pin_hash.charCodeAt(i) || 0);
  return diff === 0;
}
