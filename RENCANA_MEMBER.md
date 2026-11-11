# Rencana Kartu Member Winds Space

Disepakati bersama pemilik pada 1 November 2026. Tahap 1 dibangun di branch `luna-ps1`.

## Aturan

### Stamp

- **1 stamp per hari kerja kafe** (sampai 05.00 WITA), dari transaksi pertama yang memiliki minimal **1 minuman seharga ≥ Rp15.000** atau **1 makanan seharga ≥ Rp15.000** yang dibayar (kategori makanan dan harga minimalnya diatur di Member → Aturan). Transaksi berikutnya di hari yang sama hanya mendapat poin. Bila transaksi pertama dibatalkan, stamp hari itu pindah ke transaksi berikutnya. Aturan ini disepakati 3 November 2026 untuk menutup celah memecah transaksi.
- Satu kartu punya **10 kotak stamp**. Setelah penuh, otomatis lanjut ke kartu berikutnya; kartu
  lama tersimpan di riwayat.
- **Stamp ke-5**: **potongan Rp5.000** untuk satu transaksi. Transaksi itu tetap mendapat stamp, dan
  poinnya dihitung setelah potongan.
- **Stamp ke-10**: 1 **minuman gratis sampai Rp20.000** (kopi atau non-kopi). Bila lebih mahal,
  pelanggan membayar selisihnya.
- Kedua nilai itu diatur di Member → Aturan. Hadiah stamp **hangus 6 bulan** setelah didapat bila
  tidak dipakai.
- Minuman gratis yang ditukar tidak memberi stamp maupun poin; yang dihitung hanya bagian transaksi
  yang dibayar dan memenuhi syarat.

### Poin

- Setiap menu punya **nilai poin**: bawaan 1 poin per Rp1.000 harga (Winds Coffee Rp18.000 = 18
  poin); admin bisa mengubah per menu. Semua menu yang dibayar mendapat poin (makanan juga).
- Poin dihitung dari harga **sesudah diskon** (diskon biasa memotong poin secara proporsional).
- Poin **dikumpulkan terus lintas kartu**.
- Semua poin **hangus** bila **12 bulan** tidak ada transaksi yang memenuhi syarat.
- **Poin Windstopia** (diputuskan ulang 11 Nov 2026, lebih sederhana): hanya tiga hal yang memberi
  poin ke saldo poin game pemain (disimpan di server, terikat ke perangkatnya), masing-masing
  **1 poin per hari** (hari kafe, ganti jam 05.00 WITA), jadi paling banyak **3 poin per hari**:
  - **Buka kafe** di Windstopia.
  - **Foto masuk Memoirs**: memotret dengan kamera Luna, lalu menekan OK pada foto itu di kamera.
    Foto tersimpan ke HP dan otomatis tampil di Memoirs; foto ke-2 dan seterusnya di hari yang sama
    tidak menambah poin. Video tidak memberi poin.
  - **Main satu hari penuh di Windstopia**: satu hari game = 24 menit nyata sejak game dibuka.
  Melayani pelanggan, menyapu, menyiram, mengelap meja, misi harian dan tukar rupiah tidak lagi
  memberi poin.
- Pemain memindahkan saldonya lewat tombol **poin**: form kode kartu langsung tampil, jadi cukup
  memasukkan kode kartu (misalnya WSM-0001); kartu tidak perlu tersimpan di HP atau browser itu.
  Sebelum dipindahkan, nama pemilik kartu tampil disamarkan (misalnya R\*\*\* S.) supaya salah
  ketik ketahuan. Satu kartu menerima paling banyak **3 poin game per hari**; sisanya tetap di
  saldo game dan bisa dipindahkan besok.
- Poin game di kartu bisa ditukar hadiah seperti poin belanja, tetapi hadiah tetap butuh kartu
  stamp penuh, dan poin game tidak memperpanjang masa hangus.

### Hadiah tahunan

- Setiap tahun ada koleksi hadiah dengan desain baru (contoh 2027): stiker 150 poin / 1 kartu,
  pembatas buku 200 / 1, pin 300 / 2, gantungan kunci 400 / 2, mug 900 / 3, tumbler 1.200 / 4,
  **T-shirt WINDS LAB 2.500 / 5**. Untuk tahap awal yang aktif cukup T-shirt; semua angka diatur di
  panel admin, beserta stok.
- Syarat tukar: poin cukup **dan** jumlah kartu penuh cukup. Kartu dihitung **sejak penukaran
  terakhir hadiah jenis yang sama** (T-shirt tahun berikutnya butuh 5 kartu baru lagi).
- Setiap hadiah **maksimal 1 kali per tahun** per member (boleh mengoleksi yang berbeda).
- Saat ditukar, poin **dikurangi** sejumlah nilai hadiah.
- 1 Januari koleksi baru dimulai; poin dan kartu tidak direset.

### Pendaftaran dan data

- Gratis. Daftar **di kasir** (langsung aktif) atau **form sendiri** dari QR ke
  `windsverse.com/member/daftar` (status menunggu; aktif di transaksi pertama yang memenuhi syarat,
  saat kasir memilih member itu).
- Data: nama, nomor HP (unik), tanggal lahir opsional. Kode member `WS-0001` dan tautan kartu rahasia.
- Kartu digital saja (tanpa kartu fisik): `windsverse.com/member/<token>` dengan 10 kotak stamp, poin,
  progres hadiah, minuman gratis yang bisa dipakai, QR, dan riwayat.

## Cara kerja di sistem

- Data baru: `members`, `memberRewards` (katalog hadiah per tahun), `memberClaims` (penukaran
  hadiah). Pesanan menyimpan `memberId` dan, bila menukar minuman gratis, `memberFree` (voucher yang
  dipakai dan nilai potongannya, yang masuk ke kolom diskon).
- Stamp, poin, voucher minuman gratis, dan kartu **dihitung dari pesanan** (lunas, tidak dibatalkan),
  jadi pembatalan atau koreksi pesanan otomatis ikut menyesuaikan. Semua perubahan tercatat di audit.
- Kategori minuman dan makanan diatur di panel admin.
- **Kartu digital 3D** seukuran kartu ATM (85,6 × 54 mm, landscape). Depan: desain + nama, kode,
  nomor kartu. Belakang: desain + 10 stamp (digambar otomatis, beranimasi stempel). Desain depan dan
  belakang diunggah admin di Member → Tampilan kartu (template dengan area aman bisa diunduh di
  sana, ukuran 2048 × 1291 px).
- **Katalog hadiah eksklusif** di bawah kartu, digeser kiri-kanan. Hadiah terkunci (abu-abu + gembok)
  sampai poin dan kartu penuh cukup; lalu terbuka dan bisa **diklaim pelanggan sendiri** di kartunya.
  Klaim langsung memakai poin dan berstatus "menunggu diserahkan" sampai staf menekan **Serahkan**
  (di Kasir POS atau menu Member); staf bisa membatalkan klaim yang belum diserahkan (poin kembali).
- Tiap hadiah punya gambar mockup (persegi 1:1) dan boleh punya model 3D `.glb` (maks 20 MB) yang
  bisa diputar di katalog.
- Kartu juga bisa dibuka dari halaman 3D (tombol **Kartu Member**) dan dari Windstopia (tombol
  **kartu**): kartu yang terakhir dibuka di perangkat itu.

## Tahapan

1. **Tahap 1**: data member, kartu digital + QR, stamp/poin/voucher otomatis dari kasir, tukar minuman
   gratis dan hadiah, form daftar + poster QR, panel admin (member, aturan, katalog hadiah).
2. **Tahap 2**: kirim tautan kartu lewat WhatsApp, promo ulang tahun, scan QR kartu dengan kamera di
   kasir.
3. **Tahap 3**: level member, Wallet, member sebagai tamu di Windstopia.
