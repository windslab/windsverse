# Rencana Kartu Member Winds Space

Disepakati bersama pemilik pada 1 November 2026. Tahap 1 dibangun di branch `luna-ps1`.

## Aturan

### Stamp

- **1 transaksi = 1 stamp**, bila ada minimal **1 minuman seharga ≥ Rp15.000** yang dibayar.
- Satu kartu punya **10 kotak stamp**. Setelah penuh, otomatis lanjut ke kartu berikutnya; kartu
  lama tersimpan di riwayat.
- **Stamp ke-5**: 1 minuman **non-kopi** gratis (bebas pilih). **Stamp ke-10**: 1 minuman **kopi**
  gratis (bebas pilih).
- Minuman gratis **hangus 6 bulan** setelah didapat bila tidak dipakai.
- Minuman gratis yang ditukar tidak memberi stamp maupun poin; yang dihitung hanya bagian transaksi
  yang dibayar dan memenuhi syarat.

### Poin

- Setiap menu punya **nilai poin**: bawaan 1 poin per Rp1.000 harga (Winds Coffee Rp18.000 = 18
  poin); admin bisa mengubah per menu. Semua menu yang dibayar mendapat poin (makanan juga).
- Poin dihitung dari harga **sesudah diskon** (diskon biasa memotong poin secara proporsional).
- Poin **dikumpulkan terus lintas kartu**.
- Semua poin **hangus** bila **12 bulan** tidak ada transaksi yang memenuhi syarat.

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
- Kategori minuman dan kategori kopi diatur di panel admin (bawaan: minuman = kopi, non kopi,
  mocktail; kopi = kopi).

## Tahapan

1. **Tahap 1**: data member, kartu digital + QR, stamp/poin/voucher otomatis dari kasir, tukar minuman
   gratis dan hadiah, form daftar + poster QR, panel admin (member, aturan, katalog hadiah).
2. **Tahap 2**: kirim tautan kartu lewat WhatsApp, promo ulang tahun, scan QR kartu dengan kamera di
   kasir.
3. **Tahap 3**: level member, Wallet, member sebagai tamu di Windstopia.
