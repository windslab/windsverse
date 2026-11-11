// Member card codes: WSM- and four random letters and digits (WSM-7KQ4), about a million
// possible codes, so a code cannot be guessed from the order cards were made in. 0/O and 1/I are
// left out so a code read aloud or typed is not mistaken; that leaves 32 characters, a fair pick
// from random bytes. A code always has a letter, so it never looks like an old WSM-2345.
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_PATTERN = /^WSM-[2-9A-HJ-NP-Z]{4}$/;

/** A new random code that no card in `taken` has yet. */
export function newMemberCode(taken: Iterable<string>) {
  const used = new Set(taken);
  for (;;) {
    const chars = [...crypto.getRandomValues(new Uint8Array(4))].map(
      (b) => CODE_ALPHABET[b % CODE_ALPHABET.length],
    );
    const code = 'WSM-' + chars.join('');
    if (isMemberCode(code) && !used.has(code)) return code;
  }
}

/** Whether a card has a code in the random form (old cards were WSM-0001 and so on). */
export const isMemberCode = (code: unknown) =>
  typeof code === 'string' && CODE_PATTERN.test(code) && /[A-Z]/.test(code.slice(4));

/**
 * A code as typed or scanned, in its stored form: "wsm 7kq4", "7KQ4" and "WSM-7KQ4" all
 * become "WSM-7KQ4". Anything else becomes ''.
 */
export function normalizeMemberCode(input: unknown) {
  const raw = String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^WSM/, '');
  const code = raw.length === 4 ? 'WSM-' + raw : '';
  return isMemberCode(code) ? code : '';
}
