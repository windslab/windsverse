// How to Winds Space: the built-in chapters (the staff handbook of 3 November 2026, brought up to
// date with the system). The admin adds rules and SOP of their own on top (kind `guides`). Never
// put a real recipe or its amounts here: the café's recipes stay secret.
import type { Block } from '@/lib/guide-text';

export type GuideGroup =
  | 'mulai'
  | 'operasional'
  | 'tim'
  | 'katalog'
  | 'pelanggan'
  | 'bantuan'
  | 'aturan';
export const GUIDE_GROUPS: { id: GuideGroup; title: string; lead: string }[] = [
  {
    id: 'mulai',
    title: 'Mulai di sini',
    lead: 'Gambaran sistem, cara masuk, dan alur satu shift.',
  },
  { id: 'aturan', title: 'Aturan & SOP kafe', lead: 'Ditulis dan diperbarui oleh admin.' },
  { id: 'operasional', title: 'Operasional', lead: 'Dipakai setiap shift.' },
  { id: 'tim', title: 'Tim dan keuangan', lead: 'Jadwal, kehadiran, biaya, dan gaji.' },
  { id: 'katalog', title: 'Katalog dan ruang tim', lead: 'Bahan, resep, dan perpustakaan.' },
  {
    id: 'pelanggan',
    title: 'Fitur untuk pelanggan',
    lead: 'Supaya kamu bisa menjelaskan dan membantu saat pelanggan bertanya.',
  },
  { id: 'bantuan', title: 'Bantuan', lead: 'Saat ada yang tidak berjalan semestinya.' },
];

export type Chapter = {
  id: string;
  group: GuideGroup;
  title: string;
  lead: string;
  /** Only shown to admins. */
  adminOnly?: boolean;
  blocks: Block[];
};

export const CHAPTERS: Chapter[] = [
  {
    id: 'sistem',
    group: 'mulai',
    title: 'Mengenal sistem kafe',
    lead: 'Sistem kafe adalah tempat tim mencatat pesanan, kehadiran, dan pekerjaan harian.',
    blocks: [
      {
        p: 'Buka di **windsverse.com/login**. Halaman utama windsverse.com adalah sisi pelanggan. Waktu di seluruh sistem memakai **WITA**.',
      },
      {
        table: {
          head: ['Menu', 'Fungsi'],
          rows: [
            ['Ringkasan', 'Halaman awal, cek in, dan gambaran hari ini'],
            ['Kasir POS', 'Mencatat pesanan dan pembayaran'],
            ['Pesanan', 'Memantau antrean dan mengubah status'],
            ['Denah meja', 'Melihat dan mengubah status meja'],
            ['Member', 'Kartu member, stamp, hadiah, dan ajak teman'],
            ['Kalender shift', 'Melihat jadwal kerja'],
            ['Absensi', 'Cek in, cek out, dan riwayat kehadiran'],
            ['Pengeluaran', 'Mencatat pembelian dan biaya'],
            ['Gaji & bonus', 'Melihat gaji sendiri'],
            ['Resep & HPP, Bahan baku', 'Modal bahan per menu (rahasia)'],
            ['Perpustakaan', 'Buku di rak kafe dan peminjaman'],
            ['How to Winds Space', 'Panduan ini, termasuk aturan dari admin'],
          ],
        },
      },
      {
        p: 'Data diperbarui otomatis setiap 3 detik selama halaman terbuka. Tulisan **Tersinkron** di kanan atas berarti koneksi baik. Ikon kalkulator di sebelahnya membuka kalkulator cepat.',
      },
    ],
  },
  {
    id: 'akun',
    group: 'mulai',
    title: 'Masuk dan akun',
    lead: 'Setiap karyawan punya ID dan PIN sendiri, supaya pesanan, kehadiran, dan gaji tercatat atas nama yang benar.',
    blocks: [
      {
        flow: [
          { title: 'Buka windsverse.com/login' },
          { title: 'Isi ID dan PIN', sub: 'dari admin' },
          { title: 'Tekan Masuk' },
        ],
      },
      {
        ul: [
          'Akun tetap masuk sampai 12 jam, jadi tidak perlu login berulang selama shift.',
          'Login dikunci sementara setelah 5 kali salah dalam 15 menit.',
          'Lupa ID atau PIN? Minta admin mengaturnya ulang.',
        ],
      },
      {
        warn: 'Semua tindakan tercatat atas nama pemilik akun. Keluar dari akun bila memakai perangkat bersama dengan rekan lain.',
        title: 'Jangan berbagi akun',
      },
    ],
  },
  {
    id: 'shift',
    group: 'mulai',
    title: 'Alur kerja satu shift',
    lead: 'Urutan yang biasanya dilakukan dari awal sampai akhir shift.',
    blocks: [
      {
        flow: [
          { title: 'Masuk & cek in', sub: 'di Ringkasan' },
          { title: 'Cek aturan baru', sub: 'di How to Winds Space' },
          { title: 'Catat pesanan', sub: 'Kasir POS' },
          { title: 'Ubah status', sub: 'sampai Selesai' },
          { title: 'Rapikan meja', sub: 'Denah meja' },
          { title: 'Catat pengeluaran', sub: 'bila ada belanja' },
          { title: 'Cek out', sub: 'semua pesanan selesai' },
        ],
      },
      {
        note: 'Sebelum cek out, pastikan tidak ada pesanan yang masih "Diterima", "Sedang dibuat", atau "Siap disajikan". Shift baru tertutup setelah semua pesanannya selesai.',
      },
    ],
  },
  {
    id: 'ringkasan',
    group: 'operasional',
    title: 'Ringkasan',
    lead: 'Halaman awal untuk memulai shift dan melihat apa yang sedang terjadi.',
    blocks: [
      {
        table: {
          head: ['Bagian', 'Fungsi'],
          rows: [
            ['Shift kamu hari ini', 'Jadwal, serta tombol Cek in dan Cek out'],
            ['Pesanan baru', 'Jalan pintas ke Kasir POS'],
            ['Antrean terbaru', 'Pesanan yang sedang berjalan'],
            ['Ruang aktivitas kafe', 'Gambaran bergerak yang mengikuti status pesanan'],
            ['Perlu perhatian', 'Bahan yang berada di bawah stok minimum'],
          ],
        },
      },
    ],
  },
  {
    id: 'pos',
    group: 'operasional',
    title: 'Kasir POS: mencatat pesanan',
    lead: 'Tempat mencatat pesanan dan pembayaran. Stok, status, member, dan laporan mengikuti catatan dari sini.',
    blocks: [
      { h: 'Pesanan sekarang' },
      {
        flow: [
          { title: 'Sudah cek in?', sub: 'wajib' },
          { title: 'Pilih menu', sub: 'cari atau kategori' },
          { title: 'Pilih member', sub: 'bila punya kartu' },
          { title: 'Nama & tipe', sub: 'bawa pulang / di tempat' },
          { title: 'Cek Diskon & pajak' },
          { title: 'Metode bayar', sub: 'tunai: isi uang diterima' },
          { title: 'Catat pembayaran & pesanan' },
        ],
      },
      {
        choice: 'Pelanggan sudah membayar?',
        options: [
          {
            label: 'Sudah',
            steps: [
              { title: 'Catat pembayaran & pesanan' },
              { title: 'Masuk antrean', sub: 'status Diterima' },
            ],
          },
          {
            label: 'Belum',
            steps: [
              { title: 'Simpan · menunggu pembayaran' },
              { title: 'Terima pembayaran', sub: 'nanti, di menu Pesanan' },
            ],
          },
        ],
      },
      {
        warn: 'QRIS, transfer, dan e-wallet hanya dicatat oleh sistem. Pastikan uangnya sudah masuk sebelum menekan tombol.',
        title: 'Periksa pembayaran dulu',
      },
      {
        p: 'Kolom angka (Diskon, jumlah, dan lainnya) bisa dikosongkan lalu diketik langsung, misalnya 5000.',
      },
    ],
  },
  {
    id: 'pos-lampau',
    group: 'operasional',
    title: 'Input pemasukan sekarang dan lampau',
    lead: 'Penjualan dari shift yang sudah lewat tetap bisa dicatat, supaya laporan dan gaji tepat.',
    blocks: [
      {
        choice: 'Kapan penjualannya terjadi?',
        options: [
          {
            label: 'Sekarang',
            steps: [
              { title: 'Biarkan shift berjalan', sub: 'otomatis terpilih' },
              { title: 'Catat seperti biasa' },
              { title: 'Masuk antrean', sub: 'diproses barista' },
            ],
          },
          {
            label: 'Shift yang sudah lewat',
            steps: [
              { title: 'Tanggal & shift transaksi', sub: 'pilih shift lampau' },
              { title: 'Cek peringatan tanggal' },
              { title: 'Pilih menu, lalu catat' },
              { title: 'Langsung lunas & selesai', sub: 'tidak masuk antrean' },
            ],
          },
        ],
      },
      {
        ul: [
          'Hanya shift yang menjadi jadwalmu yang muncul di pilihan.',
          'Pesanan untuk shift lampau harus langsung lunas, dan hadiah stamp tidak langsung dipakai di pesanan itu.',
          'Setelah mencatat, pesanan berikutnya otomatis kembali ke shift berjalan.',
          'Bulan yang gajinya sudah dibayar terkunci dan tidak bisa ditambah lagi.',
        ],
      },
      {
        warn: 'Salah tanggal atau salah isi? Jangan input ulang. Sampaikan nomor pesanan kepada admin untuk dikoreksi.',
      },
    ],
  },
  {
    id: 'pesanan',
    group: 'operasional',
    title: 'Pesanan',
    lead: 'Papan antrean untuk mengikuti pesanan dari dicatat sampai diterima tamu.',
    blocks: [
      {
        flow: [
          { title: 'Menunggu pembayaran', sub: 'tekan Terima pembayaran' },
          { title: 'Diterima', sub: 'tekan Mulai buat' },
          { title: 'Sedang dibuat', sub: 'tekan Siap disajikan' },
          { title: 'Siap disajikan', sub: 'tekan Selesai' },
          { title: 'Selesai' },
        ],
      },
      {
        ul: [
          'Ubah status tepat waktu, karena pelanggan bisa melihatnya di website.',
          'Pesanan dikelompokkan per tanggal lalu per shift. Hari ini terbuka; tekan tanggal lain untuk membukanya.',
          'Yang tampil 7 hari terakhir. Tekan **Tampilkan 7 hari sebelumnya** di bawah untuk riwayat yang lebih lama.',
          'Pilih filter status untuk melihat pesanan yang sudah selesai. Ikon printer mencetak struk.',
        ],
      },
      {
        p: 'Koreksi, pembatalan, dan penghapusan dilakukan admin. Sampaikan nomor pesanan dan alasannya.',
      },
    ],
  },
  {
    id: 'meja',
    group: 'operasional',
    title: 'Denah meja',
    lead: 'Menunjukkan meja mana yang kosong, terisi, atau perlu dibersihkan.',
    blocks: [
      {
        flow: [
          { title: 'Kosong' },
          { title: 'Terisi', sub: 'otomatis dari pesanan' },
          { title: 'Dibersihkan', sub: 'otomatis setelah selesai' },
          { title: 'Kosong', sub: 'ubah setelah dilap' },
        ],
      },
      {
        ul: [
          'Ubah status saat tamu pulang dan setelah meja selesai dibersihkan.',
          '**QR menu** menampilkan QR meja bila perlu dicetak ulang.',
          'Di kasir, nomor meja boleh dikosongkan bila tamu memilih tempat duduk sendiri.',
        ],
      },
    ],
  },
  {
    id: 'member-kasir',
    group: 'operasional',
    title: 'Member di kasir',
    lead: 'Program kartu stamp dan hadiah untuk pelanggan tetap.',
    blocks: [
      {
        table: {
          head: ['Yang ingin dilakukan', 'Caranya'],
          rows: [
            [
              'Mencari member',
              'Scan QR kartu, atau ketik kode WSM, nomor HP, atau nama di **Member (opsional)**',
            ],
            [
              'Mendaftarkan pelanggan',
              '**Daftar member baru**: nama, nomor HP, kode ajak teman bila ada, tanggal lahir bila mau',
            ],
            ['Menyerahkan hadiah', 'Tekan **Serahkan** saat hadiah diberikan'],
            ['Mengirim tautan kartu', '**Kirim via WhatsApp**'],
          ],
        },
      },
      { h: 'Hadiah stamp terisi sendiri di Diskon' },
      {
        flow: [
          { title: 'Masukkan menu', sub: 'ke keranjang' },
          { title: 'Scan / ketik kode kartu', sub: 'kode lengkap WSM-XXXX' },
          { title: 'Hadiah dipilih sistem', sub: 'yang paling cepat hangus' },
          { title: 'Diskon terisi', sub: '5.000 atau harga minuman' },
          { title: 'Catat pesanan' },
        ],
      },
      {
        ul: [
          'Stamp ke-5: potongan Rp5.000. Stamp ke-10: minuman gratis sampai Rp20.000 (minuman termahal di keranjang).',
          'Hadiah dipakai **langsung** di pesanan yang memberi stamp ke-5 atau ke-10, tertulis "Stamp ke-5 dari pesanan ini".',
          'Ingin memakai hadiah lain? Tekan **batal pakai**, hadiah berikutnya masuk sendiri.',
          'Mengetik angka di Diskon menambah diskon kasir di atas hadiah.',
        ],
      },
      {
        warn: 'Pilih member sebelum mencatat pesanan. Stamp dan poin hanya mengikuti pesanan yang terhubung ke member. Memilih dari nama atau nomor HP saja tidak bisa memakai hadiah: kode kartu harus lengkap.',
        title: 'Penting',
      },
    ],
  },
  {
    id: 'kalender',
    group: 'tim',
    title: 'Kalender shift',
    lead: 'Menampilkan siapa bekerja pada shift apa dan kapan.',
    blocks: [
      {
        ul: [
          'Buka **Kalender shift** dan cari namamu di tanggal yang ingin dilihat.',
          'Shift yang mulai sebelum pukul 14.00 dihitung shift pagi, setelahnya shift malam.',
          '**Full day** berarti kamu terjadwal di semua shift tanggal itu.',
          'Jadwal diatur admin. Ingin bertukar shift? Sampaikan kepada admin.',
        ],
      },
    ],
  },
  {
    id: 'absensi',
    group: 'tim',
    title: 'Absensi',
    lead: 'Mencatat kehadiran per shift. Gaji shift mengikuti catatan ini.',
    blocks: [
      {
        flow: [
          { title: 'Cek in', sub: 'kapan saja di hari kerja' },
          { title: 'Masuk ke shift-mu', sub: 'otomatis' },
          { title: 'Bekerja' },
          { title: 'Cek out' },
          { title: 'Shift tertutup', sub: 'semua cek out + pesanan selesai' },
        ],
      },
      {
        choice: 'Ada yang tidak biasa?',
        options: [
          {
            label: 'Lupa cek out',
            steps: [{ title: 'Keluar otomatis', sub: 'pukul 00.00 WITA' }],
          },
          {
            label: 'Menggantikan rekan',
            steps: [
              { title: 'Cek in sebagai pengganti', sub: 'pilih shift hari itu' },
              { title: 'Namamu masuk ke shift' },
            ],
          },
          {
            label: 'Kehadiran salah',
            steps: [{ title: 'Minta admin mengoreksi' }],
          },
        ],
      },
      {
        note: 'Hari usaha berganti pukul 05.00 WITA, jadi shift malam yang lewat tengah malam tetap dihitung pada tanggal mulainya.',
      },
    ],
  },
  {
    id: 'pengeluaran',
    group: 'tim',
    title: 'Pengeluaran',
    lead: 'Mencatat uang yang keluar untuk pembelian dan biaya operasional kafe.',
    blocks: [
      {
        flow: [
          { title: 'Tambah pengeluaran' },
          { title: 'Isi nama & nilai' },
          { title: 'Pilih kategori & tanggal', sub: 'ini yang menentukan hitungannya' },
          { title: 'Simpan' },
        ],
      },
      {
        choice: 'Kategori apa?',
        options: [
          {
            label: 'Operasional, Lainnya',
            steps: [
              { title: 'Biaya harian' },
              { title: 'Dibagi rata ke shift hari itu', sub: 'mengurangi laba shift' },
            ],
          },
          {
            label: 'Sewa, Utilitas',
            steps: [
              { title: 'Biaya bulanan' },
              { title: 'Mengurangi laba bulanan', sub: 'untuk bonus, bukan laba shift' },
            ],
          },
          {
            label: 'Bahan baku',
            steps: [{ title: 'Tidak mengurangi laba lagi', sub: 'modal sudah lewat HPP' }],
          },
        ],
      },
      {
        p: 'Contoh: biaya harian Rp40.000 dengan shift pagi dan malam berarti tiap shift menanggung Rp20.000. Bila hari itu hanya ada satu shift, shift itu menanggung semuanya. Bila tidak ada shift sama sekali, biayanya masuk ke perhitungan bulanan.',
      },
      {
        p: 'Mengubah catatan perlu alasan perubahan. Menghapus hanya bisa dilakukan admin. Catatan dari periode yang gajinya sudah dibayar tidak bisa diubah.',
      },
    ],
  },
  {
    id: 'gaji',
    group: 'tim',
    title: 'Gaji dan bonus',
    lead: 'Tempat melihat gaji milikmu sendiri. Rincian gaji rekan lain tidak ditampilkan.',
    blocks: [
      {
        flow: [
          { title: 'Omzet shift', sub: 'penjualan setelah diskon' },
          { title: '− HPP', sub: 'modal bahan' },
          { title: '− biaya harian', sub: 'bagian shift' },
          { title: '= Laba shift' },
          { title: 'Tingkat gaji', sub: 'dari besar laba' },
          { title: 'Gaji tiap staf hadir', sub: 'nominal penuh' },
        ],
      },
      {
        ul: [
          'Gaji sementara bulan berjalan terlihat dari shift yang sudah selesai.',
          'Bonus bulanan dibagi dari laba bulan itu setelah gaji dan biaya bulanan, sesuai jumlah shift yang kamu hadiri.',
          'Admin menghitung periode bulanan dan mencatat pembayarannya. Uangnya dibayarkan terpisah oleh admin.',
          'Cek in, cek out, dan pesanan yang tercatat rapi membuat gajimu tepat.',
        ],
      },
    ],
  },
  {
    id: 'laporan',
    group: 'tim',
    title: 'Laporan keuangan (admin)',
    lead: 'Hanya admin. Omzet, HPP, pengeluaran, gaji, bonus, dan laba per tanggal dan shift.',
    adminOnly: true,
    blocks: [
      {
        flow: [
          { title: 'Omzet' },
          { title: '− HPP' },
          { title: '= Laba' },
          { title: '− biaya, gaji, bonus' },
          { title: '= Laba bersih' },
        ],
      },
      {
        p: 'Pilih rentang tanggal di atas. Setiap tanggal tampil sebagai tabel per shift. Lengkapi HPP pesanan yang belum lengkap sebelum menghitung gaji.',
      },
    ],
  },
  {
    id: 'bahan',
    group: 'katalog',
    title: 'Bahan baku',
    lead: 'Daftar bahan beserta harga dan isi kemasannya. Data ini menjadi dasar perhitungan HPP.',
    blocks: [
      {
        table: {
          head: ['Kolom', 'Cara mengisi'],
          rows: [
            ['Nama bahan', 'Nama yang mudah dikenali'],
            ['Satuan pemakaian resep', 'Satuan saat dipakai, misalnya ml, gram, atau pcs'],
            ['Isi per kemasan', 'Isi satu kemasan dalam satuan pemakaian'],
            ['Harga beli per kemasan', 'Harga satu kemasan, bukan harga per ml atau per pcs'],
            ['Lacak persediaan', 'Opsional. Bila aktif, stok dipotong otomatis dari pesanan'],
            ['Stok minimum', 'Batas agar bahan muncul di Perlu perhatian'],
          ],
        },
      },
      {
        flow: [
          { title: 'Harga per kemasan' },
          { title: '÷ isi per kemasan' },
          { title: '= biaya per satuan' },
        ],
      },
      {
        p: 'Contoh angka karangan: kemasan Rp10.000 berisi 500 gram menghasilkan biaya Rp20 per gram. Mengubah bahan perlu alasan perubahan, dan harga baru hanya berlaku untuk transaksi berikutnya.',
      },
    ],
  },
  {
    id: 'resep',
    group: 'katalog',
    title: 'Resep dan HPP',
    lead: 'Mencatat bahan yang dipakai tiap menu, supaya sistem bisa menghitung modal per porsi.',
    blocks: [
      {
        flow: [
          { title: 'Bahan sudah ada', sub: 'di Bahan baku' },
          { title: 'Tambah resep' },
          { title: 'Pilih menu' },
          { title: 'Isi komposisi', sub: 'untuk satu porsi' },
          { title: 'Simpan' },
        ],
      },
      {
        table: {
          head: ['Yang dihitung', 'Rumus'],
          rows: [
            ['Biaya satu bahan', 'Jumlah pemakaian × biaya per satuan'],
            ['HPP per porsi', 'Jumlah biaya semua bahan'],
            ['Margin', 'Harga jual − HPP per porsi'],
          ],
        },
      },
      {
        ul: [
          'HPP tersimpan pada pesanan saat dibuat, jadi perubahan resep tidak mengubah pesanan lama.',
          'Menu tanpa resep tetap bisa dijual, dengan tanda **HPP belum diisi**. Laporkan kepada admin bila menemukannya.',
        ],
      },
      {
        warn: 'Jangan memotret, menyalin, atau membagikan isi Resep & HPP kepada siapa pun di luar tim.',
        title: 'Resep bersifat rahasia',
      },
    ],
  },
  {
    id: 'perpustakaan',
    group: 'katalog',
    title: 'Perpustakaan',
    lead: 'Mengelola buku di rak kafe dan siapa yang meminjamnya. Katalognya tampil di Library untuk pelanggan.',
    blocks: [
      {
        flow: [
          { title: 'Cari buku', sub: 'di Katalog' },
          { title: 'Pinjamkan', sub: 'nama & tanggal kembali' },
          { title: 'Pantau di Peminjaman' },
          { title: 'Kembalikan', sub: 'saat buku diterima' },
        ],
      },
      {
        ul: [
          '**Katalog:** judul, penulis, kategori, lokasi rak, jumlah eksemplar, sinopsis, dan sampul.',
          'Buku yang belum kembali terlihat di daftar Peminjaman.',
        ],
      },
    ],
  },
  {
    id: 'kafe-3d',
    group: 'pelanggan',
    title: 'Kafe 3D',
    lead: 'Kafe versi 3D di halaman utama, yang mengikuti kesibukan dan waktu kafe.',
    blocks: [
      {
        ul: [
          'Seret untuk memutar, dan cubit untuk memperbesar.',
          '**Aktifkan suara** menyalakan suasana kafe.',
          'Tombol **Live** mengganti tampilan siang dan malam.',
          'Di bawahnya ada tombol ke semua fitur lain.',
        ],
      },
    ],
  },
  {
    id: 'menu-lacak',
    group: 'pelanggan',
    title: 'Menu dan lacak pesanan',
    lead: 'Pelanggan bisa melihat menu, status pesanannya, dan memberi ulasan dari HP.',
    blocks: [
      {
        ul: [
          '**Menu:** daftar menu dan harga per kategori. Hanya untuk dilihat; pemesanan tetap di kasir.',
          '**Lacak:** ketik nama pemesan atau nomor pada struk. Pencarian nama berlaku untuk pesanan lunas hari ini.',
          '**Ulasan:** tab Ulasan di halaman menu dan tombol di halaman depan membawa pelanggan ke Google Maps untuk menulis ulasan. Ajak pelanggan yang senang untuk memberi ulasan.',
        ],
      },
    ],
  },
  {
    id: 'kartu-member',
    group: 'pelanggan',
    title: 'Kartu member pelanggan',
    lead: 'Kartu digital berisi stamp, poin, hadiah stamp, ajak teman, dan katalog hadiah.',
    blocks: [
      {
        choice: 'Bagaimana pelanggan mendapat kartu?',
        options: [
          {
            label: 'Di kasir',
            steps: [{ title: 'Daftar member baru' }, { title: 'Langsung aktif' }],
          },
          {
            label: 'Lewat QR / link',
            steps: [
              { title: 'Isi form daftar' },
              { title: 'Aktif setelah transaksi pertama', sub: 'yang memenuhi syarat' },
            ],
          },
        ],
      },
      { h: 'Stamp dan hadiahnya' },
      {
        flow: [
          { title: 'Transaksi ≥ Rp15.000', sub: 'minuman atau makanan' },
          { title: '+1 stamp', sub: 'maksimal 1 per hari' },
          { title: 'Stamp ke-5', sub: 'langsung potongan Rp5.000' },
          { title: 'Stamp ke-10', sub: 'langsung minuman gratis s/d Rp20.000' },
          { title: 'Kartu baru', sub: 'mulai lagi dari 0' },
        ],
      },
      {
        table: {
          head: ['Hal', 'Aturan'],
          rows: [
            [
              'Stamp',
              '1 per hari, dari transaksi dengan minimal 1 minuman atau makanan ≥ Rp15.000 yang dibayar. Transaksi berikutnya di hari yang sama hanya mendapat poin.',
            ],
            [
              'Hadiah stamp',
              'Dipakai langsung di pesanan yang memberi stamp ke-5 / ke-10. Syarat stamp dicek dari harga menu sebelum hadiah, jadi satu minuman yang digratiskan tetap memberi stamp ke-10. Hadiah yang belum terpakai berlaku 6 bulan.',
            ],
            [
              'Poin',
              'Sesuai menu yang dibeli setelah diskon, ditambah poin dari game Windstopia. Hangus bila 12 bulan tanpa transaksi yang memenuhi syarat.',
            ],
            [
              'Hadiah tahunan',
              'Koleksi tahunan dengan syarat poin dan kartu penuh. Tiap hadiah sekali per tahun.',
            ],
          ],
        },
      },
      { h: 'Ajak teman' },
      {
        flow: [
          { title: 'Member kirim link ajak', sub: 'kode AJAK-XXXX' },
          { title: 'Teman daftar', sub: 'nomor HP baru' },
          { title: 'Transaksi pertama teman', sub: 'dibayar & dapat stamp' },
          { title: 'Keduanya +1 stamp' },
          { title: 'Tiap 3 teman', sub: 'pengajak: 1 minuman gratis' },
        ],
      },
      {
        ul: [
          'Kode ajak berbeda dari kode kartu. Kode kartu (WSM-…) tidak boleh disebar karena dipakai untuk menukar hadiah.',
          'Bonus pengajak paling banyak 5 teman per bulan. Teman berikutnya tetap dihitung untuk gelar.',
          'Gelar di kartu: **Wind Caller** (3 teman), **Storm Bringer** (10), **Legend of Windstopia** (25).',
          'Bila transaksi pertama teman dibatalkan, bonusnya ditarik kembali.',
        ],
      },
      { h: 'Saat pelanggan mengklaim hadiah tahunan' },
      {
        flow: [
          { title: 'Pelanggan tekan Klaim hadiah', sub: 'di kartunya' },
          { title: 'Tunjukkan ke kasir' },
          { title: 'Cari member, scan kode' },
          { title: 'Berikan hadiah' },
          { title: 'Tekan Serahkan' },
        ],
      },
    ],
  },
  {
    id: 'library',
    group: 'pelanggan',
    title: 'Library dan Memoirs',
    lead: 'Buku di rak kafe dan album foto kenangan.',
    blocks: [
      {
        ul: [
          '**Library** menampilkan buku di rak kafe. Pelanggan bisa mencari judul dan melihat lokasi raknya, lalu meminjam lewat kasir.',
          '**Memoirs** menampilkan foto pilihan dari kamera Story of Winds, seperti album kenangan kafe.',
        ],
      },
    ],
  },
  {
    id: 'story',
    group: 'pelanggan',
    title: 'Story of Winds',
    lead: 'Kamera film digital untuk pelanggan, dengan warna vintage dan jatah jepretan harian.',
    blocks: [
      {
        ul: [
          'Pelanggan harus menyetujui aturan dan mengizinkan akses kamera di browser.',
          'Knob **FILM** mengganti film, dan tombol rana memotret.',
          'Foto tersimpan 30 hari, jadi sebaiknya diunduh.',
          'Foto pilihan admin bisa tampil di Memoirs.',
        ],
      },
    ],
  },
  {
    id: 'noisegasm',
    group: 'pelanggan',
    title: 'Noisegasm',
    lead: 'Gramofon musik kafe, dengan pemutar kecil di pojok halaman.',
    blocks: [
      {
        p: 'Tersedia tombol putar, jeda, ganti lagu, putar acak, dan volume. Pemutarnya bisa disembunyikan dan musik tetap berjalan. Di iPhone, bila musik belum berbunyi, ketuk video kecilnya sekali.',
      },
    ],
  },
  {
    id: 'windstronout',
    group: 'pelanggan',
    title: 'Windstronout',
    lead: 'Simulasi teropong bintang dari lokasi kafe di Pangkep.',
    blocks: [
      {
        p: 'Pelanggan bisa mengarahkan teropong, melacak Bulan, mencari objek langit, mengatur waktu, dan memotret tampilan lensanya. Objek yang sedang di bawah horizon tidak terlihat, seperti langit sungguhan.',
      },
    ],
  },
  {
    id: 'windstopia',
    group: 'pelanggan',
    title: 'Windstopia',
    lead: 'Game di website, tempat pemain mengendalikan Luna, menjelajah pulau, dan menjadi barista di kafe.',
    blocks: [
      {
        table: {
          head: ['Aksi', 'Komputer', 'HP'],
          rows: [
            ['Jalan', 'W A S D atau panah', 'Geser jari sedikit di area joystick'],
            ['Lari', 'Tahan Shift', 'Geser joystick lebih jauh'],
            ['Lompat', 'Spasi', 'Ketuk layar dua kali'],
            ['Aksi terdekat', 'E', 'Ketuk tombol yang muncul'],
          ],
        },
      },
      { h: 'Poin game ke kartu member' },
      {
        flow: [
          { title: 'Main di Windstopia', sub: 'tiap aktivitas 1 poin sehari' },
          { title: 'Poin di dompet game', sub: 'milik perangkat pemain' },
          { title: 'Redeem dengan kode kartu' },
          { title: 'Masuk ke poin member', sub: 'maks 3 poin sehari per kartu' },
        ],
      },
      {
        ul: [
          'Aktivitas yang memberi poin: membuka kafe di game, foto dari kamera Luna yang tampil di Memoirs, dan bermain satu hari game penuh.',
          'Poin game menambah poin member, tapi tidak memberi stamp.',
          'Tekan **buka kafe** di sebelah jam agar tamu di game mulai datang.',
        ],
      },
      {
        note: 'Takaran di game dibuat khusus untuk permainan dan bukan resep kafe.',
        title: 'Takaran di game bukan resep kafe',
      },
    ],
  },
  {
    id: 'masalah',
    group: 'bantuan',
    title: 'Masalah yang sering terjadi',
    lead: 'Coba dulu langkah ini sebelum menghubungi admin.',
    blocks: [
      {
        table: {
          head: ['Masalah', 'Yang perlu dicoba'],
          rows: [
            [
              'Tidak bisa login',
              'Periksa ID dan PIN. Bila terkunci, tunggu 15 menit atau hubungi admin.',
            ],
            ['Tampilan terasa lama', 'Muat ulang halaman sekali. Pastikan internet stabil.'],
            [
              'Shift tidak muncul di kasir',
              'Periksa Kalender shift, lalu minta admin memastikan namamu ada di jadwal.',
            ],
            [
              'Stamp tidak bertambah',
              'Pastikan member dipilih sebelum pesanan dicatat, pesanan lunas, harganya memenuhi syarat, dan hari itu belum dapat stamp.',
            ],
            ['Diskon hadiah tidak terisi', 'Scan QR atau ketik kode kartu lengkap (WSM-XXXX).'],
            [
              'Pesanan salah tanggal atau isi',
              'Jangan input ulang. Sampaikan nomor pesanan kepada admin.',
            ],
            [
              'Struk tidak tercetak',
              'Struk dicetak lewat dialog printer browser. Pastikan printer terpasang dan menyala.',
            ],
            [
              'Tidak bisa mengubah data bulan lalu',
              'Gaji bulan itu sudah dibayar, sehingga datanya terkunci.',
            ],
            ['Pelanggan kehilangan tautan kartu', 'Cari membernya, lalu tekan Kirim via WhatsApp.'],
            [
              'Kamera pelanggan tidak menyala',
              'Izinkan akses kamera untuk windsverse.com di pengaturan browser.',
            ],
          ],
        },
      },
    ],
  },
  {
    id: 'admin',
    group: 'bantuan',
    title: 'Yang perlu bantuan admin',
    lead: 'Hal-hal ini hanya bisa dilakukan admin. Sampaikan detailnya supaya cepat ditangani.',
    blocks: [
      {
        table: {
          head: ['Kebutuhan', 'Sampaikan'],
          rows: [
            ['Koreksi, pembatalan, atau penghapusan pesanan', 'Nomor pesanan dan alasannya'],
            ['Reset PIN atau akses', 'Nama dan ID'],
            ['Perubahan jadwal', 'Tanggal, shift, dan nama'],
            ['Koreksi absensi', 'Tanggal, shift, dan yang benar'],
            ['Perubahan menu dan harga', 'Nama menu dan perubahannya'],
            ['Penghapusan pengeluaran', 'Tanggal, nominal, dan alasannya'],
            ['Perubahan aturan atau hadiah member', 'Yang ingin diubah'],
            ['Tautan kartu member tersebar', 'Nama atau kode member'],
          ],
        },
      },
    ],
  },
  {
    id: 'kamus',
    group: 'bantuan',
    title: 'Kamus istilah',
    lead: 'Arti kata-kata yang sering muncul.',
    blocks: [
      {
        table: {
          head: ['Istilah', 'Arti'],
          rows: [
            ['HPP', 'Harga pokok penjualan, yaitu modal bahan untuk satu porsi.'],
            ['Margin', 'Harga jual dikurangi HPP.'],
            ['Omzet', 'Total penjualan setelah diskon, tanpa pajak.'],
            ['Laba shift', 'Omzet dikurangi HPP dan bagian shift dari pengeluaran harian.'],
            ['Shift', 'Satu giliran kerja, misalnya pagi atau malam.'],
            ['Hari usaha', 'Tanggal kerja kafe, yang berganti pukul 05.00 WITA.'],
            ['Stamp', 'Tanda di kartu member untuk tiap hari bertransaksi yang memenuhi syarat.'],
            ['Kartu penuh', 'Kartu member yang sudah berisi 10 stamp.'],
            ['WSM-XXXX', 'Kode kartu member (4 huruf/angka acak). Rahasia pemilik kartu.'],
            ['AJAK-XXXX', 'Kode ajak teman milik member. Boleh disebar.'],
            ['WS-20261102-…', 'Format nomor pesanan. Angkanya tanggal transaksi.'],
            ['WITA', 'Waktu Indonesia Tengah, zona waktu seluruh sistem.'],
          ],
        },
      },
    ],
  },
];
