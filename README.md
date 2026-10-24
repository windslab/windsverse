# Winds Space — Operasional Kafe v1

Aplikasi operasional kafe berbahasa Indonesia, dibangun ulang dari referensi dengan penyimpanan server, pemeriksaan hak akses, roster mingguan, dan penggajian berdasarkan laba shift. Ini versi awal yang dapat dijalankan dan ditinjau, belum merupakan hasil audit keamanan independen atau sertifikasi kepatuhan perusahaan.

## Pembaruan aturan operasional — 18 Oktober 2026

- Waktu operasional sekarang **WITA / Asia/Makassar (Pangkep)**. Timestamp kejadian dan tanggal usaha lama dipertahankan, tanpa pergeseran massal. Roster lama tampil dalam WITA; tinjau jadwal mendatang yang sebelumnya dimasukkan dengan label WIB. Membuat/mengubah roster memakai WITA dan menyimpan `scheduleTimezone`.
- Pelacakan stok **opsional per bahan**, nonaktif untuk bahan baru dan data lama yang tidak mempunyai flag `trackStock: true`. Form stok/minimum disembunyikan bila nonaktif. HPP tetap dihitung dari harga dan isi kemasan. Hanya bahan dengan pelacakan aktif yang dibatasi stok dan dipotong; pengembalian transaksi memakai snapshot potongan lamanya.
- Koreksi shift selesai memakai `snapshot.tiers`, termasuk ketika tier terbaru sudah berubah. Snapshot tanpa tier historis ditolak untuk koreksi, agar tidak diam-diam memakai aturan baru.
- Pengeluaran dapat dialokasikan ke shift selesai sebelum periode dibayar. Biaya umum dan pembelian bahan tetap mengikuti perlakuan laba/arus kas yang sudah ada.
- Kasir dan check-out tetap berjalan saat resep belum lengkap, dengan HPP sementara Rp0. **Penghitungan dan pembayaran payroll ditolak** bila masih ada transaksi lunas, tidak dibatalkan, dengan HPP belum lengkap.
- Admin membuka **Pesanan → filter HPP belum lengkap → Lengkapi HPP**, memeriksa modal per porsi, menulis alasan dan mengonfirmasi. Saran dari resep terkini tidak otomatis dianggap biaya historis. Koreksi tidak mengubah pembayaran pelanggan atau memotong stok ulang, memperbarui laba/gaji historis, mencatat nilai sebelum/sesudah, dan membatalkan payroll belum dibayar yang terdampak.
- Pembayaran payroll divalidasi ulang terhadap HPP, absensi, tier historis, biaya dan bonus tersimpan. Jadwal terencana atau shift berjalan yang masih tersisa pada periode tersebut harus diselesaikan/dihapus sebelum periode dikunci melalui pembayaran. Nominal yang tidak cocok ditolak dan perlu dihitung ulang. Mengubah persentase bonus tidak menghapus payroll tersisa pada periode yang sudah mempunyai pembayaran.
- Pembaruan kode tidak melengkapi HPP, mengubah jadwal, atau menghitung ulang payroll produksi secara otomatis; tindakan tersebut tetap dilakukan admin melalui aplikasi.

## Mulai menggunakan

1. Buka situs. Pemilik awal memakai sesi ChatGPT yang sudah ada **sekali untuk aktivasi**, lalu membuat ID admin dan PIN 8–12 angka. Jika form aktivasi tidak terlihat, pilih **Aktivasi pemilik pertama** dan masuk memakai akun pemilik situs semula.
2. Setelah aktivasi, admin dan karyawan langsung membuka link lalu masuk dengan **ID + PIN**; akun ChatGPT atau email tidak dibutuhkan untuk login rutin.
3. Di **Karyawan**, pilih **Atur ID & PIN** pada setiap karyawan yang sudah ada. Buat ID unik, PIN, ulangi PIN, lalu konfirmasi menggunakan PIN admin. Data karyawan lama tetap terhubung ke roster, absensi, dan penggajian. Email kini opsional sebagai kontak.
4. Bagikan ID dan PIN secara pribadi kepada masing-masing orang. Peran admin/karyawan diatur pada data karyawan. PIN tidak bisa ditampilkan kembali; gunakan pengaturan ulang jika lupa.
5. Pilih **Cabut akses** untuk menutup semua sesi dan menghentikan login. Menonaktifkan karyawan juga mematikan login. Untuk mengaktifkan kembali, ubah status menjadi aktif lalu buat PIN baru.
6. Profil, tier gaji, katalog, roster, absensi, POS, dan penggajian tetap dikelola dari menu masing-masing. Kasir dapat dipakai sebelum resep lengkap; lengkapi HPP sebelum payroll. Shift dimulai saat check-in dan selesai otomatis setelah pesanan serta check-out selesai.

Halaman login dan menu pelanggan dapat dibuka umum. API operasional memerlukan sesi login yang sah. Aktivasi pemilik pertama hanya menerima identitas pemilik semula dari dispatcher Sites; pengunjung anonim tidak dapat mengambil alih akun. Pembaruan ini ditujukan untuk situs yang pemiliknya sudah diinisialisasi pada versi sebelumnya.

## Aturan hitung yang diterapkan

- Waktu operasional: **Asia/Makassar (WITA)**. Shift dapat melewati tengah malam; tanggal usaha tetap tanggal mulai shift.
- Setiap transaksi terikat ke satu shift berjalan atau shift historis yang belum terkunci pembayarannya. Absensi mengikuti rentang jadwal; transaksi historis langsung dicatat lunas.
- Omzet untuk payroll = subtotal setelah diskon, **tidak termasuk pajak**.
- HPP dihitung server dari resep dan biaya bahan saat pesanan dibuat, lalu disimpan sebagai snapshot per item.
- Laba dasar tier = omzet shift − HPP terjual − biaya yang secara eksplisit dialokasikan ke shift. Gaji shift itu sendiri belum dikurangkan pada tahap ini agar rumus tidak berputar.
- Biaya umum tanpa alokasi shift mengurangi laba bulanan. Pemilik dapat mengalokasikannya saat pencatatan bila harus memengaruhi tier shift.
- Pembelian bahan baku dicatat sebagai arus kas pengeluaran, tetapi tidak dikurangi kembali sebagai biaya laba karena konsumsi bahan sudah masuk HPP. Bila pelacakan stok diaktifkan, penambahan stok dilakukan melalui data bahan.
- Setiap staf berstatus hadir mendapat **nominal tier penuh**, tanpa prorata jam. Laba negatif memakai tier pertama. Ini asumsi awal yang terlihat pada UI.
- Rentang tier berurutan tanpa celah. Contoh “201 ribu” dinormalisasi menjadi Rp200.001 agar Rp200.001–200.999 tetap mempunyai tier.
- Menutup shift memerlukan semua pesanan selesai/dibatalkan dan seluruh staf hadir telah absen keluar. Hasil gaji, laba, serta tier saat penutupan disimpan dan tidak berubah ketika harga bahan atau tier berikutnya diedit.
- Bonus awal mengikuti pola referensi: persentase laba bulanan positif setelah biaya operasional/HPP/gaji, dibagi menurut **jumlah shift hadir**. Sisa pembulatan dialokasikan secara deterministik agar jumlah bonus sama dengan pool.
- Perubahan biaya atau persentase bonus menghapus payroll belum dibayar yang terdampak, agar dihitung kembali. Penutupan shift baru juga membatalkan hitungan belum dibayar bulan terkait.
- Saat satu payroll bulan ditandai lunas, periode tersebut dikunci untuk perubahan biaya dan pembukaan shift baru. Bayarkan setelah periode operasional selesai.
- Non-tunai, refund, dan gaji merupakan **pencatatan pembayaran manual**. Tidak ada payment gateway, transfer bank, QRIS pembayaran dinamis, atau pemindahan uang otomatis.

## Cakupan versi 1

| Modul | Implementasi |
|---|---|
| Dashboard | Antrean, staf hadir, laba dan estimasi gaji shift, stok minimum, pinjaman terlambat |
| Aktivitas visual | Diagram kasir–bar–pengambilan; avatar inisial staf bergerak mengikuti pesanan; ikon pelanggan pada meja terisi; mendukung reduced motion |
| POS | Cari/filter kategori, keranjang, catatan item, diskon, pajak, dine-in/takeaway, uang kembali, struk |
| Pesanan | Menunggu bayar → diterima → dibuat → siap → selesai; pembatalan sebelum produksi oleh admin, refund manual, stok dikembalikan satu kali |
| Meja | CRUD nomor/area/kapasitas/foto/catatan, status dan pesanan aktif, QR lokal berisi URL menu |
| Menu | CRUD katalog, kategori, foto, ketersediaan, harga, urutan |
| Bahan & resep | CRUD bahan, stok minimum, komposisi menu, HPP per porsi, margin sebelum biaya |
| Roster | Kalender mingguan, tambah/ubah/hapus jadwal, multi-staf, validasi benturan, shift malam |
| Absensi | Masuk/keluar per shift; koreksi admin untuk hadir/sakit/izin/libur dengan alasan |
| Payroll | Tier, snapshot gaji per shift dan karyawan, akumulasi bulanan, bonus, pencatatan lunas |
| Keuangan | Rentang tanggal, laba per shift, grafik perbandingan, biaya umum/shift, metode pembayaran, ekspor CSV |
| Karyawan | Nama, kontak opsional, ID login, pengaturan/reset PIN, pencabutan akses, peran admin/karyawan, aktif/nonaktif |
| Buku | Katalog, sampul/lokasi rak, jumlah eksemplar, pinjam/kembali, keterlambatan |
| Kolaborasi | Chat umum/pengumuman, catatan berwarna, tindak lanjut feedback |
| Pelanggan | Menu digital, kategori/pencarian, katalog buku, formulir rating dan masukan |
| Pengaturan | Profil, pajak/bonus, lebar struk, cadangan lengkap, pemulihan, audit sebelum/sesudah |
| Kalkulator | Empat operasi aritmetika tanpa eval |
| Sinkronisasi | Polling otomatis tiap 3 detik selama halaman aktif; indikator koneksi dan konflik penulisan |

## Keamanan dan arsitektur

React + TypeScript + Vinext, Cloudflare Workers, D1 untuk data, R2 untuk gambar, login aplikasi ID + PIN. Dispatcher Sites hanya dipakai untuk aktivasi pemilik pertama. Tidak memakai Firebase proyek lama, PIN plaintext, kunci API lama, atau localStorage untuk data bisnis.

`lib/engine.ts` memvalidasi semua tindakan bisnis. `lib/auth.ts` memeriksa sesi dan akun; `lib/store.ts` melakukan penyaringan data per peran, optimistic concurrency, idempotensi, dan commit atomik. Data diklasifikasi dalam tabel `records`; `control` memegang revisi dan pemilik; `audit` mencatat mutasi. Migrasi tersimpan di `drizzle/`.

API `/api/cafe` hanya untuk akun yang terdaftar; role tidak diambil dari permintaan browser. Staf tidak menerima HPP, biaya, feedback, tier, atau rincian gaji orang lain. Harga dan total transaksi selalu dihitung ulang di server. POST memeriksa origin dan content type. Upload dibatasi 2 MB dan signature PNG/JPEG/WebP; SVG tidak diterima. API publik hanya menyajikan katalog aman dan menerima feedback dengan pembatasan frekuensi.

PIN 8–12 angka di-hash memakai PBKDF2 SHA-256 (100.000 iterasi, batas WebCrypto Workers), salt acak per pengaturan PIN. PIN sederhana berurutan/berulang ditolak. Token sesi acak 256 bit disimpan sebagai hash di tabel terpisah, dengan cookie HttpOnly, SameSite=Strict, dan Secure pada HTTPS. Batas sesi 12 jam dan kedaluwarsa setelah 60 menit tanpa permintaan. Polling saat dashboard terbuka memperbarui aktivitas sesi.

Login dibatasi lima percobaan per ID selama 15 menit dan 40 permintaan autentikasi per IP per menit. Pembatasan disimpan di D1 dan menghitung permintaan serentak. Perubahan kredensial memerlukan PIN admin; pencabutan, perubahan data akun, dan reset PIN mengakhiri sesi terkait. Pemeriksaan sesi dan peran juga diterapkan saat commit transaksi. Kredensial tidak dimasukkan ke respons API operasional, audit, atau cadangan JSON. Tidak tersedia pemulihan PIN pemilik otomatis melalui email; jaga PIN pemilik atau akun admin cadangan.

**Batas kepercayaan deployment:** header identitas dipercaya hanya karena dispatcher Sites menyaring dan menyediakannya. Jangan mempublikasikan Worker ini sebagai endpoint langsung yang menerima header identitas buatan klien. Pemindahan ke hosting lain memerlukan integrasi autentikasi server yang sesuai.

## Cadangan dan pemulihan

Admin dapat membuat cadangan tersimpan di server melalui Pengaturan → Cadangan & pemulihan. Paket `.winds.jsonl` memuat data operasional, gambar unggahan yang masih dirujuk, serta riwayat audit dan nilai sebelum/sesudah. Tautan gambar eksternal (misalnya Google Drive) tetap berupa tautan, bukan salinan berkas. Gambar sumber yang hilang ditandai secara eksplisit. PIN, hash PIN, dan sesi login tidak disertakan. Simpan unduhan di tempat terbatas karena berisi data bisnis dan karyawan.

Pemulihan mendukung database aktif: periksa pratinjau jumlah perubahan, masukkan alasan, PIN admin, dan konfirmasi PULIHKAN. Sistem membuat cadangan keselamatan terlebih dahulu dan menolak penimpaan bila data berubah setelah pratinjau. Penyalinan bertahap dapat dilanjutkan. Identitas serta akses pemilik dan admin pelaku dipertahankan; ID/PIN akun lainnya perlu dibuat ulang. Audit aktif tetap disimpan; arsip audit dari paket dapat ditinjau terpisah.

Unggahan paket dibatasi 32 MiB dan satu bagian cadangan maksimal 16 MiB. JSON versi lama tetap diterima, tetapi hanya memiliki gambar yang masih tersedia di penyimpanan tujuan dan tidak memiliki arsip audit. Cadangan server dapat diunduh; belum ada jadwal cadangan harian otomatis atau kebijakan penghapusan arsip. Data Firebase lama tidak dimigrasikan otomatis.

Riwayat perubahan mencatat pelaku, waktu, alasan, dan data sebelum/sesudah untuk koreksi penting, termasuk penghapusan. Pencatatan rinci berlaku sejak pembaruan ini; nilai lama yang tidak pernah direkam tidak dapat direkonstruksi. Perubahan kredensial hanya mencatat ID login/status, tanpa PIN atau hash.

## Menjalankan lokal

Prasyarat: Node.js 22.13+ dan npm. Repo ini sudah membawa lockfile.

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_eminent_sway.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_peaceful_lady_vermin.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_cold_iron_lad.sql
npm run dev -- --port 5173
```

Terapkan setiap migrasi **sekali** dan berurutan; lewati migrasi yang sudah ada. Pembaruan login memerlukan data pemilik dari versi sebelumnya pada database lokal. Buka URL lokal yang dicetak server. Login mock pengembangan disediakan starter hanya di loopback; identitas lokal adalah `seedy@sites.test` dan tidak masuk build produksi. Database lokal `.wrangler/state` terpisah dari database online.

```sh
npm run typecheck
npm test
```

`python3 tests/auth-smoke.py` memeriksa migrasi akun, login tanpa ChatGPT, pemisahan peran, reset PIN, pencabutan sesi, dan pembatasan percobaan serentak. Setelah itu `python3 tests/api-smoke.py` menguji integrasi melalui port 5173 dan **menulis data contoh lokal**. Jalankan hanya pada database pengembangan yang boleh dipakai pengujian. Skrip tidak menerima target produksi.

Pemasangan online menggunakan Sites dengan manifest `.openai/hosting.json`, migrasi D1, dan binding DB/BUCKET. Pengelola Sites melakukan publikasi serta mengatur audience. Tidak diperlukan API key Gemini/OpenAI.

## Batas versi awal

- Satu kafe, satu shift aktif, dua peran. Belum multi-cabang, offline POS, payment gateway, atau rotasi roster otomatis.
- Dashboard visual adalah diagram operasional dengan avatar inisial; ilustrasi kafe/avatar karakter yang lebih rinci merupakan pengembangan berikutnya.
- Roster bergilir melalui edit kalender manual. Belum ada aturan prorata, overtime, cuti berbayar, atau pembagian tier bersama.
- Cetak melalui dialog sistem/browser ke printer yang terpasang. Belum driver Bluetooth/USB langsung atau uji printer fisik.
- Cadangan berukuran besar, pagination/arsip transaksi, uji beban tinggi, audit keamanan independen, dan kebijakan retensi data belum diselesaikan. API saat ini membaca snapshot data kafe; evaluasi kapasitas sebelum riwayat tumbuh besar.
- Transaksi historis tidak dapat dimasukkan sembarang ke shift terkunci; ini menjaga riwayat perhitungan.
- Tidak ada migrasi otomatis dari Firebase referensi, integrasi Gemini, atau klaim sinkronisasi offline.
