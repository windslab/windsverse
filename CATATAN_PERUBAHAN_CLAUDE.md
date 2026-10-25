# Catatan perubahan Claude

Baseline: Sites versi 60, commit `b9a8dc3ac3ae4eba683aef1673497de1ad7ff3f3`.
Tidak ada perubahan hosting, domain/DNS, binding D1/R2, `.openai/hosting.json`, migrasi, atau data produksi.

## 1. Format kode (commit "Format source with Prettier")

- Menambahkan `prettier@3.6.2` (devDependency, versi tepat) serta skrip `npm run format` dan `npm run format:check`.
- Cakupan: `app/`, `lib/`, `db/`, `tests/`, `components/`, `hooks/`. Integrasi Sites/Vinext (`build/`, `scripts/`, `vite.config.ts`), `public/` dan `drizzle/` tidak disentuh.
- Bukti tidak mengubah logika: hasil kompilasi esbuild ke-129 file dibandingkan sebelum dan sesudah. Bedanya hanya potongan teks spasi JSX yang dirender sama.
- `typecheck` dan `build` lulus. Test engine tetap 21/25; 4 test gagal sudah ada sejak baseline, karena test belum mengisi alasan yang kini wajib.

## 2. Avatar Luna gaya PS1 (branch `luna-ps1`)

Luna dibuat ulang mengikuti konsep "LUNA — PS1 style concept" dari owner (24 Okt 2026): low-poly bersudut, tekstur pixel 16–32 px dengan filter nearest, kepala chibi besar dengan bob cokelat, kaus pink, rompi charcoal dengan name tag "LUNA", pena dan kantong, pita di belakang, cargo navy dengan kantong samping cokelat, gelang abu dan hitam, serta sneakers krem bersol gelap.

| File | Perubahan |
|---|---|
| `scripts/luna-ps1/model.js` | Sumber model. Ubah proporsi, warna, dan tekstur di sini. |
| `scripts/build-luna-ps1.mjs` | Alat development untuk menghasilkan GLB dan preview. Butuh Playwright Chromium; tidak dipakai saat build Sites. |
| `public/models/luna-ps1.glb` | Model baru, 311 KB (yang lama 1,7 MB), 2.092 segitiga, 79 mesh. |
| `public/models/luna-ps1-preview.webp` | Poster untuk halaman `/luna`. |
| `app/scene-3d.tsx` | Café memuat `luna-ps1.glb`. |
| `app/luna/cafe-rig.ts` | Skala seragam. Faktor penyempitan 0.78/0.85 untuk model lama dihapus. |
| `app/luna/viewer.tsx`, `studio.tsx` | Studio memakai model dan poster baru, dengan skala ke tinggi kamera studio. Cache versi `?v=5`. |

Nama sambungan tetap sama (`Luna_Body`, `Luna_Head`, `Luna_Arm_L/R`, `Luna_Elbow_L/R`, `Luna_Wrist_L/R`, `Luna_Leg_L/R`). Animasi sapa, pose barista, dan deteksi sepatu (`Luna_Leg_*_sole/sneaker`) berjalan tanpa perubahan logika.

Verifikasi lokal (database lokal kosong, bukan produksi):
- Render 4 sudut dibandingkan dengan konsep, plus render di dalam model café asli memakai `placeCafePeople`.
- Kontak lantai: sol sepatu berada 5,5 mm di atas lantai bar (offset 0.006 × skala yang memang disengaja), saat diam maupun di posisi kasir.
- Halaman `/luna`: model tampil dan tombol "Sapa Luna" menggerakkan lengan.
- `typecheck`, `format:check`, dan `build` lulus.

Belum diverifikasi: FPS di perangkat sungguhan, tampilan di HP, dan persetujuan visual owner.

`luna-chibi.glb` dan `luna-chibi-preview.webp` lama tidak dihapus. Keduanya tidak lagi dimuat; hapus setelah owner menyetujui Luna baru.

## 3. Luna revisi detail (24 Okt 2026, masih branch `luna-ps1`)

Mengikuti 7 poin yang disetujui owner:
1. Rambut: kubah bersegi, potongan helai di mahkota, bob berbentuk lonceng dari helai runcing yang mengembang, poni bergerigi, gradasi terang di atas–gelap di ujung (vertex color).
2. Wajah: mata oval gelap dengan satu titik kilau, wajah lebih bulat, telinga terlihat (rambut samping dimulai di belakang telinga).
3. Proporsi chibi: kepala + rambut ±45 % tinggi, rompi berakhir di 0,24, kaki lebih pendek.
4. Celana cargo baggy menumpuk di atas sepatu, kantong samping 3D dengan penutup.
5. Sepatu tebal: upper krem, midsole terang, sol gelap.
6. Tangan kepalan bulat dengan ibu jari, lengan sedikit terbuka.
7. Rompi: 4 kantong 3D berpenutup, 2 pena menonjol, name tag, pita 3D besar di punggung.

Verifikasi: render 4 sudut, café (diam dan kasir, sol 5,5 mm di atas lantai seperti sebelumnya), `/luna` + "Sapa Luna", `typecheck`, `format:check`, `build`.

## 4. Luna revisi rambut dan bahu (24 Okt 2026, masih branch `luna-ps1`)

Masukan Winds: rambut jelek dan belum mirip referensi, dari samping terlihat botak, bahu kotak.

- Rambut helai (crown, bob, sidelock, poni: 36 mesh) diganti satu mesh `Luna_Head_hair`: kubah bersegi
  plus "rok" rambut yang panjangnya diatur per arah (`hairHem` di `model.js`): poni bergerigi di dahi,
  helai pembingkai pipi, celah untuk telinga, dan bob penuh sampai tengkuk. Sisi kepala kini tertutup.
- Tekstur rambut diulang (RepeatWrapping) sehingga tampil sebagai blok piksel seperti konsep,
  bukan garis-garis memanjang.
- Bahu: bagian atas kaus dan rompi dibuat melandai ke luar, tali rompi miring mengikuti bahu,
  lengan baju pendek dibuat membulat (puff).
- Tinggi model 0,885 (sebelumnya 0,915). Rig dan nama joint tidak berubah, jadi animasi tetap jalan.
- Verifikasi: render 4 sudut; café (sol 0,8206 vs lantai Cube066 0,8150; kasir di floor_bar_staff_aisle);
  `npm run typecheck`, `format:check`, `build` lulus.

## 5. Luna revisi detail kepala, rambut, dan badan (24 Okt 2026, masih branch `luna-ps1`)

Masukan Winds: poni terlalu rata sehingga alis tidak terlihat, dan dari samping poni rata dengan wajah.
Kali ini setiap bagian diukur dari gambar referensi (posisi alis, mata, mulut, dagu, lebar dan
tinggi rambut, posisi telinga) lalu dibandingkan berdampingan dari 4 sudut.

- Kepala baru (`headMesh`): bentuk low-poly dari ukuran referensi, bagian depan wajah lebih datar.
  Tekstur wajah 48×32 membungkus setengah kepala, jadi mata dan alis tetap terlihat dari samping dan
  kedua mata terlihat dari sudut 3/4.
- Wajah: mata oval tegak dengan garis bulu mata dan lekuk luar, alis tipis, titik hidung, senyum
  lebih lebar, blush di bawah sudut luar mata.
- Telinga lebih besar dan bulat, sedikit menghadap depan, dengan lipatan dalam.
- Rambut (`hairStrands`): helai-helai berujung runcing yang bertemu di ubun-ubun dan saling tumpang.
  Poni tengah sempit dengan panjang berbeda-beda sampai atas mata; "jendela" dahi kiri-kanan sehingga
  alis terlihat; helai yang menyapu ke pelipis; helai pembingkai pipi; celah telinga; bob dua lapis
  di belakang yang melebar ke bawah. Poni menonjol di depan dahi bila dilihat dari samping.
  Rambut tidak memberi bayangan ke wajah (studio `/luna` juga disesuaikan di `app/luna/viewer.tsx`).
- Badan: kepala diturunkan sehingga dagu dekat bahu dan ujung rambut menyentuh garis bahu; lengan
  lebih terbuka; lengan baju lebih panjang mengikuti lengan; rompi lebih panjang dan melebar di bawah;
  celana lebih longgar dan menumpuk di atas sepatu; kantong cargo lebih besar; pita belakang lebih
  besar dan turun ke pinggang.
- Rig dan nama joint tetap sama; animasi sapa tetap jalan.
- Verifikasi: render 4 sudut + close-up kepala berdampingan dengan referensi; GLB dimuat ulang dan
  identik dengan model sumber; café (sol 0,8206 vs lantai Cube066 0,8150; kasir di
  floor_bar_staff_aisle); studio `/luna` + tombol "Sapa Luna"; `npm run typecheck`, `format:check`,
  `build` lulus.

## 6. Luna gabungan + toon shader dan outline (24 Okt 2026, masih branch `luna-ps1`)

Pilihan Winds setelah membandingkan 4 versi: badan dan kepala Versi 3 (commit `1bf2564`), rambut
Versi 1 (commit `c53b23b`). Revisi detail di bagian 5 tidak dipakai (masih ada di riwayat git,
commit `3d22a88`).

- `scripts/luna-ps1/model.js`: isi Versi 3 dengan rambut Versi 1 (`hairV1`). Rambut dibangun persis
  seperti di Versi 1 (helper kotak dan tekstur garis-garis yang sama), lalu satu transform
  menyesuaikannya ke kepala Versi 3 yang sedikit lebih kecil.
- `lib/toon.ts` (baru):
  - `toonify(root)`: mengganti MeshStandard/MeshPhysical menjadi MeshToonMaterial dengan 2 tingkat
    bayangan; warna, tekstur, vertex color, dan cahaya emissive tetap. Kaca, air, dan material
    tembus pandang tidak diubah.
  - `createToonOutline(renderer)`: scene dirender sekali ke render target (MSAA 4×, depth texture),
    lalu satu pass layar penuh menggambar garis coklat tua (#3b2a20) ±1,5 piksel CSS di sisi depan
    setiap lompatan kedalaman. Memakai selisih kedua 1/kedalaman, jadi lantai/dinding datar tidak
    bergaris. Garis memudar di dekat batas jarak pandang. Latar tidak ikut di-tone-map.
- `app/scene-3d.tsx`: model café, orang-orang (termasuk Luna), kendaraan, dan lantai memakai toon;
  `renderer.render` diganti `toonOutline.render`; dibuang saat unmount.
- `app/luna/viewer.tsx`: studio `/luna` memakai toon + outline; lantai bayangan tidak menulis depth
  supaya tepinya tidak bergaris.
- Verifikasi: render studio dan café (jauh, dekat, siang, malam) di Chromium headless (SwiftShader);
  `npm run typecheck`, `format:check`, `build` lulus. Belum diukur: FPS di HP sungguhan. Biayanya
  satu render target MSAA + satu pass layar penuh; pengatur kualitas otomatis yang sudah ada tetap
  menurunkan resolusi bila FPS < 35.

## 7. Performa mobile dan outline Luna (24 Okt 2026, masih branch `luna-ps1`)

- `public/models/winds-space-new.glb`: 63 tekstur PNG diubah ke WebP (kualitas 88, `EXT_texture_webp`)
  dengan `@gltf-transform/cli@4.1.1 webp`. 7,24 MB → 4,12 MB. Geometri, nama node/mesh/material
  tidak berubah (175 node, 172 mesh, 98 material dibandingkan sebelum dan sesudah). Cache `?v=2`.
- `app/scene-3d.tsx`: Luna dan `cafe-navigation-v1.json` diunduh bersamaan dengan model café, bukan
  sesudahnya. Canvas tanpa MSAA (`antialias: false`), karena pass outline sudah memakai MSAA di
  render target dan ke layar hanya menggambar satu quad.
- `lib/toon.ts`: `toonOutline.addHull(root)` memberi Luna garis tepi "inverted hull" selebar ±1,25 px
  CSS. Garis antar-bagian yang bersentuhan (lengan–rompi, rompi–kaus, celana) kini selalu terlihat,
  juga di layar HP. Warnanya persis #3b2a20 setelah tone mapping, jadi sama di café, studio, siang
  dan malam. Hull digabung per joint: +12 draw call untuk Luna (bukan +79).
- `app/luna/viewer.tsx`: studio memakai hull yang sama dan canvas tanpa MSAA.
- Cache Luna dinaikkan ke `?v=6` (GLB dan poster).
- Verifikasi: `/luna` di viewport 375×812 (diam dan "Sapa Luna"), café memuat ketiga file paralel,
  `typecheck`, `format:check`, `build` lulus; lint tidak bertambah (17 masalah lama di file yang sama).
  Belum diverifikasi: FPS di HP sungguhan dan tampilan close-up Luna di dalam café.
- Kompresi geometri café (commit terpisah): `EXT_meshopt_compression` tanpa kuantisasi posisi,
  4,12 MB → 2,10 MB (sekitar 0,9 MB jika server memakai gzip). Posisi, UV, tekstur, nama dan transform
  node identik byte demi byte; segitiga sama (urutan indeks diputar, arah sisi tetap); normal disimpan
  lebih ringkas dengan selisih maksimal 1,2° (rata-rata 0,2°). Decoder (`meshopt_decoder.module.js`)
  ikut bundel JS dari `three`, tidak ada file tambahan untuk di-host. Cache `?v=3`.
  Alat: `@gltf-transform/core` + `meshoptimizer`, metode FILTER, dijalankan di luar repo.

## Deploy ke Sites

Bawa branch ini (atau patch-nya) ke lingkungan ChatGPT Sites yang punya akses project `appgprj_6ac7d63cb4f48191a187a55fc5239204`. Lalu: `npm ci` → `npm run build` → simpan versi → deploy ke project yang sama → cek `/` dan `/luna`. Tidak ada migrasi database.

## 8. Pelanggan per minuman, rombongan, bersih-bersih, dan lacak nama (24 Okt 2026, branch `luna-ps1`)

- Kasir: kolom "Nama pemesan" (opsional, maks. 40 huruf) dan meja tidak wajib untuk makan di tempat
  ("Tanpa nomor meja"). `order.create` menyimpan `customerName`; `tableId` boleh kosong.
- Lacak di halaman depan: bisa pakai nama. `GET /api/public?track=<nama>` hanya mengembalikan pesanan
  lunas hari ini yang cocok: nama depan, status, nomor antrean, dan jenis pesanan. Tanpa harga atau isi.
  Batas pencarian sama dengan pencarian nomor struk (30 per menit per IP).
- Animasi (`lib/cafe-visitors.ts`, `app/scene-people.ts`): satu pelanggan per minuman (makanan tidak
  dihitung, minimal 1, maks. 4 per pesanan, maks. 8 di layar). Satu pesanan = satu rombongan yang duduk
  berdekatan; tanpa meja, rombongan memilih area acak tapi tetap. Barista mengantar sekali untuk satu
  rombongan, lalu mengelap bar ±6 detik (dihentikan bila ada pesanan baru).
- `scripts/cafe-model-source.ts`: alat tes/bake kini bisa membaca GLB yang dikompres meshopt.
- Tes: tes baru untuk rombongan; `people.test` 8/8, `engine.test` 21/25 (4 gagal lama, sama seperti
  sebelumnya), `typecheck`, `format:check`, `build` lulus.
- Belum dicek di browser: layar kasir dan lacak nama (database lokal kosong).

## 9. Kamera vintage "Story of Winds" (24 Okt 2026, branch `luna-ps1`)

- Tombol baru **Story of Winds** (kamera) di antara tombol fitur. Tombol TV lama berganti nama **Memoirs**.
- `app/vintage-camera.tsx` + `.module.css`: badan kamera film (pelat krom, penghitung sisa, jendela
  bidik 2:3), tuas penggulung yang harus digeser/diketuk sebelum tiap jepretan, tombol rana dengan
  bunyi dan getar, lampu kilat layar, kamera depan/belakang, 5 film, album, unduh, hapus.
  Halaman aturan + persetujuan sebelum pertama kali dipakai (disimpan di perangkat).
- `lib/film.ts`: pengolahan foto di HP (warna, pudar, butiran, vinyet, kebocoran cahaya, tanggal
  oranye untuk Sekali Pakai, bingkai krem bertulisan). JPEG ±200–350 KB, ±50–150 ms.
- Server (`lib/photos.ts`, `app/api/photos`): foto di R2 (`photo/<id>`), catatan di tabel `records`
  (kind `photo`), tanpa migrasi. Pemilik = hash token acak perangkat; hanya perangkat itu dan admin
  yang bisa melihat/menghapus. 15 jepretan per perangkat per hari (reset 08.00 WITA = 00.00 UTC),
  plus batas 60 per jaringan per hari. Foto yang dihapus tetap memotong jatah. Foto kedaluwarsa
  30 hari dihapus bertahap setiap ada jepretan baru. Data kafe (`read()`) tidak memuat baris foto.
- Diuji lokal (database lokal saja): roll 15 → jepretan ke-16 ditolak, perangkat lain 403, hapus
  tidak mengembalikan jatah, file bukan JPEG/film asing ditolak, album dan penghitung tampil.
  `typecheck`, `format:check`, `build` lulus; `engine.test` 21/25 seperti sebelumnya.
- Belum diuji: kamera sungguhan di HP (panel browser memblokir kamera) dan tampilan admin "semua foto".

## 10. Memoirs dari foto tamu, pengaturan kamera admin, dan kamera digicam (25 Okt 2026, branch `luna-ps1`)

- **Memoirs** (`app/api/tv/route.ts`, `app/drive-tv.tsx`): tidak lagi mengambil Google Drive. Isinya foto
  Story of Winds yang dipilih admin (`memoirs: true`). Hanya foto pilihan itu yang bisa dibuka publik.
- **Cafe Management → Story of Winds** (`app/camera-admin.tsx`, khusus admin): jatah jepretan per hari,
  film bawaan yang tampil, preset film (penggeser + upload LUT .cube + pratinjau langsung), dan semua foto
  tamu dengan tombol "Tampilkan di Memoirs" dan hapus.
- Server: `lib/camera-config.ts`, `app/api/camera` (pengaturan & preset), `app/api/camera/lut/[id]`.
  Preset dan pengaturan disimpan di `records` (kind `filmPreset`/`cameraConfig`), LUT di R2 `lut/<id>`
  (maks. 33³). Tanpa migrasi. `PATCH /api/photos?id&memoirs` untuk admin.
- `lib/film.ts`: LUT 3D (trilinear), parser .cube (diperkecil ke ≤33³), zoom digital, preset → film.
- **Kamera digicam** (`app/vintage-camera.tsx`): badan perak, layar LCD dengan info (baterai, mode, film,
  sisa jepretan, kilat, timer, zoom, tanggal-jam WITA), kotak fokus yang mengunci hijau dengan bunyi
  bip-bip, zoom W/T, MENU film, ▶ lihat foto (unduh/hapus), timer 3 detik, kamera depan/belakang.
  Teks aturan diperbarui: foto pilihan bisa tampil di Memoirs (persetujuan diminta ulang, `sow-consent-v2`).
- Diuji lokal (database & akun admin uji coba lokal saja): pengaturan, preset + LUT, film tersembunyi,
  Memoirs publik hanya untuk foto pilihan, tamu tidak bisa mengubah pengaturan/Memoirs, panel admin dan
  kamera digicam tampil. `typecheck`, `format:check`, `build` lulus; `engine.test` 21/25 seperti sebelumnya.
- Belum diuji: kamera sungguhan di HP.

## 11. Noisegasm: musik latar dengan radio tua (25 Okt 2026, branch `luna-ps1`)

- Tombol **Noisegasm** di halaman depan (6 tombol, 3 baris). Radio kayu dengan kisi speaker yang menyala,
  jendela frekuensi (jarum + judul berjalan), kenop volume, tombol sebelumnya/putar-jeda/berikutnya.
  Pemutar mini di pojok kiri bawah selama ada musik.
- Putar otomatis: dicoba saat halaman dibuka; bila browser menolak (aturan browser), mulai pada sentuhan,
  klik, atau tombol pertama. Bila pengunjung menjeda, tidak diputar otomatis lagi di sesi itu.
- Lagu unggahan diputar lewat `<audio>` → GainNode (kenop volume juga berfungsi di iPhone). Mode YouTube
  memakai pemutar resmi YouTube; videonya tetap terlihat di pemutar mini (syarat YouTube).
- Server: `lib/music.ts`, `app/api/music` (GET publik, POST pengaturan/ubah/urut/hapus, PUT unggah — admin),
  `app/api/music/[id]` (streaming dengan Range untuk Safari). Lagu di R2 `music/<id>` (maks. 20 MB, 60 lagu),
  data di `records` (kind `track`/`musicConfig`). Tanpa migrasi; tidak masuk data kafe.
- **Cafe Management → Noisegasm** (`app/music-admin.tsx`, khusus admin): sumber (unggahan/YouTube), link
  playlist/video YouTube, putar otomatis, volume awal, unggah banyak lagu ("Penyanyi - Judul" dipisah
  otomatis), ubah judul, urutkan, hapus, dengar contoh.
- Diuji lokal: unggah, file bukan lagu ditolak, tamu tidak bisa unggah, link non-YouTube ditolak, Range 206,
  putar otomatis + pindah lagu, radio dan pemutar mini tampil. `typecheck`, `format:check`, `build` lulus.
- Belum diuji: mode YouTube di browser, dan putar otomatis di HP sungguhan.

## 12. Noisegasm: gramofon 3D toon menggantikan radio (25 Okt 2026, branch `luna-ps1`)

- `app/gramophone-3d.tsx` (dimuat hanya saat Noisegasm dibuka): gramofon dari bentuk dasar three.js —
  kabinet kayu membulat dengan pita pink dan plakat krem, kaki bulat, engkol, piringan kuningan, piringan
  hitam bertekstur alur + label pink "Noisegasm", lengan jarum, leher kuningan melengkung, corong bunga.
- Toon: `MeshToonMaterial` + `createToonOutline` (garis tepi dari kedalaman) + hull hanya untuk bentuk
  tertutup (kabinet, leher). Corong tidak memakai hull karena bagian dalamnya terlihat.
- Animasi saat musik berputar: piringan berputar (naik/turun pelan seperti motor), lengan jarum turun,
  engkol berputar, gramofon sedikit memantul, not balok (♪ ♫ ♬ ♩, sprite berwarna dengan garis cokelat)
  keluar dari corong, melayang bergoyang, lalu memudar. Mengikuti "kurangi gerakan" di perangkat.
- Bisa diputar dengan menggeser (sudut dibatasi, tanpa zoom). Judul lagu di plakat kuningan, kenop volume
  dan tombol ⏮ ⏯ ⏭ di papan kayu. Radio lama dihapus.
- `typecheck`, `format:check`, `build` lulus. Dicek di ukuran HP (diam dan berputar).

## 13. Langit, cahaya, dan atmosfer scene 3D seperti Windstronout (25 Okt 2026, branch `luna-ps1`)

- `lib/cafe-sky.ts`: kubah langit + awan dari teleskop (`createSkyAtmosphere`, warnanya dikonversi ke
  ruang linear supaya tampil sama), bintang dari `public/sky/stars.json` (magnitudo ≤ 5,2) dengan rotasi
  langit sungguhan untuk Pangkajene, bulan, dan posisi matahari sungguhan (astronomy-engine). Preset:
  Live, Fajar, Pagi, Siang, Sore, Senja, Malam (matahari meluncur pelan ke posisi baru).
- `app/scene-3d.tsx`: arah & warna matahari (putih siang, keemasan pagi/senja), bulan sebagai cahaya
  utama malam, warna langit/tanah ambient, eksposur, kabut ke warna cakrawala, lampu/neon/lampu mobil
  menyala sesuai ketinggian matahari, bayangan diperbarui saat matahari bergeser. Tombol Pagi/Malam
  diganti satu tombol waktu (Live → Fajar → … → Malam). Suasana suara tetap mengikuti siang/malam.
- `lib/toon.ts`: grade warna opsional di pass outline (tint, shadow lift, saturasi); netral untuk studio
  dan gramofon. Kafe: segar siang, keemasan pagi/senja, biru malam (nuansa Ghibli).
- Daun (pohon pasui, taman, semak, pot, tanaman kaki pohon) bergoyang lewat vertex shader angin.
- Kolam: riak dan ikan tidak lagi ikut "dibekukan" (`matrixAutoUpdate=false`), jadi bergerak lagi.
- Tampilan awal dari depan (sisi jalan, azimut −82°, elevasi 16°).
- Teleskop: klik gedung Winds Space di ilustrasi mode wide (`hitsCafe`, u 0,19–0,35) → zoom masuk +
  pudar krem → scene 3D muncul dari posisi teleskop menghadap kafe → meluncur ke tampilan depan.
- Dicek di browser: semua waktu (fajar–malam, bintang malam, awan sore/senja), tampilan depan, alur
  klik ilustrasi. `typecheck`, `format:check`, `build` lulus; `people.test` 8/8, `engine.test` 21/25.
- Belum diukur: FPS di HP sungguhan dengan langit baru.

## 14. Dunia 3D dari panorama Windstronout (25 Okt 2026, branch `luna-ps1`)

- `lib/cafe-world.ts`: lantai krem polos diganti dunia 3D bergaya panorama — tanah berbukit (noise
  deterministik, vertex color rumput rendah/sedang/tinggi), halaman rata di sekitar kafe dan koridor jalan
  yang memanjang (aspal + tepi tanah), sungai berkelok di lembah seberang jalan (pita air dengan garis
  arus bergerak), 16 bukit karst di cakrawala (satu mesh gabungan), 140 pohon (instanced, ikut angin),
  dan menara observatorium di atas bukit.
- `app/scene-3d.tsx`: dunia dibuat setelah kafe & jalan diketahui (`floor` lama disembunyikan); langit
  radius 150, kamera far 170, kabut 40–240 supaya bukit jauh tetap terlihat berkabut.
- Diukur di emulasi HP: 60 fps, ±154 ribu segitiga (sebelumnya ±96 ribu), ±552 draw call.
- `typecheck`, `format:check`, `build` lulus; `engine.test` 21/25 seperti sebelumnya.

## 15. Dunia: kafe menapak, jalan panjang, lalu lintas dua arah, gunung, dan matahari (25 Okt 2026)

- Tanah mengikuti lantai terendah kafe + gundukan rumput di sekeliling dinding (tidak menutupi jalan);
  warna rumput sama di semua area (warna "halaman" dihapus). Bukit dekat dibuat landai.
- Jalan panjang 300 satuan dengan garis tengah putus-putus dan garis tepi kuning (`World_Road`); efek
  pudar di ujung jalan model dihapus.
- Tiang listrik + tiga kabel melengkung setiap 13 satuan di sisi kafe sepanjang jalan (dua mesh gabungan),
  dilewati di area kafe yang sudah punya tiang sendiri.
- Lalu lintas dua arah: jalur kedua berlawanan arah; mobil berjalan 70 satuan ke tiap sisi dan hanya
  memudar di 7% awal/akhir perjalanan.
- Gunung: barisan gunung batu menyambung di belakang kafe (radius 150–190) dan 9 karst terpisah di depan
  (115–160), lebih kecil dan jauh. Langit radius 220, kamera far 260, kabut 50–330.
- Matahari: cakram + pendar (lebih besar & oranye-keemasan dekat cakrawala), lens flare yang memudar bila
  matahari tertutup kafe/bukit (raycast 5×/detik). Preset Senja kini 2,5° di atas cakrawala; lampu menyala
  mulai matahari < 6°.
- `typecheck`, `format:check`, `build` lulus; `people.test` 8/8, `engine.test` 21/25.

## 16. Revisi dunia: area kafe, jalan, dan gunung sesuai referensi (25 Okt 2026)

- Tiang listrik di sepanjang jalan dihapus (kembali seperti sebelumnya).
- Tidak ada lagi gundukan di dalam area kafe. Seluruh lingkungan kafe (semua mesh model kecuali jalan)
  menjadi area situs; tanah di luarnya dinaikkan setinggi trotoar, di dalamnya turun landai di bawah
  lantai kafe — lantai asli dan kolam ikan tidak tertutup, tanpa garis tepi.
- Efek pudar ujung jalan model dan lalu lintas dikembalikan seperti sebelumnya (tetap dua arah).
  Jalan panjang memakai warna aspal & marka jalan kafe (Material.011 / Material.002).
- Perbukitan dekat dikembalikan ke versi sebelumnya.
- Gunung mengikuti referensi siluet: barisan di belakang berupa punggungan rendah berpuncak datar
  (radius 115–150, tinggi ±11–20); karst di depan 7 bukit kecil berpuncak membulat, posisi diacak dan
  berjarak (80–140).
- `typecheck`, `format:check`, `build` lulus; `people.test` 8/8, `engine.test` 21/25.

## 17. Lantai & kolam terlihat, gunung alami, pohon lebih sedikit, matahari tampil (25 Okt 2026)

- Tanah setinggi lantai beton kafe (`floor lantai 1`); tanah dipotong tepat di atas `floor lantai 1`,
  `floor lantai 1 area bar`, `Kolam ikan`, dan `trotoar` lewat shader (discard per persegi), jadi lantai
  beton dan kolam selalu terlihat tanpa z-fighting.
- Gunung belakang: dua baris lurus sejajar jalan (jarak 95 dan 130, panjang 520) yang menghilang di
  kejauhan; puncak campuran lancip/tumpul/datar (`peakShape` dengan ketajaman acak). Karst depan: 8 bukit
  kecil acak dari profil lathe (kerucut, kubah, meja), sebagian berpunuk dua.
- Pohon 140 → 55.
- Matahari: sprite digambar setelah kubah langit (sebelumnya tertutup langit) dengan blending normal;
  saat senja lebih besar & oranye; preset Senja 5° di atas cakrawala. Bulan juga digambar di atas langit.
- `typecheck`, `format:check`, `build` lulus; `people.test` 8/8, `engine.test` 21/25.

## 18. Tanah tanpa lubang (25 Okt 2026)

- Potongan tanah tidak lagi memakai kotak (kotak `floor lantai 1` mencakup area tanpa lantai di belakang
  kafe sehingga berlubang). Sekarang lantai, area bar, kolam, dan trotoar "difoto" dari atas sekali saat
  dimuat (render target ortografis, ≤1024 px); tanah hanya dibuang di dalam bentuk aslinya. Di tempat lain
  tanah utuh dan rata setinggi lantai beton, menyambung ke perbukitan tanpa patahan.
- `typecheck`, `format:check`, `build` lulus; `engine.test` 21/25 seperti sebelumnya.

## 19. Lampu interior dan neonbox (25 Okt 2026) — sebagian

- Lampu malam: dua lampu gantung (lembut), lampu di dalam kotak bar (posisi dari bounding box, di bawah
  atapnya), dua lampu utama di atas `meja 1` dan `meja 2` (depan rak buku), dua lampu di lantai 2 indoor
  (`meja atas 1` & `meja atas 2`). Neonbox: permukaan putih kotak di belakang logo ikut menyala saat malam
  (hanya mesh seukuran logo).
- Neonbox: hanya kotak di atas pagar (`Cube.041`, logo `Untitled_Artwork.001`); logo lain menempel di
  freezer dan tidak ikut menyala. Diperbaiki: efek menyala sempat mengenai panel `MeshBasicMaterial`
  (tidak punya emissive) sehingga error saat malam.

## 20. Jalan buatan sendiri, jembatan kayu, Milky Way (25 Okt 2026)

- Jalan model (`jalan poros`) disembunyikan (tetap dipakai untuk jalur mobil). Satu jalan buatan untuk
  seluruh scene: tekstur kanvas bergaya (bintik, jejak roda, tambalan aspal, retakan, marka tengah tidak
  seragam & pudar, bahu jalan berkerikil dengan tepi tidak rata), setinggi permukaan jalan model.
- Jembatan kayu kecil melengkung di titik sungai terdekat dengan kafe: 18 papan mengikuti lengkung,
  tiang & pegangan di kedua sisi, batu penopang di kedua ujung (tiga mesh gabungan). Jalan setapak tanah
  dari tepi jalan ke jembatan dan berlanjut di seberang.
- Milky Way: salinan 2k (`public/sky/milkyway-2k.jpg`, 0,7 MB, sumber ESO yang sama dengan teleskop)
  dimuat hanya saat langit cukup gelap; orientasi galaksi sama dengan teleskop.
- Mode pengembangan `?sceneStats`: kamera boleh mundur sampai 90 untuk memeriksa dunia.
- Dicek di browser: jalan & bahu, jembatan, malam (Bimasakti, lampu interior & lampu tali). `typecheck`,
  `format:check`, `build` lulus; `people.test` 8/8, `engine.test` 21/25.
