// Windstopia regulars: the café's friends, each with a look, a favourite drink, the hours they
// tend to come and four pieces of their story, which open one by one as Luna gets to know them.
// The stories follow what really happened around the café (written with the owner).

export type RegularLook = {
  skin?: number;
  hair?: number;
  style?:
    | 'crop'
    | 'spiky'
    | 'sidepart'
    | 'buzz'
    | 'cap'
    | 'curly'
    | 'long'
    | 'ponytail'
    | 'bun'
    | 'bob'
    | 'hijab'
    | 'pigtails';
  shirt?: number;
  pants?: number;
  shoes?: number;
  accent?: number;
  size?: number;
  glasses?: boolean;
  beard?: 'none' | 'mustache' | 'goatee' | 'stubble' | 'full';
};

export type Regular = {
  name: string;
  male: boolean;
  /** Who they are, for Luna's guest book. */
  about: string;
  /** Menu names they order most of the time, best first (matched against the café's menu). */
  favorite: RegExp[];
  /** Game hours they come in, as [from, to) ranges; to may pass midnight (e.g. [18, 26]). */
  hours: [number, number][];
  /** How often they come compared with a passing guest (1); low for friends who live away. */
  weight: number;
  /** 'vvip' never pays; 'treat' pays for everyone in the café. */
  pays?: 'vvip' | 'treat';
  look: RegularLook;
  /** What they say as each piece of their story opens. */
  stories: [string, string, string, string];
};

const NIGHT: [number, number][] = [[18, 26]],
  AFTERNOON_NIGHT: [number, number][] = [[15, 24]],
  ANY: [number, number][] = [[0, 24]];
/** Skin tones from light to dark (the same ones guests are drawn with). */
const SKIN = { light: 0xf6d2b0, fair: 0xeec19a, tan: 0xcf9a6e, brown: 0xb98257, dark: 0x9c6a45 };

export const REGULARS: Regular[] = [
  {
    name: 'Fajar',
    male: true,
    about: 'Teman sekolah owner. Ikut membangun kafe, kini kerja malam di depan laptop.',
    favorite: [/americano/i],
    hours: NIGHT,
    weight: 4,
    look: { skin: SKIN.brown, style: 'curly', beard: 'full', size: 1.08, shirt: 0x3e4a61 },
    stories: [
      'Americano satu, Luna. Malam ini kerjaan numpuk lagi.',
      'Kamu tahu nggak? Waktu kafe ini dibangun, aku ikut bantu dari awal.',
      'Aku dan owner pulau ini teman sekolah. Dulu kami cuma bisa membayangkan tempat seperti ini.',
      'Aku kerja di sini tiap malam bukan cuma karena tenang. Rasanya seperti pulang ke sesuatu yang kami bangun bareng.',
    ],
  },
  {
    name: 'Uli',
    male: false,
    about: 'Teman sekolah owner dan Fajar. Akrab sejak kafe berdiri, suka bantu menstempel gelas.',
    favorite: [/matcha|cokelat|coklat|chocolate/i],
    hours: AFTERNOON_NIGHT,
    weight: 3,
    look: { skin: SKIN.light, style: 'long', size: 0.93, shirt: 0xe8b4b8 },
    stories: [
      'Matcha ya, Luna. Atau… cokelat? Hmm, matcha deh.',
      'Lucu ya, aku satu sekolah sama Fajar dan owner, tapi baru akrab setelah sering ketemu di sini.',
      'Gelasnya belum distempel? Sini aku bantu. Logo Winds Space-nya harus pas di tengah!',
      'Kafe ini yang bikin kami jadi dekat. Kadang sebuah tempat bisa jadi alasan orang berteman.',
    ],
  },
  {
    name: 'Vira',
    male: false,
    about: 'Teman sekolah owner, akrab setelah sering bertemu. Biasanya datang bersama Uli.',
    favorite: [/(^es |iced ).*americano|americano.*(ice|dingin)/i, /americano/i],
    hours: AFTERNOON_NIGHT,
    weight: 3,
    look: { skin: SKIN.tan, style: 'long', glasses: true, size: 0.94, shirt: 0x9cc59a },
    stories: [
      'Americano dingin, ya. Uli mana? Biasanya dia sudah duluan.',
      'Aku juga satu sekolah sama mereka, tapi dulu kami cuma saling tahu nama.',
      'Datang ke sini bareng Uli sudah jadi kebiasaan. Rasanya aneh kalau sendirian.',
      'Kalau anak-anak naik gunung atau lihat sunset, aku pasti ikut. Lain kali kamu ikut juga ya, Luna.',
    ],
  },
  {
    name: 'Aan',
    male: true,
    about:
      'Akrab setelah sering bertemu di kafe. Sering mendaki gunung belakang bersama yang lain.',
    favorite: [/kopi|coffee|americano/i],
    hours: ANY,
    weight: 2,
    look: { skin: SKIN.light, style: 'sidepart', glasses: true, size: 0.98, shirt: 0x7fa6c9 },
    stories: [
      'Halo, Luna. Aku baru turun dari bukit belakang, haus banget.',
      'Dulu aku jarang ngobrol sama anak-anak ini. Sekarang malah sering naik gunung bareng.',
      'Jalan setapak ke gunung itu samar-samar. Tapi kalau sudah hafal, nggak akan tersesat.',
      'Dari dekat puncak, kafe ini kelihatan kecil sekali. Padahal dari sinilah cerita kami dimulai.',
    ],
  },
  {
    name: 'Fina',
    male: false,
    about: 'Datang kapan saja dan senang berfoto di kafe. Akrab setelah sering datang.',
    favorite: [/(^es |iced ).*(cokelat|coklat|chocolate)/i, /cokelat|coklat|chocolate/i],
    hours: ANY,
    weight: 3,
    look: { skin: SKIN.fair, style: 'hijab', glasses: true, size: 1.0, accent: 0x8c6f9e },
    stories: [
      'Es cokelat satu! Eh, boleh foto dulu sebelum diminum?',
      'Sudut-sudut kafe ini fotogenik banget. Galeri HP-ku penuh foto dari sini.',
      'Pagi, siang, malam… kafe ini selalu punya cahaya yang beda. Makanya aku datang kapan saja.',
      'Dulu aku cuma pengunjung. Sekarang aku punya teman di sini, dan foto-foto itu jadi kenangan kami.',
    ],
  },
  {
    name: 'Adit',
    male: true,
    about: 'Kapten kapal dan teman sekolah owner. Jarang datang, tapi selalu membawa oleh-oleh.',
    favorite: [/lemon/i],
    hours: ANY,
    weight: 0.6,
    look: { skin: SKIN.tan, style: 'cap', accent: 0x2f3a56, shirt: 0xf3efe7, size: 1.04 },
    stories: [
      'Luna! Lemon tea satu. Aku baru turun dari kapal.',
      'Ini oleh-oleh dari pelayaran kemarin. Bagi ke anak-anak ya.',
      'Waktu kafe ini dibangun, aku sempat ikut bantu sebelum berangkat berlayar lagi.',
      'Di tengah laut aku sering ingat tempat ini. Kalau pulang, yang pertama kucari ya kafe ini.',
    ],
  },
  {
    name: 'Acca',
    male: true,
    about: 'Teman terdekat owner sejak SMP. Ikut membangun kafe, kini merantau. VVIP.',
    favorite: [/stroberi|strawberry/i],
    hours: ANY,
    weight: 0.5,
    pays: 'vvip',
    look: { skin: SKIN.tan, style: 'curly', beard: 'mustache', size: 0.95, shirt: 0xd98b6a },
    stories: [
      'Strawberry ada? Hehe, pasti ada lah buat aku.',
      'Aku kenal owner sejak SMP sampai SMA. Dari dulu kami selalu bareng.',
      'Waktu kafe ini dibangun aku ikut bantu. Sekarang aku merantau, jadi jarang mampir.',
      'Owner bilang aku nggak usah bayar di sini. Katanya, aku sudah lunas waktu menemaninya di masa-masa sulit.',
    ],
  },
  {
    name: 'Mamat',
    male: true,
    about: 'Teman terdekat owner, bekerja di kota lain. Suka membaca. VVIP.',
    favorite: [/americano/i],
    hours: ANY,
    weight: 0.5,
    pays: 'vvip',
    look: { skin: SKIN.dark, style: 'long', size: 1.0, shirt: 0x4f6d5a },
    stories: [
      'Americano, Luna. Aku mau baca sebentar di pojok.',
      'Buku ini kubawa dari kota tempat aku kerja. Bagus, nanti kamu pinjam ya.',
      'Aku dan Acca sama-sama teman terdekat owner. Jarang pulang, tapi selalu pulang ke sini.',
      'Di kafe ini aku nggak pernah ditagih. Bukan soal gratisnya, tapi rasanya seperti punya rumah.',
    ],
  },
  {
    name: 'Novy',
    male: true,
    about: 'Pebisnis dan gamer, sudah berkeluarga. Ikut membangun kafe, sesekali membawa makanan.',
    favorite: [/lemon/i],
    hours: ANY,
    weight: 0.7,
    look: { skin: SKIN.fair, style: 'sidepart', size: 1.12, shirt: 0x6c7fa0 },
    stories: [
      'Lemon tea ya, Luna. Ini aku bawakan makanan buat anak-anak.',
      'Sekarang sudah berkeluarga, jadi jarang nongkrong. Tapi sesekali harus mampir.',
      'Bisnis jalan, main game juga jalan. Yang penting masih sempat ke sini.',
      'Waktu kafe ini dibangun aku ikut bantu. Lihat sekarang ramai begini, rasanya bangga.',
    ],
  },
  {
    name: 'Ifnul',
    male: true,
    about: 'Teman owner yang ikut mengawal kafe ini sejak masih rencana.',
    favorite: [/thai/i],
    hours: ANY,
    weight: 1.5,
    look: { skin: SKIN.fair, style: 'crop', size: 1.02, shirt: 0xf2d48c },
    stories: [
      'Thai tea satu, Luna.',
      'Kafe ini dulu cuma rencana. Aku ikut lihat prosesnya dari awal.',
      'Kalau anak-anak kumpul, aku biasanya yang paling tenang. Cukup thai tea dan obrolan.',
      'Tiap kali ke sini, aku lihat sudut-sudut yang dulu kami kerjakan bareng.',
    ],
  },
  {
    name: 'Giffari',
    male: true,
    about: 'Suka mendaki dan bercanda. Malam-malam duduk dekat Fajar sambil main game di HP.',
    favorite: [/aren/i],
    hours: NIGHT,
    weight: 3,
    look: { skin: SKIN.brown, style: 'sidepart', size: 1.08, shirt: 0x2f2f33 },
    stories: [
      'Kopi aren, Luna. Gratis ya? Hehe, bercanda!',
      'Fajar kerja, aku main game di HP. Itu formasi kami tiap malam.',
      'Kapan-kapan naik gunung lagi. Kamu ikut, Luna? Bawa kopi buat di atas.',
      'Aku memang suka minta kopi gratis. Tapi jujur, aku datang ke sini karena teman-temannya.',
    ],
  },
  {
    name: 'Aris',
    male: true,
    about:
      'Pelanggan pertama kafe. Pengunjung setia yang akhirnya jadi teman. Selalu ber-hoodie hitam.',
    favorite: [/kopi susu|kopsus/i],
    hours: NIGHT,
    weight: 3,
    look: { skin: SKIN.tan, style: 'curly', size: 0.96, shirt: 0x1f1f22 },
    stories: [
      'Kopi susu ya, Luna. Aku duduk di tempat biasa.',
      'Tahu nggak? Aku pelanggan pertama kafe ini. Dulu datang sendiri, iseng saja.',
      'Awalnya cuma pengunjung random. Lama-lama kenal semua orang di sini.',
      'Kafe ini bikin aku punya teman-teman baru. Aku nggak pernah menyangka.',
    ],
  },
  {
    name: 'Amal',
    male: true,
    about: 'Teman dekat owner. Kreatif tapi pendiam, bekerja malam di depan laptop.',
    favorite: [/kopi|coffee/i],
    hours: NIGHT,
    weight: 2.5,
    look: { skin: SKIN.fair, style: 'cap', glasses: true, accent: 0x3f3a3a, shirt: 0xe9e2d0 },
    stories: [
      '…Kopi satu. Makasih, Luna.',
      'Aku lagi bikin sesuatu. Kalau sudah jadi, kamu yang pertama lihat.',
      'Aku memang jarang bicara. Tapi di sini aku nyaman bekerja.',
      'Owner itu teman dekatku. Kadang ide terbaik datang dari obrolan pelan di malam hari.',
    ],
  },
  {
    name: 'Bayu',
    male: true,
    about: 'Owner Winds Space, sedang merantau di luar negeri. Kalau datang, satu kafe ditraktir.',
    favorite: [/cokelat|coklat|chocolate/i],
    hours: ANY,
    weight: 0.35,
    pays: 'treat',
    look: {
      skin: SKIN.light,
      style: 'bob',
      glasses: true,
      size: 1.12,
      shirt: 0xf3efe7,
      pants: 0x2f2f33,
    },
    stories: [
      'Luna! Es cokelat satu. Hari ini semua yang ada di kafe aku traktir!',
      'Aku sekarang merantau di luar negeri, jadi jarang pulang. Kangen tempat ini.',
      'Kafe ini kubangun bareng teman-teman. Fajar, Adit, Acca, Novy, Ifnul… semua ikut bantu.',
      'Pulau ini, kafe ini, dan kamu, Luna… ini cara kami menyimpan cerita. Terima kasih sudah menjaganya selama aku pergi.',
    ],
  },
];

export const regularNamed = (name: string) => REGULARS.find((r) => r.name === name);

/** Times Luna has served a regular before each story piece opens; friends from afar open faster. */
export const storySteps = (r: Regular) => (r.weight < 1 ? [1, 2, 3, 4] : [1, 3, 6, 10]);

/** How many story pieces are open after this many serves. */
export const storiesOpen = (r: Regular, served: number) =>
  storySteps(r).filter((n) => served >= n).length;

const inHours = (hours: [number, number][], hour: number) =>
  hours.some(([from, to]) => (hour >= from && hour < to) || (hour + 24 >= from && hour + 24 < to));

/**
 * Who walks in next: a regular whose hours these are, or a passing guest from `others`, weighted
 * so close friends who live away are rare. Names already in the café are left out.
 */
export function pickGuest(
  hour: number,
  others: { name: string; male: boolean }[],
  taken: string[],
  rand = Math.random,
) {
  const pool = [
    ...REGULARS.filter((r) => inHours(r.hours, hour)).map((r) => ({
      name: r.name,
      male: r.male,
      weight: r.weight,
    })),
    ...others.filter((o) => !regularNamed(o.name)).map((o) => ({ ...o, weight: 1 })),
  ].filter((g) => !taken.includes(g.name));
  if (!pool.length) return others[Math.floor(rand() * others.length)];
  let roll = rand() * pool.reduce((n, g) => n + g.weight, 0);
  for (const g of pool) if ((roll -= g.weight) < 0) return { name: g.name, male: g.male };
  return pool[pool.length - 1];
}

/** The menu item a regular asks for: their first favourite on the menu, if any. */
export function favoriteOn<T extends { name: string }>(r: Regular, menu: T[]) {
  for (const like of r.favorite) {
    const item = menu.find((m) => like.test(m.name));
    if (item) return item;
  }
  return undefined;
}

/**
 * Outings with the regulars: now and then a friend Luna knows invites her along, at a set game
 * hour, to where the friends really go: the sunset by the sea and a night at the camp on the
 * mountain. `place` is the rest spot Luna settles at; the friends sit around her.
 */
export type Outing = {
  id: 'sunset' | 'camp';
  /** Game hour the invitation comes. */
  hour: number;
  place: string;
  invite: (from: string) => string;
  /** What the friends say while they sit together. */
  lines: string[];
  /** Friends who like this outing most (asked first). */
  likes: string[];
  /** Note when it ends. */
  done: string;
};

export const OUTINGS: Outing[] = [
  {
    id: 'sunset',
    hour: 16,
    place: 'pier',
    invite: (from) => `${from}: Luna, sore ini kami mau lihat sunset di dermaga. Ikut?`,
    lines: [
      'Langitnya oranye banget sore ini.',
      'Dari ujung dermaga, kafe kelihatan kecil ya.',
      'Ombaknya tenang. Enak duduk lama-lama di sini.',
      'Nanti foto sunset-nya kirim ke grup ya!',
      'Kapan-kapan kita ke sini lagi, ramai-ramai.',
      'Angin lautnya enak. Capek kerja langsung hilang.',
    ],
    likes: ['Fina', 'Uli', 'Vira', 'Adit', 'Bayu'],
    done: 'Mataharinya sudah tenggelam. Sampai jumpa di kafe!',
  },
  {
    id: 'camp',
    hour: 18,
    place: 'campLog1',
    invite: (from) =>
      `${from}: Malam ini kami naik ke area perkemahan dekat puncak. Kamu ikut, Luna?`,
    lines: [
      'Api unggunnya hangat. Ada yang bawa kopi?',
      'Bintangnya jelas banget dari atas sini.',
      'Jalan setapaknya tadi lumayan bikin ngos-ngosan.',
      'Dari sini lampu-lampu kafe kelihatan kecil sekali.',
      'Besok pagi kita lihat matahari terbit dari puncak.',
      'Tenang ya di sini. Cuma ada angin dan suara api.',
    ],
    likes: ['Aan', 'Giffari', 'Fajar', 'Vira', 'Acca', 'Mamat'],
    done: 'Malam makin larut. Terima kasih sudah ikut berkemah, Luna.',
  },
];

/** Who comes along: up to four friends Luna knows, those who like the outing first. */
export function outingFriends(outing: Outing, known: string[], rand = Math.random) {
  const shuffled = [...known].sort(() => rand() - 0.5);
  return shuffled.sort((a, b) => +outing.likes.includes(b) - +outing.likes.includes(a)).slice(0, 4);
}
