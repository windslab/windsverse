/** Built-in film ids (looks in lib/film.ts). Shared by server code that cannot import canvas code. */
export const BUILTIN_FILM_IDS = ['hangat', 'retro', 'sekali-pakai', 'senja', 'klasik'];
const NAMES: Record<string, string> = {
  hangat: 'Hangat 200',
  retro: 'Retro 70',
  'sekali-pakai': 'Sekali Pakai',
  senja: 'Senja',
  klasik: 'Klasik',
};
export const filmName = (id: string) => NAMES[id] ?? 'Preset Winds';
