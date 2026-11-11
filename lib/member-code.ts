// Member card codes: WSM- and eight random letters and digits (WSM-7KQ4-X9TD), so a code cannot
// be guessed from the order cards were made in. 0/O and 1/I are left out so a code read aloud or
// typed is not mistaken; that leaves 32 characters, a fair pick from random bytes.
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_PATTERN = /^WSM-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;

/** A new random code that no card in `taken` has yet. */
export function newMemberCode(taken: Iterable<string>) {
  const used = new Set(taken);
  for (;;) {
    const chars = [...crypto.getRandomValues(new Uint8Array(8))].map(
      (b) => CODE_ALPHABET[b % CODE_ALPHABET.length],
    );
    const code = `WSM-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
    if (!used.has(code)) return code;
  }
}

/** Whether a card already has a code in the random form (old cards were WSM-0001 and so on). */
export const isMemberCode = (code: unknown) => typeof code === 'string' && CODE_PATTERN.test(code);

/**
 * A code as typed or scanned, in its stored form: "wsm 7kq4x9td", "7KQ4-X9TD" and
 * "WSM-7KQ4-X9TD" all become "WSM-7KQ4-X9TD". Anything else becomes ''.
 */
export function normalizeMemberCode(input: unknown) {
  const raw = String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^WSM/, '');
  const code = raw.length === 8 ? `WSM-${raw.slice(0, 4)}-${raw.slice(4)}` : '';
  return isMemberCode(code) ? code : '';
}
