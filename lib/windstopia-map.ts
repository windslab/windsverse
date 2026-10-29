// The open world of Windstopia: named places on the island. Story chapters, characters and clues
// will be placed on these (see LORE_WINDSTOPIA.md). The world reports which place Luna stands in
// (`regionAt` in lib/cafe-world.ts); this file gives each place its name and keeps track of which
// ones she has visited (in this browser).
export type Region = {
  id: string;
  name: string;
  /** One line shown the first time Luna arrives. */
  note: string;
};

export const REGIONS: Region[] = [
  { id: 'kafe', name: 'Kafe Winds', note: 'Satu-satunya kafe di pulau.' },
  { id: 'jalan', name: 'Jalan Pulau', note: 'Jalan yang membelah pulau dari ujung ke ujung.' },
  { id: 'padang', name: 'Padang Rumput', note: 'Hamparan hijau tempat angin bermain.' },
  { id: 'sungai', name: 'Sungai', note: 'Airnya mengalir pelan menuju laut.' },
  { id: 'danau', name: 'Danau Hati', note: 'Danau kecil berbentuk hati.' },
  { id: 'menara', name: 'Menara Mercusuar', note: 'Menara tua dengan perpustakaan di dalamnya.' },
  { id: 'dermaga', name: 'Dermaga', note: 'Kayu tua yang menjorok ke laut.' },
  { id: 'pantai-depan', name: 'Pantai Depan', note: 'Pasir pucat dan ombak yang tenang.' },
  { id: 'pantai-kiri', name: 'Pantai Barat', note: 'Ujung pulau yang sepi.' },
  { id: 'pantai-kanan', name: 'Pantai Timur', note: 'Ujung pulau yang sepi.' },
  { id: 'pantai-belakang', name: 'Pantai Belakang', note: 'Pantai tersembunyi di balik gunung.' },
  { id: 'sawah', name: 'Persawahan', note: 'Petak-petak sawah bertingkat, hijau bertingkat naik.' },
  {
    id: 'kebun',
    name: 'Perkebunan',
    note: 'Barisan semak dan pohon buah yang dirawat para petani.',
  },
  { id: 'rumah-lereng', name: 'Rumah Lereng', note: 'Rumah warga di kaki pegunungan.' },
  { id: 'rumah-sungai', name: 'Rumah Tepi Sungai', note: 'Rumah warga di dekat sungai.' },
  { id: 'rumah-danau', name: 'Rumah Tepi Danau', note: 'Rumah warga di dekat Danau Hati.' },
  { id: 'rumah-pantai', name: 'Rumah Pantai', note: 'Rumah warga di dekat pantai.' },
  { id: 'rumah-kebun', name: 'Rumah Kebun', note: 'Rumah warga di dekat perkebunan.' },
  { id: 'rumah-sawah', name: 'Rumah Sawah', note: 'Rumah warga di dekat persawahan.' },
  { id: 'kaki-gunung', name: 'Kaki Pegunungan', note: 'Tanah mulai menanjak.' },
  { id: 'pegunungan', name: 'Pegunungan', note: 'Lereng-lereng hijau dan berbatu.' },
  { id: 'puncak', name: 'Puncak', note: 'Dari sini seluruh pulau terlihat.' },
];
const byId = new Map(REGIONS.map((r) => [r.id, r]));
export const regionById = (id: string) => byId.get(id);

const KEY = 'windstopia-visited-v1';
export function visitedRegions(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
/** Marks a place as visited; returns true the first time. */
export function visitRegion(id: string): boolean {
  const seen = visitedRegions();
  if (seen.includes(id)) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen, id]));
  } catch {
    /* Storage blocked: the discovery counts for this visit only. */
  }
  return true;
}
