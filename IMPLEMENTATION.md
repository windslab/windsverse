# Catatan implementasi dan pemeriksaan

## Kontrak aplikasi

- `GET /api/auth`: status sesi dan aktivasi; `?accounts=1` hanya admin, metadata akun tanpa hash PIN.
- `POST /api/auth`: login/logout, aktivasi pemilik sekali, pengaturan kredensial dan pencabutan akses dengan konfirmasi PIN admin.
- `GET /api/cafe`: `{actor, setup, revision, state}` sesuai peran; `?audit=1` untuk admin.
- `POST /api/cafe`: `{action, payload, revision, key}`. `key` UUID untuk idempotensi. Revisi usang mengembalikan 409 tanpa mengubah data. Harga, hak akses, dan total tidak dipercaya dari klien.
- `GET /api/public`: profil publik, menu, status ketersediaan buku, nomor/area meja; tanpa transaksi, karyawan, biaya, atau payroll.
- `POST /api/public`: feedback pelanggan; origin dicek dan frekuensi dibatasi.
- `POST /api/upload`: gambar biner admin, signature divalidasi, maksimal 2 MB. `GET /api/files/:id`: aset katalog dari R2.

Entitas tambahan dibanding referensi: `shifts` dengan interval waktu dan anggota roster; `shiftId` pada transaksi, biaya, absensi; snapshot hasil penutupan; audit/revisi/idempotensi. PIN lama tidak digunakan.

## Pengujian

Pengujian unit bisnis mencakup batas tier tanpa celah, harga/HPP/stok/pajak, biaya shift, pembelian bahan tanpa duplikasi HPP, penolakan hak staf, roster bertumpang tindih, absensi ganda, stok tidak cukup, pesanan belum dibayar, refund stok satu kali, penguncian shift, shift lintas tengah malam, payroll dibayar, pinjaman, pemulihan cadangan dan penolakan total invoice yang diubah, serta pembatalan payroll usang.

Smoke test lokal memeriksa login, penolakan anonim, origin tidak sah, bootstrap, katalog contoh, permintaan berulang, revisi usang, dua penulisan serentak, roster, absensi, harga kanonis, HPP, stok, progres pesanan, dan pemisahan data publik.

Pratinjau dashboard dan kalender telah dilihat pada browser lokal. WebMCP `winds_open_view` berhasil terdaftar dan membuka roster. Pemeriksaan input tidak valid WebMCP terhenti karena pembatasan pemeriksa persetujuan otomatis; fitur tersebut tidak diperlukan untuk penggunaan biasa. Tidak dilakukan pengujian printer fisik, payment gateway, penetrasi independen, beban produksi, atau semua kombinasi perangkat.

## Urutan operasional

Profil → tier → tim → menu/bahan/resep → kalender → buka shift → absen masuk → transaksi → selesai pesanan → biaya → absen keluar → tutup shift → hitung payroll → catat pembayaran.

## Migrasi login ID dan PIN

Versi sebelumnya mengikat pemilik ke identitas Sites. Migrasi `0001` menambahkan tabel kredensial, sesi, dan pembatasan percobaan; tidak mengubah data operasional. Aktivasi hanya boleh dilakukan oleh ID pemilik semula dan hanya bila kredensial owner belum ada. Setelah aktivasi, semua akses operasional memerlukan sesi ID + PIN, termasuk admin. Identitas Sites tidak menjadi jalan masuk alternatif ke API operasional.

Situs dapat memakai audience public setelah Worker baru berhasil terpasang. Anonim hanya menerima halaman login, katalog dan feedback publik. Hash PIN, token sesi, data staf, dan keuangan tidak masuk bundel publik. Profil karyawan tetap memakai ID internal lama, sementara ID login unik disimpan pada tabel autentikasi terpisah. Tidak ada PIN bawaan pada produksi.

`tests/auth-smoke.py` memeriksa aktivasi pemilik, akun tanpa email, login admin dari browser tanpa sesi ChatGPT, pembatasan peran, CSRF, kerahasiaan data kredensial, reset PIN, pencabutan/penonaktifan akun, logout, invalidasi banyak perangkat, serta delapan percobaan login paralel. Data uji hanya pada database lokal. PIN contoh di pengujian tidak digunakan pada situs online.

Tampilan login dan dashboard sesudah login diperiksa di browser lokal; form Atur ID & PIN terhubung ke data akun. Pemeriksaan ini bukan audit penetrasi independen.
