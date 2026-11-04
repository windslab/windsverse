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

## 21. Mode Explore: main jadi barista virtual (25 Okt 2026)

- Tombol **Explore** di scene kafe: layar penuh, pengunjung mengendalikan Luna (joystick di HP,
  WASD/panah di laptop, E/Spasi untuk aksi). Kamera mengikuti Luna dari atas belakang; lantai/atap di
  atas Luna dan dinding yang menghalangi pandangan disembunyikan sementara (dikembalikan saat keluar).
  Tombol "Pergi ke kasir / meja bar / mesin espresso / meja tamu" membuat Luna berjalan sendiri ke sana.
- Alur barista (`app/explore-mode.tsx`, aturan di `lib/barista-game.ts`): tamu datang dan antre →
  di kasir pilih menu yang diucapkan tamu, terima uang (20rb/50rb/100rb/pas), ambil kembalian dari
  laci → di meja bar pilih gelas (cangkir panas, gelas es, cup bawa pulang) dan takar bahan (SKM, susu
  full cream, gula, aren, bubuk cokelat/matcha/taro, sirup, teh, air, es, kopi tubruk) → menu kopi wajib
  memakai mesin espresso (tahan untuk menggiling, tamp, hentikan jarum di zona hijau; maks 3 shot) →
  antar ke meja tamu → tamu memberi bintang 1–5, komentar, dan poin.
- Menu diambil dari menu kafe (minuman saja); jika kosong memakai 6 menu contoh. **Resep asli tidak
  dipakai**: rasa yang diharapkan tamu dihitung dari nama menu + permintaan (manis/kuat), jadi pemain
  bebas meracik sendiri. Skor hanya di browser, tidak disimpan ke database.
- Tamu di dunia 3D memakai sistem tamu yang sudah ada (antre, duduk, menerima minuman).
- `?sceneStats` (khusus pengembangan) menambah `window.__explore` untuk tes; tidak aktif di production.
- Tidak ada file aset baru, jadi tidak ada `?v=` yang perlu dinaikkan.
- Dicek di browser (ukuran HP): satu putaran penuh kasir → kembalian → racik → espresso → antar →
  bintang. `typecheck`, `format:check`, `build` lulus; `barista.test` 5/5, `people.test` 8/8,
  `engine.test` 21/25 seperti sebelumnya.

## 22. Mode Explore: tangga, kamera CCTV, antrean, tampilan minimalis, duduk lesehan (25 Okt 2026)

- **Tangga**: Luna bisa naik-turun tangga melingkari pohon (ke lantai 2) dan tangga menuju box bar,
  baik dengan geser layar/WASD maupun "ke …". Langkah bebas sekarang memakai peta jalan per anak
  tangga (`cafePaths().step`), mengukur pijakan dari beberapa titik di sekitar kaki (menjembatani celah
  kecil di antara anak tangga box), dan berbelok mengikuti dinding/pagar di tangga yang sempit.
  Animasi: kaki depan terangkat lebih tinggi dan badan sedikit condong saat naik; turun dihaluskan.
- **Kolam**: dasar kolam tidak lagi dianggap lantai; Luna berhenti di tepi kolam.
- **Tidak ada objek yang dihilangkan** lagi. Kamera mengikuti Luna dan otomatis turun/mendekat bila
  atap atau dinding menghalangi. Saat Luna masuk box bar, kamera pindah ke **CCTV** di pojok atas
  dekat pintu samping box, lensa lebar dan terkunci (tidak bisa diputar); keluar box kembali normal.
- **Antrean**: tamu antre tepat di depan jendela kasir tempat Luna berdiri, orang berikutnya di
  belakangnya lalu barisan berbelok menyusuri trotoar (jalur sisi jalan tetap bisa dilewati). Barisan
  maju saat tamu terdepan selesai memesan.
- **Tampilan minimalis**: joystick tidak terlihat (geser layar di kiri bawah untuk berjalan); tombol
  besar diganti tulisan kecil di tengah layar ("Terima pesanan", "Ambil cangkir / cup", "Masukkan
  takaran", "Pakai mesin espresso", "Antar pesanan"). Kasir, pilihan gelas, takaran dan espresso
  tampil sebagai teks kecil yang tetap bisa disentuh. Tombol suara & siang/malam disembunyikan
  selama Explore.
- **Pesanan tamu**: nama menu dari menu website (di production otomatis menu asli; di komputer lokal
  yang kosong memakai menu contoh), kalimat bervariasi ("Americano nya 1 ya!", "Kak, … satu ya.",
  "dibungkus ya", "less sugar ya", "kopinya yang kuat", dll.). Rasa yang dinilai hanya yang diucapkan
  tamu. Resep asli tetap tidak dipakai.
- **Duduk**: tamu duduk tepat di kursi beton panjang dan kursi besi putih; di lantai 2 indoor
  (lesehan, meja atas 1 & 2) duduk bersila di lantai, 6 tempat per meja.
- Perbaikan lain: Luna menyusul tamu yang masih berjalan ke kursinya; tamu tidak lagi macet karena
  Luna diparkir di lorong (dan menyelip bila tertahan lama); klik "+" cepat terhitung semua.
- Pengembangan (`?sceneStats`, tidak aktif di production): `window.__scene` untuk memeriksa kamera,
  tamu dan posisi duduk.
- Dicek di browser (ukuran HP): tangga pohon, CCTV di box, antrean di jendela, kasir → cangkir →
  espresso 2 shot → takaran → antar → bintang; pose duduk di kursi beton, kursi besi dan lesehan.
  `typecheck`, `format:check`, lint file Explore, `build` lulus; `barista.test` 5/5,
  `people.test` 12/12 (4 tes baru: tangga & kolam, antrean, lesehan, Luna diparkir),
  `engine.test` 21/25 seperti sebelumnya. Tidak ada file aset baru, jadi `?v=` tidak berubah.

## 23. Explore: CCTV bisa diputar, jelajah dunia, duduk, Story of Winds, teleskop, bersih-bersih (26 Okt 2026)

- **CCTV box bar** pindah ke sudut kanan atas kaca jendela depan box (sisi pintu). Geser layar untuk
  memutar ke segala arah (kiri-kanan, atas-bawah). Lensa ultra-lebar garis lurus (kebalikan fisheye:
  garis tetap lurus, tepi gambar melebar) ±120° melintang, tinggi maksimum 120° di HP tegak.
- **Jelajah dunia**: dari tepi luar trotoar Luna bisa turun ke jalan, berjalan di padang dan bukit,
  menyusuri tepi sungai (tidak masuk air), menyeberang jembatan kayu, naik ke bukit menara (tidak
  menembus menara dan batang pohon). Masuk kembali ke kafe lewat trotoar. Kamera tidak masuk ke tanah.
  (`createCafeWorld().walkHeight`, `cafePaths().groundHit`, langkah luar di `scene-people.ts`.)
- **Duduk**: dekat kursi kosong mana pun (kursi besi, kursi beton, lesehan) muncul "Duduk"; Luna
  duduk dengan tangan di pangkuan; "Berdiri" atau menggeser layar membuatnya berdiri. Tamu tidak
  memakai kursi yang sedang diduduki Luna.
- **Story of Winds dari dalam scene**: tombol kecil "kamera" membuka kamera digital yang sama persis
  (film, jatah harian 08.00 WITA, album, Memoirs), tetapi lensanya mata Luna di dunia 3D. Geser
  layar LCD untuk membidik; tombol ⟲ untuk selfie Luna. Luna memegang kamera saat memotret.
- **Teleskop**: dekat teleskop muncul "Lihat teleskop" → Windstronout terbuka di atas mode Explore;
  saat ditutup kamera kembali di belakang Luna.
- **Bersih-bersih**: "Siram tanaman" dekat pot/planter (gembor + tetes air), "Lap meja" dekat meja
  (lap + gerakan memutar), "sapu" di pojok kanan bawah (sapu + debu). Masing-masing memberi poin
  kecil (+5 / +5 / +2), tanaman dan meja yang sama bisa diulang setelah 45 detik.
- Dialog (Windstronout, Story of Winds) kini tampil di atas layar penuh Explore.
- Dicek di browser (ukuran HP): CCTV di sudut kaca + putar dengan geser; keluar trotoar, menyeberang
  jalan, berhenti di tepi sungai; lap meja; duduk & berdiri; teleskop → Windstronout → kembali;
  kamera POV & selfie, jepret tersimpan di album dengan bingkai film; menyapu.
  `typecheck`, `format:check`, `build` lulus; `barista.test` 5/5, `people.test` 13/13 (1 tes baru:
  duduk/berdiri/pekerjaan), `engine.test` 21/25 seperti sebelumnya. Tidak ada aset baru, `?v=` tetap.

## 24. Explore: lari, buka/tutup kafe, hari lebih cepat, panah tamu, zebra cross, menara (26 Okt 2026)

- **Lari**: tahan Shift (keyboard), atau di HP satu jari menggeser di kiri bawah sambil jari lain
  menahan layar. Kecepatan 2×, langkah lebih panjang; kamera tidak ikut berputar oleh jari penahan.
- **Sapu** diperbaiki: batang condong ke depan dan ujungnya menyatu dengan sapu.
- **Buka / tutup kafe** (tombol kecil di sebelah jam): kafe mulai tutup, Luna bebas membuka kapan pun.
  Saat buka, tamu datang tidak tentu: tiap jam permainan dipilih sepi / lumayan / ramai (jam makan
  siang dan sore lebih sering ramai, larut malam lebih sering sepi). `crowdFor()` di `barista-game`.
- **Waktu permainan** tidak mengikuti jam asli: 1 jam permainan = 1 menit asli, mulai 08.00; langit,
  matahari, lampu malam ikut jam ini (`sky.update(..., clock)`).
- **Panah penunjuk** oranye berputar di atas tamu yang pesanannya sedang dibawa (terlihat menembus
  dinding).
- **Lalu lintas**: mobil kini melaju sepanjang jalan dunia (±135 dari kafe), muncul dari kejauhan dan
  memudar pelan hanya di ujung jalan; 3 kendaraan per jalur dengan jarak aman. **Zebra cross** di
  depan trotoar kafe: saat Luna mendekat/di atasnya, mobil di kedua jalur mengerem dan berhenti
  sebelum garis.
- **Menara observatorium**: jalan setapak batu marmer dari pinggir jalan ke pintu menara, bebatuan
  marmer di sekitar bukit, tiga anak tangga ke alas, **pintu** yang bisa dimasuki, **tangga spiral**
  menempel di dinding dalam (3 putaran, 60 anak tangga) sampai **balkon** berpagar di puncak sekitar
  kubah. Papan kayu "CHAPTER 4 : LOCKED" di depan menara. Kamera ikut menghindari dinding menara.
- Dicek di browser (ukuran HP): menara dari jauh; Luna masuk pintu, naik tangga spiral sampai balkon
  (pagar menahan); zebra cross dan mobil berhenti; lari 2× jalan; buka kafe → tamu datang; panah
  di atas tamu. `typecheck`, `format:check`, `build` lulus; `barista.test` 6/6 (1 baru: keramaian),
  `people.test` 13/13, `engine.test` 21/25 seperti sebelumnya. Tidak ada aset baru, `?v=` tetap.

## 25. Explore yang lebih cozy: menara perpustakaan, lampu meja, bulan besar, kunang-kunang (26 Okt 2026)

- **Tutup kafe** → semua tamu pulang, bar dibersihkan. **Ulasan/bintang dihapus**: tamu selalu puas,
  mengucapkan terima kasih (kalimat bervariasi) dan memberi poin.
- **Animasi jalan & lari lebih imut**: badan memantul tiap langkah (melompat kecil saat lari), lengan
  berayun lebar sedikit keluar, badan bergoyang kiri-kanan dengan kepala miring berlawanan; lari
  memompa lengan yang ditekuk dan condong ke depan.
- **Kamera Explore lebih bebas**: bisa diputar dari atas sampai sedikit di bawah mata Luna untuk
  melihat langit, zoom 1,8–9; kamera tetap di atas lantai/tanah.
- **Menara baru mengikuti lukisan referensi**: lebih lebar, dinding plester merah muda dengan tambalan
  bata, 4 cincin batu, jendela kecil melengkung dengan lentera, **jendela kaca bulat besar di lantai 4**,
  alas berbatu, **pintu besar melengkung** dengan daun pintu terbuka, anak tangga dari tanah (jumlahnya
  menyesuaikan lereng), balustrade pilar di atap. **Isinya perpustakaan**: tangga spiral 4 putaran
  **berpagar**, rak buku penuh buku warna-warni mengikuti tangga sampai puncak, karpet bulat di lantai
  1, **lampu gantung berbentuk buku terbuka** dengan halaman menggantung. Puncak kosong, hanya **ruang
  kecil beratap miring** selebar tangga yang menutup ujung tangga. Malam: lentera, jendela bulat dan
  lampu buku menyala hangat + satu lampu di dalam menara.
- **Jalan setapak marmer** kini mulai dari belakang Winds Space, berkelok-kelok, batunya berjarak.
- **Bulan** jauh lebih besar dengan permukaan lembut dan cahaya halus; **matahari senja** lebih besar.
- **Kunang-kunang** di malam hari dan **kupu-kupu** di pagi hari (06–11), muncul di tempat acak di
  sekitar kafe dan menara (`lib/cafe-critters.ts`).
- **Malam di kafe lebih hidup**: lampu kecil putih hangat di setiap meja (kap menyala, pendar, dan
  genangan cahaya di meja — efek cahaya, bukan lampu asli, supaya HP tetap lancar); lampu interior
  dibuat 30% lebih terang.
- Pengembangan: `window.__explore.time(2100)` mengatur jam permainan (hanya `?sceneStats`).
- Dicek di browser (ukuran HP): menara dari jauh dan perpustakaan di dalam; simulasi jalan naik dari
  padang → anak tangga → pintu → 4 putaran tangga → atap, pagar dan dinding menahan; lampu meja malam;
  bulan besar; jendela bulat menyala; kunang-kunang & kupu-kupu muncul. `typecheck`, `format:check`,
  `build` lulus; `barista.test` 6/6, `people.test` 13/13, `engine.test` 21/25 seperti sebelumnya.
  Tidak ada aset baru, `?v=` tetap.

## 26. Menara mercusuar, kamera di dalam menara, lilin, langit malam lembut, sungai bercabang (26 Okt 2026)

- **Menara** sedikit mengecil ke atas seperti mercusuar. **Pintu**: kotak di atas lengkungan hilang
  (hanya sudut lengkungan yang diisi), daun pintu membuka ke dalam. **Tangga masuk memutari alas
  menara** dari kaki jalan setapak sampai pintu (jumlah anak tangga menyesuaikan lereng). Batu-batu
  kini **tertanam di bukit** (sepertiga terbenam) dan **padat** (Luna tidak menembus), tidak lagi
  berbentuk cincin donat dan tidak menutupi tangga.
- **Perpustakaan** hanya sampai lantai 3; **jendela bulat besar** kini benar-benar berlubang dengan
  kaca tipis, dan letaknya lurus dengan tangga pada ketinggian itu sehingga dari tangga bisa melihat
  keluar.
- **Lampu buku**: 9 tali panjang menggantung utuh dari puncak; tiap tali membawa 1–3 buku terbuka di
  ketinggian acak sampai lantai 2.
- **Atap**: lantai atap kini terbuka tepat di atas ujung tangga (sebelumnya sudut lubangnya keliru
  sehingga Luna seperti menembus langit-langit); ruang beratap miring menaunginya.
- **Kamera di dalam menara**: lensa lebar (86°), tidak lagi zoom ke Luna, dan tetap di dalam dinding
  menara walau digeser.
- **Malam di menara**: 3 lampu hangat di dalam + lampu di atas pintu, lentera/jendela/lampu buku
  menyala.
- **Langit malam** kafe kini indigo-lila lembut yang serasi dengan warna scene (teleskop tetap langit
  hitam asli); kabut malam ikut.
- **Lilin** menggantikan lampu meja: lilin di piring kecil dengan nyala berkedip, pendar dan genangan
  cahaya hangat yang lebih luas; lampu interior 50% lebih terang. Lampu yang melayang di tengah lantai
  2 outdoor dihapus (itu "meja atas luar", sebenarnya atap, bukan meja).
- **Sungai bercabang**: 4 anak sungai berkelok dari sungai utama ke arah perbukitan (ikut membentuk
  lembah, ditanami pohon tidak di airnya, tidak bisa dilewati Luna).
- **Kupu-kupu** dibuat kecil.
- Dicek di browser (ukuran HP): menara luar siang & malam, simulasi jalan dari kaki tangga memutar →
  pintu → tangga dalam → atap lolos, kamera lebar di dalam menara dengan Luna di depan jendela bulat,
  atap dengan lubang tangga di bawah ruang kecil, lilin malam dan langit lembut, sungai bercabang dari
  atas. `typecheck`, `format:check`, `build` lulus; `barista.test` 6/6, `people.test` 13/13,
  `engine.test` 21/25 seperti sebelumnya. Tidak ada aset baru, `?v=` tetap.

## 27. Kamera santai, lompat, ruang tamu menara, danau hati, burung, matahari terbit di depan kafe (26 Okt 2026)

- **Kamera** lebih santai: hanya benda besar (dinding, lantai, atap) yang bisa mendekatkan kamera —
  kursi, meja, tanaman tidak; benda tepat di samping Luna diabaikan; jarak minimum 1,6; geraknya
  pelan (tidak ada zoom tiba-tiba).
- **Lompat**: Spasi (laptop) atau ketuk 2× (HP); pose lompat ceria. Tombol aksi kini **E**.
- **Turun dari kafe** bisa di mana saja di pinggir site (ujung trotoar, sisi jalan, belakang) asal
  tidak terhalang dinding; **anak tangga beton** baru di belakang kafe (di balik pojok baca) ke rumput.
- **Menara**: jendela bulat besar di lantai 4 kini **menghadap kafe/jalan raya**; **tangga masuk
  dimulai dari ujung jalan setapak marmer** di sisi depan. Tangga dinding (perpustakaan) **berhenti di
  lantai 4**: **ruang tamu** dengan sofa, piano + kursi, gitar, cello, meja belajar (kursi, lampu,
  buku) dan **bingkai kosong** yang bisa diisi foto Story of Winds dari mode Explore ("Pasang foto di
  bingkai" saat berdiri di dekatnya; tersimpan di perangkat). **Tangga spiral di tengah** naik ke
  **lantai 5 terbuka** (pagar batu + 8 pilar silinder) dan **rooftop**; ruang beratap miring dihapus.
  Lampu buku menggantung dari bawah lantai 4.
- **Kunang-kunang** juga di sepanjang jalan setapak ke menara, jalan ke jembatan, dan jembatan.
- **Burung**: sesekali (tiap 1–2 menit, siang) sekawanan kecil terbang melintas berformasi V.
- **Gunung** di belakang menara dipindah jauh (±140–210) dan dibuat jauh lebih besar; bukit karst di
  seberang sungai juga lebih jauh & besar. Batas jalan Luna 92 dari kafe, jadi tidak tergapai.
- **Pinggiran dunia memudar** ke warna kabut/langit (tanah, sungai, jalan, pohon) seperti semesta
  kecil yang melayang.
- **Bintang & Bima Sakti** lebih terang dan besar di atas langit malam yang lembut.
- **Sungai** memanjang sampai ujung peta; cabang kecil diganti **danau besar berbentuk hati** (tepian
  alami bergelombang) yang tersambung ke sungai lewat saluran; dari menara bentuk hatinya terbaca.
- **Matahari terbit di depan Winds Space** (arah jalan raya) dan tenggelam di belakangnya.
- Dicek di browser (ukuran HP): menara luar & ruang tamu; simulasi jalan dari jalan setapak → tangga
  luar → tangga dinding → lantai 4 → tangga tengah → lantai 5 → atap; turun dari ujung utara/selatan
  trotoar, sisi jalan, dan keluar lewat belakang; danau hati dari atas; matahari pagi di depan kafe.
  `typecheck`, `format:check`, `build` lulus; `barista.test` 6/6, `people.test` 13/13,
  `engine.test` 21/25 seperti sebelumnya. Tidak ada aset baru, `?v=` tetap.

## 28. Kamera stabil, laut & dermaga, danau hati di kiri, alat musik detail, lubang tangga menara (26 Okt 2026)

- **Kamera stabil**: sudut pilihan pemain tidak lagi diubah otomatis (tanpa pencarian sudut yang
  membuat glitch); kamera hanya mendekat jika dinding/atap menghalangi lebih dari ±0,5 detik, dan
  menunggu ±1 detik sebelum mundur lagi; gerak dekat-jauh sangat pelan; jarak minimum 1,8.
- **Gunung belakang** dipindah sangat jauh (±190–215) dan diperkecil sehingga tampak kecil & samar di
  cakrawala, tidak menutupi langit.
- **Bukit karst di depan kafe dihapus**; diganti **laut lepas**: daratan di seberang sungai turun ke
  **pantai pasir** lalu laut (air bergelombang lembut dengan kilau). **Dermaga kayu** menjulur 20 m ke
  laut (bisa dijalani Luna, ada pagar & tiang), dan **1 perahu nelayan** (lambung putih, garis biru,
  kabin atap merah, tiang bendera) bergoyang pelan di sampingnya. Luna tidak bisa masuk ke laut.
- **Sungai** utama mengalir sampai ujung peta (bertemu laut).
- **Danau hati** dipindah ke **ujung kiri** dan dikecilkan, diisi oleh **dua anak sungai kecil
  berkelok** dari sungai utama (satu bercabang); lembahnya sempit dan alami.
- **Ruang tamu**: kursi piano dan kursi belajar kini **berkaki**; sofa berkaki. **Piano** tegak dengan
  29 tuts putih dan tuts hitam berpola 2–3 asli, pipi kiri-kanan, kaki depan, 3 pedal kuningan.
  **Gitar** berbadan lekuk angka-8, lubang suara + rosette, bridge, papan fret dengan fret, kepala
  dengan pasak, 6 senar. **Cello** berlekuk, f-hole, bridge, papan jari hitam, scroll, endpin, 4 senar.
  Semua di atas stand.
- **Lubang tangga**: lubang di lantai 4 diperlebar sehingga kepala Luna tidak membentur langit-langit;
  pita batu lantai 5 tidak lagi menutup tengah (dulu silinder padat); lantai 5 dan atap kini hanya
  berlubang di atas jalur tangga tengah yang naik, sisanya **pijakan** — tangga terakhir tiba di
  lantai, bukan di lubang.
- Dicek di browser (ukuran HP): laut/pantai/dermaga/perahu, danau hati & anak sungai dari atas,
  gunung dari kafe, piano/gitar/cello; simulasi jalan dari jalan setapak sampai atap (melangkah dari
  tangga tengah ke pijakan atap) lolos. `typecheck`, `format:check`, `build` lulus; `barista.test` 6/6,
  `people.test` 13/13, `engine.test` 21/25 seperti sebelumnya. Tidak ada aset baru, `?v=` tetap.

## 29. Musim hujan & petir, payung Luna, kucing chibi, meteor, dandelion, perbaikan animasi (27 Okt 2026)

- **Kabel lampu gantung** di area duduk kini samar dan putus-putus (tidak lagi garis gelap tegas).
- **Bulan** berwarna kuning hangat (kawah dan cahaya sekelilingnya ikut hangat).
- **Musim hujan** (`lib/cafe-weather.ts`): sesekali (beberapa menit kering, lalu 1,5–3 menit hujan)
  langit menjadi **mendung kelabu** (matahari, bulan, bintang, dan meteor tertutup), awan badai gelap
  bergulung di atas, **hujan** turun di sekitar kamera, kabut lebih tebal, serangga & burung
  berteduh. Saat hujan deras, **petir** berkilat di dalam awan: awan menyala di titik petir, ada
  garis kilat bercabang, dan seluruh scene terang sekejap. Hujan tidak tampak di dalam menara.
- **Payung Luna**: jika hujan dan tidak ada atap di atas kepalanya (dicek dengan sinar ke atas
  terhadap kafe & menara), Luna otomatis membuka **payung transparan bergagang putih** (gagang
  berkait, rusuk putih, kanopi bening) yang dipegang tangan kanannya. Payung disimpan saat duduk,
  menyapu, menyiram, mengelap, memotret, atau mengantar pesanan.
- **Rompi Luna**: bagian kiri rompi abu-abu terang, bagian kanan tetap seperti semula.
- **Alat di tangan Luna**: sapu, gembor, lap, dan kamera kini mengikuti posisi tangan Luna setiap
  saat. Sapu dipegang dua tangan, gagangnya menyambung ke ijuk yang mengayun di lantai.
- **Tamu minum lebih detail**: cangkir diletakkan di meja; tamu meraih cangkir, mengangkatnya ke
  mulut, memiringkannya sambil sedikit mendongak (menyeruput), lalu meletakkannya kembali. Tiap tamu
  punya irama sendiri.
- **Duduk menghadap meja**: arah duduk dihitung ke sisi meja terdekat (bukan titik tengahnya), jadi
  semua yang duduk di sepanjang meja panjang dan lesehan menghadap lurus ke meja.
- **Kucing chibi putih-oranye** (`lib/cafe-cat.ts`): kepala besar, mata bulat berkilau, hidung pink,
  mulut ":3", pipi merona, telinga oranye, tambalan oranye di punggung & kepala, ekor oranye berujung
  putih. Ia berjalan ke tempat acak di kafe dan sekitarnya (tidak ke jalan raya, kolam, atau air),
  **menjilati bulu**, **duduk santai**, **tidur meringkuk** (mata terpejam, napas pelan),
  **bermain** (merunduk, goyang pantat, menerkam, mencakar udara), dan **melompat** naik-turun
  pinggiran seperti kucing. Kadang menoleh ke Luna jika Luna dekat.
- **Meteor** sesekali melintas di langit malam yang cerah (biasanya di depan kamera).
- **Dandelion**: rumpun-rumpun bunga dandelion (kepala biji putih, sebagian masih bunga kuning)
  tersebar di padang rumput, bergoyang tertiup angin; sesekali bijinya terbang terbawa angin.
- Dicek di browser (ukuran HP): kabel, hujan siang & malam, langit mendung, kilat (angka kilatan),
  payung Luna di trotoar saat hujan, sapu di tangan, tamu minum & arah duduk (meja 3 dan 5), pose
  kucing (jalan, duduk, menjilat, tidur, main), meteor, tekstur bulan, dandelion.
  `typecheck`, `format:check`, `build` lulus; `barista.test` 6/6, `people.test` 13/13,
  `engine.test` 21/25 seperti sebelumnya. Tidak ada aset baru, `?v=` tetap.
- Alat tes pengembangan (`?sceneStats`): `__scene.rain(true/false/null)`, `__scene.strike()`,
  `__scene.weather()`, `__scene.cat()` (dengan `act('sleep')` dll.) — tidak aktif di website asli.

## 30. Hujan bertahap & pelangi, dandelion menyala, efek suara di seluruh dunia (27 Okt 2026)

- **Dandelion menyala** kuning hangat di malam hari: kepala bunga berpendar dengan lingkaran cahaya
  lembut, biji yang terbang ikut hangat. Siang hari tetap putih/kuning biasa.
- **Hujan bertahap** (`lib/cafe-weather.ts`): cerah → **mendung** perlahan (±30–45 dtk) → **gerimis**
  (tetes sedikit, pendek, lambat) → **makin deras** → **deras** (dengan petir) → **mereda** ke gerimis →
  **gerimis akhir** → **berhenti** (awan menipis pelan) → **pasca hujan** dengan **pelangi lembut**
  berwarna pastel di sisi berlawanan matahari (hanya siang dan saat matahari tidak terlalu tinggi) →
  cerah lagi. Kadang hujannya hanya gerimis saja. `__scene.rain(true/false)` untuk tes.
- **Efek suara** (`lib/cafe-sound.ts`, semuanya dibuat langsung oleh browser, tanpa file audio
  baru), aktif lewat tombol suara di kafe dan tombol baru **"suara"** di mode Explore:
  - **Langkah kaki** Luna berbeda per permukaan: rumput, beton (trotoar/tangga), lantai dalam kafe,
    kayu (lantai 2, dek, dermaga, jembatan), pasir, aspal, kerikil (jalan setapak ke jembatan), batu
    (jalan marmer & dalam menara, dengan sedikit gema). Lari lebih keras; saat hujan ada cipratan.
    Mendarat dari lompatan berbunyi "buk", melompat ada desir kecil.
  - **Bersih-bersih**: desir sapu tiap ayunan, gosokan lap, kucuran air gembor.
  - **Membuat minuman** (Explore): koin & mesin kasir, ambil cangkir, menuang takaran, adukan sendok,
    grinder (selama tombol ditahan), tamp, desis mesin espresso & tetesan, denting cangkir dan nada
    kecil saat mengantar. Saat barista bekerja sendiri, mesin terdengar sesekali dari bar.
  - **Ambience**: angin lembut (lebih kencang saat mendung dan di tempat tinggi), **gerimis** (desis
    halus + tetes), **hujan deras** (teredam dan terdengar menimpa atap bila kamera di bawah atap),
    tetes hujan di **payung** Luna, **petir** yang bergemuruh beberapa saat setelah kilat (makin jauh
    makin lambat & pelan), **jangkrik** di malam hari (diam saat hujan), **kicau burung** saat kawanan
    burung lewat, **ombak** saat dekat laut, **gemericik sungai** saat dekat sungai, **kucing**
    mengeong menyapa saat Luna mendekat dan sesekali, serta **mendengkur** saat tidur/menjilat bulu
    di dekat Luna.
  - Suara datang dari arahnya (kiri/kanan) dan makin pelan jika jauh dari Luna.
- Suara lama (angin + kicau acak + api) diganti sistem baru; kicau burung kini hanya saat burung lewat.
- Perbaikan kecil: jika mode Explore dibuka sebelum Luna selesai dimuat, kendali kini tetap aktif
  setelah Luna siap (sebelumnya Luna bisa tidak bisa digerakkan). Saat scene dimuat ulang, tombol
  suara kembali "mati" agar sesuai keadaan sebenarnya.
- Dicek di browser (ukuran HP): urutan cuaca mendung → gerimis → deras → reda → pelangi, dandelion
  malam, tombol suara di Explore, dan level suara terukur untuk langkah kaki (lantai/trotoar/rumput),
  meong & dengkur kucing, sapu/lap/gembor, petir, hujan, dan semua efek membuat minuman.
  `typecheck`, `format:check`, `build` lulus; `barista.test` 6/6, `people.test` 13/13,
  `engine.test` 21/25 seperti sebelumnya. Tidak ada aset baru, `?v=` tetap.

## 31. Digicam video & tripod, tas Luna, main musik, baca & rebahan, atap menara lebar (28 Okt 2026)

- **Langkah di rumput** dibuat empuk dan enak didengar: desir rumput yang teredam, beberapa
  "kresek" lembut, dan hentakan ringan (tanpa desis tinggi yang cempreng).
- **Pelangi** lebih tebal, lebih lembut (tepinya berpendar halus), dan kedua ujungnya memudar ke
  udara sebelum menyentuh tanah.
- **Menara**: atap (rooftop) jauh lebih lebar seperti teras pandang; pagar lantai 5 dan pagar atap
  dibuat lebih pendek (di bawah tinggi Luna). Papan kini bertuliskan **"SECRET CHAPTER : COMING
  SOON"**.
- **Gitar & cello lebih detail**: leher dan fingerboard menyambung ke badan, nut, fret dengan jarak
  asli; setiap senar berjalan dari pin bridge/tailpiece → saddle/bridge → nut → pasaknya masing-
  masing (head gitar miring dengan 6 tuner; pegbox cello dengan 4 pasak dan scroll), pickguard dan
  rosette pada gitar, tailpiece dan endpin pada cello. Masing-masing punya kursi bulat kecil.
- **Luna bisa bermain musik** (di ruang tamu menara): **piano** (duduk di kursi piano, jari menari
  di tuts), **gitar** (dipangku, menggenjreng), **cello** (di antara lutut, menggesek dengan busur).
  Alat musik diambil dari standnya selama dimainkan. Saat suara aktif terdengar musiknya: arpeggio
  piano, genjrengan gitar, dan gesekan cello yang lembut (progresi C–Am–F–G).
- **Bersantai**: duduk santai atau **rebahan di sofa**, **rebahan di rumput** di mana saja di luar
  kafe, dan **duduk di ujung dermaga** dengan kaki menjuntai ke arah laut. Tombol "Berdiri" /
  "Bangun" / "Berhenti main" untuk selesai.
- **Tas Luna (inventory)** — tombol "tas" di Explore:
  - **Buku catatan**: menulis ide atau kutipan; tersimpan di browser ini (bisa dihapus).
  - **Buku bacaan** "Catatan dari Teras" (tulisan pendek baru, 5 halaman): Luna duduk membaca (di
    sofa jika dekat, atau di tempatnya) sambil halaman tampil di atas layar.
  - **Digicam**: mode **foto** dan **video**; zoom 1–4×, putar gambar (miring kiri/kanan/lurus),
    geser layar untuk membidik, selfie; **merekam sambil Luna berjalan** (hingga 1 menit, ikut
    merekam suara dunia bila suara aktif). Hasil bisa disimpan ke perangkat, atau foto dipasang di
    bingkai menara.
  - **Tripod**: dipasang di tempat lapang di depan Luna (tidak menembus dinding), lalu memotret
    (dengan timer 3/10 detik) atau merekam Luna sendiri; bisa diambil kembali.
  - **Kamera Story of Winds** tetap ada.
- Dicek di browser (ukuran HP): piano, gitar, cello, rebahan di sofa, duduk di ujung dermaga,
  membaca, buku catatan, rekaman video berjalan + zoom + putar, foto tripod dengan timer, atap
  menara, detail gitar, dan pelangi sore. `typecheck`, `format:check`, `build` lulus;
  `barista.test` 6/6, `people.test` 13/13, `engine.test` 21/25 seperti sebelumnya. Tidak ada aset
  baru, `?v=` tetap.

## 32. Windstopia: pulau terbuka, pegunungan di belakang, pantai di depan, kabut lantai kafe (29 Okt 2026)

- **Kabut tipis di lantai paling bawah kafe**: enam lapis kabut setinggi mata kaki sampai lutut
  menyelimuti lantai 1 dan halaman kafe, bergeser pelan, memudar halus di tepi area kafe. Dari atas
  tampak tipis; dari samping terasa lebih tebal (seperti berjalan di atas awan). Malam hari
  berwarna lilac lembut. Lantai 2 dan area bar yang lebih tinggi tidak terkena.
- **Dunia menjadi pulau** (`lib/cafe-world.ts`): garis pantai di semua sisi (persegi membulat yang
  tidak rata; bagian depan tetap lurus untuk dermaga dan perahu), **laut luas** di sekeliling sampai
  cakrawala, pantai pasir di setiap sisi, sungai bermuara ke laut di kiri dan kanan.
  Jalan tetap melintang dan berakhir di dekat pantai. Wilayah yang bisa dijalani Luna kini seluruh
  pulau (dulu hanya radius 92 dari kafe); laut dalam tetap tidak bisa dimasuki.
- **Pegunungan di belakang**: massif dengan puncak-puncak (setinggi ±50), kaki bukit hijau, lereng
  hijau berbatu, abu-abu di atas dan puncak pucat. Bisa didaki; dinding terjal di puncak
  tidak bisa dipanjat. Deretan gunung jauh lama (di luar jangkauan) dihapus.
- **Hutan dan bunga** tersebar di seluruh pulau (190 pohon, makin jarang di lereng; dandelion
  hingga 56 rumpun).
- **Sistem open world**: `lib/windstopia-map.ts` memuat tempat-tempat bernama; dunia melaporkan
  Luna berada di tempat mana (`regionAt`); saat tiba, nama tempat muncul sebentar di layar dan
  kunjungan pertama dicatat (simpanan browser). Dasar untuk menaruh cerita dan petunjuk nanti.
- Lore: `LORE_WINDSTOPIA.md` ditambah bagian "Peta pulau".
- Dicek di browser: pulau dari atas (pantai depan, dermaga, muara sungai, laut), pegunungan dari
  kafe dan dari lereng, Luna berlari dari kafe sampai puncak (nama tempat berganti: Jalan Pulau →
  Padang Rumput → Kaki Pegunungan → Pegunungan → Puncak), kabut lantai bawah (siang, dari dekat),
  performa tetap 60 fps. `typecheck`, `format:check`, `build` lulus; `barista.test` 6/6,
  `people.test` 13/13, `engine.test` 21/25 seperti sebelumnya. Tidak ada aset baru, `?v=` tetap.

## 33. Kembali ke versi sebelum desa; kabut di kaki gunung, gunung lebih jauh dari menara (30 Okt 2026)

- Atas permintaan pemilik proyek, **desa gaya Swiss dibatalkan** (rumah chalet, sawah, kebun, jalan
  setapak berliku, warga dan sapi sementara): kode dikembalikan ke keadaan sebelum perubahan itu
  (`git revert` dari commit b156909; riwayatnya tetap ada di git bila nanti ingin dipakai lagi).
- **Kabut** dihapus dari kafe dan kini hanya **tiga lapis kabut tipis di kaki gunung**, mengikuti
  bentuk tanah dan bergeser pelan.
- **Gunung dimundurkan**: pulau diperpanjang ke belakang (pantai belakang di ±280 dari jalan) dan
  deretan gunung baru mulai menanjak jauh di belakang menara. Di sekitar menara tanahnya tetap
  landai (tinggi 0–3), jadi hanya menara yang menjulang di area itu; gunung baru terlihat di kejauhan
  (mulai ±150 dari menara).
- Nama tempat (Kaki Pegunungan, Pegunungan) disesuaikan ke jarak baru.

## 34. Mode Bangun dibatalkan; sungai lama tetap hilang (30 Okt 2026)

- Atas permintaan pemilik proyek, **mode bangun bebas dihapus** (kode dikembalikan dengan `git revert`
  dari commit cfe13ce; riwayatnya tetap ada di git bila nanti ingin dipakai lagi).
- **Tetap dipertahankan**: perbaikan "sungai lama": cekungan tanah di tengah pulau ditinggikan supaya
  air laut tidak lagi terlihat sebagai kolam/garis air di dalam pulau.

## 35. Garis hitam di sungai dan laut dihilangkan (30 Okt 2026)

- Garis hitam (outline) yang muncul di tepi sungai, muara, dan pantai dihilangkan. Permukaan air (sungai,
  danau, laut) kini menandai dirinya di pass outline (`markSurface` di `lib/toon.ts`: air menulis alpha
  0,5 dan tanah 0,8), lalu garis tidak digambar di atas air maupun di tanah yang bersebelahan dengannya.
  Benda lain (jembatan, dermaga, perahu, karakter) tetap punya garis tepi seperti biasa.
- Dicek di browser: sungai di dekat jembatan dan pantai/muara dari atas; `typecheck`, `format:check`,
  `build` lulus; `people.test` 13/13, `barista.test` 6/6, `engine.test` 21/25 seperti sebelumnya.

## 36. Cadangan foto menu dari AI Studio (31 Okt 2026)

- Foto menu asli (ilustrasi gelas bergaya gambar tangan dengan logo Winds Space, 424 × 600) diambil
  dari aplikasi Google AI Studio pemilik (windsverse.ai.studio) karena file aslinya di iPad terhapus.
  Disimpan di folder `menu-photos/` (39 file, sekitar 3 MB, nama file = nama menu). Folder ini hanya
  cadangan; tidak ikut disajikan oleh website.
- 33 menu punya foto asli; 6 file berisi gambar yang sama dengan menu lain (varian milkshake/yogurt).
  22 menu lain di AI Studio hanya memakai foto contoh Unsplash, jadi tidak diambil.
- Foto dipasang ke menu lewat halaman admin (unggah per menu). Resep tidak ikut diambil.

## 37. Persiapan pindah hosting ke akun Cloudflare sendiri (31 Okt 2026, branch hosting-cloudflare)

- **Login pemilik tanpa ChatGPT**: aktivasi pemilik pertama kini memakai **kode penyiapan** rahasia
  (`OWNER_SETUP_CODE`, disimpan di Cloudflare, tidak di repo), dibatasi 5 percobaan per 15 menit.
  Formulir aktivasi meminta kode, nama pemilik, ID, dan PIN. `app/chatgpt-auth.ts` dihapus.
- **Kafe baru dibuat otomatis** saat aktivasi pertama di database kosong (dulu dibuat oleh Sites):
  baris kontrol, akun pemilik sebagai admin, kategori bawaan, pengaturan kafe, dan tier gaji.
- **Konfigurasi Cloudflare** di `cloudflare.json` (nama worker, ID D1, nama bucket R2; bukan
  rahasia). Selama ID D1 kosong, build sama seperti untuk Sites. Perintah baru: `npm run cf:deploy`
  (build + migrasi + unggah), `npm run cf:migrate`, `npm run cf:setup-code`.
- **Pindah data lama**: `scripts/filter-backup.mjs` membuat paket cadangan yang hanya berisi menu,
  kategori, foto menu, bahan/HPP, resep (ditambah pengaturan kafe dan tier gaji yang wajib untuk
  pemulihan). Paket dipulihkan lewat admin → Cadangan & pemulihan. Paket berisi resep asli dan
  disimpan di luar repo.
- Panduan langkah demi langkah: `HOSTING_CLOUDFLARE.md`. Konfigurasi Sites (`.openai/hosting.json`)
  tidak diubah.
- Diuji di komputer dengan database kosong memakai hasil build produksi: migrasi, kode salah
  ditolak, aktivasi pemilik, lalu pemulihan paket menu (49 menu, 9 kategori, 39 bahan, 45 resep,
  42 foto menu tampil di halaman menu). `typecheck`, `format:check` lulus; `barista.test` 6/6,
  `engine.test` 21/25 seperti sebelumnya.

## 38. Website pindah ke Cloudflare milik sendiri (31 Okt 2026, branch hosting-cloudflare)

- D1 `winds-space-db` dan R2 `winds-space-files` dibuat di wilayah Asia (APAC); database dimigrasi.
- Worker `winds-space` dideploy, pemilik diaktifkan dengan kode penyiapan, lalu menu (49), foto menu
  (42), bahan/HPP (39), dan resep (45) dipulihkan dari paket saringan.
- Domain `windsverse.com` dihubungkan: nameserver Rumahweb diganti ke Cloudflare, catatan DNS lama
  ke Sites dihapus, `windsverse.com` dan `www.windsverse.com` dipasang sebagai custom domain worker
  (`cloudflare.json` → `domains`).
- Dicek: halaman utama dengan scene 3D dan tombol Explore, menu dengan foto, login, tanpa error
  konsol, di domain asli.

## 39. Absensi fleksibel: kehadiran per shift, bukan jam kerja (1 Nov 2026)

- **Cek in kapan saja** dan otomatis masuk ke shift karyawan hari itu dari kalender (tanpa memilih
  shift, tanpa batas jam). Hari usaha berganti pukul 05.00 WITA, jadi shift malam yang lewat tengah
  malam tetap terhitung tanggal mulainya.
- **Transaksi ikut akun**: pesanan yang diinput karyawan masuk ke shift tempat ia cek in, jam
  berapa pun diinput (misalnya karyawan pagi menginput catatan bukunya malam hari). Beberapa shift
  boleh berjalan bersamaan.
- **Cek out kapan saja**; shift selesai setelah semua yang hadir cek out dan pesanannya selesai.
  **Admin bisa menutup shift kapan saja** (yang masih cek in otomatis dicek out). Cek out yang
  terlupa ditutup otomatis saat karyawan itu cek in di shift berikutnya.
- **Full day**: tombol baru di kalender; karyawan yang dipilih masuk ke semua shift tanggal itu dan
  dibayar untuk setiap shift. Di halaman pertama ada tombol "Cek out & lanjut shift malam".
- **Pengganti**: karyawan yang tidak dijadwalkan bisa cek in sebagai pengganti dengan memilih
  shift hari itu; ia masuk roster shift tersebut dan tercatat "Pengganti".
- **Tombol Cek in / Cek out di halaman pertama** (Ringkasan), satu ketukan. Kasir menunjukkan
  pengingat bila karyawan belum cek in.
- **Tidak ada lagi "Data telah berubah di perangkat lain"** saat menekan tombol: aplikasi mengambil
  data terbaru dan mencoba sekali lagi otomatis.
- **Karyawan tidak keluar otomatis setelah 1 jam** tidak dipakai (tetap masuk sampai 12 jam).
  Admin tetap keluar setelah 1 jam tidak dipakai.
- Gaji tetap dihitung dari **laba shift** dengan tier gaji (keputusan pemilik: dicoba dari laba).
- Tes baru (6) di `tests/engine.test.ts`; tes "admin tidak bisa menutup shift sebelum semua cek out"
  disesuaikan dengan aturan baru. `engine.test` 27 lulus, 4 gagal yang sama seperti sebelumnya;
  `barista.test` 6/6; `typecheck`, `format:check`, `build` lulus. Dicek di browser (ukuran HP) dengan
  database uji lokal: cek in pukul 00.12, cek out saat data berubah dari perangkat lain (otomatis
  dicoba ulang), shift tertutup dengan gaji tier, tombol Full day di kalender.

## 40. Deploy absensi fleksibel; alamat cadangan workers.dev tetap aktif (1 Nov 2026)

- Absensi fleksibel (bagian 39) dideploy ke windsverse.com (`npm run cf:deploy`, tanpa migrasi baru).
- Setelah domain dipasang, Cloudflare mematikan alamat `winds-space.windsverse.workers.dev`. Kini
  diaktifkan lagi sebagai alamat cadangan (`workers_dev: true`), dan pratinjau per versi dimatikan
  (`preview_urls: false`).

## 41. Jadwal per karyawan: centang pagi/malam per tanggal (1 Nov 2026)

- Tombol baru **Jadwal per karyawan** di Kalender shift: pilih nama karyawan, lalu di kalender sebulan
  centang **P** (pagi) dan/atau **M** (malam) di setiap tanggal. Tanpa centang = libur, dua centang =
  full day. Ada tombol cepat "Semua pagi", "Semua malam", "Kosongkan", dan pindah bulan. Setelah
  disimpan, langsung bisa memilih karyawan berikutnya.
- Setiap tanggal memakai satu shift pagi dan satu shift malam bersama: karyawan yang dicentang
  bergabung ke shift yang sudah ada, atau shift baru dibuat dengan jam pagi/malam (diambil dari
  shift terakhir, bisa diubah). Menghapus centang mengeluarkan karyawan dari shift; shift yang jadi
  kosong terhapus. Shift yang sudah berjalan/selesai atau sudah ada absensinya tidak diubah dan
  dilaporkan. Tanggal yang sudah lewat tidak bisa diubah dari sini.
- Pagi/malam ditentukan dari jam mulai (sebelum 14.00 WITA = pagi). "Input cepat" lama tetap ada.
- Kode: `app/roster-planner.tsx` (+ `.module.css`), aksi `roster.person` di `lib/engine.ts`,
  `shiftSlot` di `lib/model.ts`. Tes baru di `tests/engine.test.ts` (28 lulus, 4 gagal lama).
- Dicek di browser (desktop dan ukuran HP) dengan database uji lokal: Azwar pagi 3–5, malam 6–7,
  full day 8; Fayza malam 3–4 bergabung ke shift yang sama; menghapus centang tanggal 5 menghapus
  shift kosongnya.

## 42. Playlist YouTube di Noisegasm bisa diputar lagi (1 Nov 2026)

- Penyebab: pemutar YouTube versi terbaru menolak kolom `videoId` yang kosong ("Invalid video id"),
  dan kode kita selalu mengirim kolom itu, termasuk untuk link playlist. Akibatnya playlist tidak
  pernah termuat (iframe kosong). Kini `videoId` hanya dikirim untuk link video tunggal.
- Dicek di halaman live: playlist "Winds Playlist" (21 video) termuat dan player siap tanpa error.

## 43. Kurva warna RGB di preset film Story of Winds (1 Nov 2026)

- Editor preset kini punya bagian **Kurva warna** seperti aplikasi edit foto: kanal **RGB** (semua
  warna) lalu **Merah**, **Hijau**, **Biru**. Ketuk grafik untuk menambah titik (maks. 12), geser
  untuk mengubah, ketuk dua kali atau "Hapus titik" untuk menghapus; titik ujung hanya naik-turun.
  Ada "Reset" per kanal dan "Reset semua"; kanal yang diubah diberi titik hijau. Pratinjau langsung
  ikut berubah.
- Kurva diterapkan setelah penyesuaian lain (kehangatan, pudar, kontras, saturasi) dan sebelum
  butiran film, pada foto tamu maupun pratinjau. Kurva dihitung halus tanpa lonjakan (monotone
  cubic). Preset lama tanpa kurva tidak berubah; kurva lurus tidak disimpan.
- Kode: `app/curve-editor.tsx` (+ `.module.css`), `curveTable` dan tipe `Curves` di `lib/film.ts`,
  skema `grade.curves` di `lib/camera-config.ts`, editor di `app/camera-admin.tsx`.
- Dicek: hitungan kurva (lurus = tidak berubah, kurva S, pudar), dan di browser dengan database uji
  lokal (menambah dan menggeser titik dengan mouse, pratinjau berubah, preset tersimpan dan kurvanya
  muncul lagi saat diedit). `typecheck`, `format:check`, `build` lulus.

## 44. Tombol Windstopia, nama tombol baru, dan layar Memoirs tidak menembus benda (1 Nov 2026)

- Tombol **Explore** di dalam layar 3D dihapus. Gantinya tombol **Windstopia** di deretan tombol fitur
  di bawah layar 3D; menekannya menggulir ke layar 3D dan membuka mode jelajah.
- Nama tombol: **Jelajahi Menu → Menu**, **Menuju Perpustakaan → Library**. Karena kini ada 7 tombol,
  Menu dibuat selebar penuh di atas dan enam tombol lain tersusun berpasangan.
- **Layar Memoirs** (lapisan web yang ditempel di atas 3D) kadang terlihat menembus benda saat kamera
  diputar, karena penghalang hanya diperiksa tiap 0,35 detik dan hanya di titik tengah layar. Kini
  diperiksa setiap gambar selama kamera bergerak, di tengah dan keempat sudut layar; bila ada yang
  tertutup, lapisan web disembunyikan dan layar 3D di belakangnya menampilkan foto yang sama (bukan
  lagi gambar pengganti "Winds Space").
- Dicek di browser dengan database uji lokal: label dan susunan tombol, tombol Explore di 3D hilang,
  Windstopia membuka mode jelajah. Uji putar kamera di depan Memoirs belum dilakukan di browser.
  `typecheck`, `format:check`, `build` lulus; jumlah masalah lint tidak bertambah.

## 45. Story of Winds: bodi kamera rangefinder, knob yang bisa diputar, dan unggah foto (1 Nov 2026)

- **Tampilan baru** (tanpa merek): bodi kamera landscape dengan pelat atas perak dan bodi hitam
  bertekstur kulit, seperti kamera rangefinder dilihat dari belakang. Semua ukuran mengikuti lebar
  bodi, jadi pas di HP maupun komputer.
- **Kontrol dan fungsinya**:
  - Atas: knob **FILM** (putar = ganti film), **tombol rana** (jepret), knob **EV** (kompensasi
    cahaya −2 sampai +2, per ⅓ stop; berlaku di pratinjau dan hasil cetak), **roda ZOOM** (1–3×),
    **VIEW MODE** (lensa depan/belakang), **FLASH** (lampu kilat).
  - Belakang: **tuas fokus** (garis bantu), **▶** (lihat foto), **🗑** (hapus foto), **DISP/BACK**
    (sembunyikan info layar / kembali), **Q** (menu cepat: unggah foto, timer, kilat, garis bantu,
    lensa), **D-pad** (atas DRIVE = timer, bawah = kilat, kiri/kanan = ganti film atau foto) dan
    **MENU/OK** (menu film / pilih / unduh foto saat melihat foto).
  - Knob diputar dengan menyeret ke samping (berbunyi "klik" per takik), menggulir, tombol panah,
    atau mengetuk sisi kiri/kanannya. Di komputer: spasi = jepret, panah = D-pad, Enter = OK.
- **Orientasi**: bawaan landscape (cetak 3:2). Di HP yang dipegang berdiri, bodi berputar menjadi
  kamera tegak dan hasilnya portrait (2:3); isi layar LCD tetap tegak. Mengikuti orientasi layar HP
  (rotasi otomatis harus aktif agar landscape terdeteksi saat HP dimiringkan).
- **Unggah foto** (Q → Unggah foto dari galeri): foto dari galeri dicetak dengan film dan EV yang
  dipilih, mengikuti orientasi fotonya, lalu tersimpan di album seperti jepretan biasa (memakai satu
  jatah harian).
- `develop` kini menerima `aspect` dan `exposure`; bingkai dan teks cetakan mengikuti sisi pendek,
  jadi cetakan portrait tetap sama seperti sebelumnya.
- Dicek di browser dengan database uji lokal: knob FILM dan EV diputar dengan seret mouse, menu Q,
  unggah foto landscape (tersimpan 1280×952, jatah 15 → 14), tombol ▶, dan tampilan HP berdiri.
  Kamera asli tidak bisa diuji di browser uji (akses kamera diblokir). `typecheck`,
  `format:check`, `build` lulus; masalah lint lama di file kamera tidak bertambah.

## 46. Noisegasm bisa disembunyikan; meja racik Windstopia dari sudut pandang Luna (1 Nov 2026)

- **Noisegasm**: pemutar mini kini di bawah jendela-jendela (kamera Story of Winds tidak lagi
  tertutup) dan punya tombol **‹** untuk menyembunyikannya ke tepi kiri; tinggal tab kecil, musik
  tetap berjalan. Pilihan ini diingat selama kunjungan.
- **Meja racik baru** (`app/explore-bar.tsx`), menggantikan panel cangkir, daftar takaran, dan
  panel espresso. Saat meracik, kamera meluncur halus ke mata Luna menghadap mesin espresso, lalu
  kembali saat selesai. Di atasnya meja bar bergambar yang semuanya bisa disentuh:
  - Rak **gelas plastik** (dingin) dan **paper cup** (panas); gelas meluncur ke tengah meja.
  - **3 botol sirup berpompa**, tiap pompa 10 ml (tutup pompa turun, botol bergoyang, tetesan
    melengkung ke gelas). Isi tiap botol bisa diganti (⟲): gula cair, gula aren, vanila, karamel;
    pilihan diingat di perangkat.
  - **Toples bubuk** cokelat, matcha, taro (tutup terbuka, sendok terbang ke gelas).
  - **Toples biji kopi** untuk mengisi hopper grinder.
  - Susu, SKM, teh, air panas.
  - **Freezer**: buka laci, "Serok es" — satu serokan langsung untuk satu gelas.
  - **Espresso seperti aslinya**: ketuk portafilter ke bawah **grinder**, tahan GRIND sampai penuh,
    ketuk ke alas lalu tahan **tamper**, ketuk ke mesin, **seret gagangnya dari kiri ke kanan**
    sampai terkunci di tengah (tertarik sendiri bila dilepas dekat tengah), tekan **BREW** — gelas
    bergeser ke bawah mesin dan espresso mengalir — lalu **STOP**. Timer menunjukkan detik
    ekstraksi; 24–31 detik = shot sempurna. Ketuk portafilter lagi untuk membuang ampas.
  - Gelas menampilkan isinya: warna campuran, es batu yang bergoyang, crema, uap untuk minuman
    panas. Tiket pesanan, petunjuk langkah berikutnya, "Buang & ulang", "Tutup", "Selesai racik".
  - Di HP berdiri, meja lebih lebar dari layar dan bisa digeser ke kiri-kanan.
  - Animasi lembut (pegas dan easing halus) dan suara baru: pompa, serok, es, kunci, ketuk ampas.
- Dicek di halaman uji lokal: alur Es Kopi Susu Aren lengkap (gelas plastik, es 1 serok, aren 2
  pompa = 20 ml, susu, giling, tamp, kunci dengan seret mouse, brew 26 dtk "shot sempurna"),
  tampilan desktop dan HP. Kamera POV di dalam 3D belum diuji di browser (panel browser
  tersembunyi). `typecheck`, `format:check`, `build` lulus; `barista.test` 6/6, `engine.test`
  28/32 seperti sebelumnya.

## 47. Meja racik Windstopia menjadi 3D di meja bar asli (1 Nov 2026)

- Versi 2D (bagian 46) diganti. Perlengkapan bar kini **model 3D** di atas meja bar asli kafe
  (`lib/bar-rig.ts`), di samping mesin kopi, freezer, dan kulkas buatan pemilik: 3 botol sirup
  berpompa, 3 toples bubuk (cokelat, matcha, taro), toples biji kopi, tumpukan cup plastik bening
  dan paper cup, karton susu, kaleng SKM, grinder (hopper, tombol, garpu portafilter), portafilter,
  tamper dengan alas, dan kotak ampas.
- **Kamera mata Luna** dengan sudut tetap ke meja bar (geser layar ke kiri/kanan untuk melihat
  sepanjang meja), dan berbalik ke freezer saat mengambil es. Luna disembunyikan selama itu.
  Setelah "selesai", kamera kembali ke CCTV di area bar, lalu ke mode bebas setelah keluar.
- **Interaksi**: sentuh benda 3D-nya. Cup meluncur dari tumpukan ke meja; sirup: cup bergeser ke
  bawah corong, pompa ditekan (10 ml), tekan lama botol untuk mengganti isinya; bubuk: tutup
  terangkat, sendok menuang; susu/SKM: diangkat dan dituang; es: kamera menoleh ke freezer, scoop,
  lalu es masuk cup.
- **Espresso seperti aslinya**: portafilter ke garpu grinder; ketuk grinder untuk menggiling sesuai
  **dosis** (pilih 16/18/20 g); ke alas, ketuk tamper (turun, tekan, putar sedikit, naik); ketuk
  portafilter: naik ke bawah group head dalam posisi miring ke kiri, lalu **geser ke kanan** untuk
  memutarnya sampai terkunci (tertarik sendiri bila dekat tengah); ketuk mesin untuk brew (cup ke
  drip tray, aliran espresso, timer dan volume target 1:2), ketuk lagi untuk stop. Shot bagus:
  24–31 dtk dan dekat 1:2. Ketuk portafilter untuk membuka, mengetuk ampas, dan mengembalikannya.
- **Layar minimal**: tiket kecil, satu baris petunjuk, angka dosis/detik/ml saat dipakai, tombol
  dosis, "buang", "tutup", dan tombol kecil **selesai** yang melayang di atas cup.
- Typecheck, format, build, dan tes lulus seperti sebelumnya. Belum diuji langsung di browser
  (panel browser asisten tersembunyi, scene 3D tidak dimuat); posisi benda dihitung dari koordinat
  model kafe dan mungkin perlu disetel setelah dicoba.

## 48. Bar Windstopia: mesin otomatis, alur resep jelas, tamu bergaya Luna (1 Nov 2026)

- **Mesin espresso otomatis** menggantikan mesin kopi buatan pemilik selama game (mesin asli
  disembunyikan, kembali saat scene ditutup). Tidak ada lagi grinder/portafilter baru: ketuk mesin,
  pilih **Ristretto (20 ml) / Espresso (30 ml) / Lungo (60 ml)**, cup bergeser ke bawah corong,
  shot mengalir, lalu cup kembali.
- **Menu Windstopia hanya 4**: Winds Coffee, Winds Chocolate, Matcha Latte, Lemontea (harga ikut
  menu kafe bila namanya sama). Resep game buatan sendiri, bukan resep asli kafe. Semua bahan ada
  di meja: 3 botol sirup (gula, aren, lemon; bisa diganti vanila/karamel lewat tekan lama),
  toples cokelat & matcha, susu, teko teh, cup plastik & paper cup, es dari freezer.
- **Alur jelas**: tiket kiri atas berisi langkah resep yang dicentang satu per satu (langkah
  berikutnya ditebalkan), satu baris "Berikutnya: …" di bawah, tombol "🧊 ambil es di freezer"
  untuk pesanan dingin, tombol hijau **selesai ✓** di atas cup setelah semua langkah beres.
- **Pesanan bervariasi**: dingin atau panas acak (Lemontea lebih sering dingin), kalimat tamu ikut.
- **Tamu bergaya Luna** (`app/luna/guest-look.ts`): salinan model Luna tanpa rompi, pena, dan pita
  barista; warna kulit, rambut, kaos, celana, sepatu dipilih dari nama. Nama laki-laki (Dimas, Bayu,
  Yoga, …) berambut pendek, nama perempuan (Rina, Sari, Nadia, …) berambut bob.
- Perbaikan yang ditemukan saat uji di browser:
  - Cup, aliran sirup, sendok, dan animasi pompa sebelumnya **tidak terlihat** karena scene
    membekukan matriks semua objek model kafe; rig bar kini dikecualikan.
  - Warna isi cup, warna sirup, dan cahaya pompa tidak berubah karena material diganti salinan
    toon; material yang berubah saat main kini dibiarkan.
  - Mesin kopi asli bernama `mesin_kopi` di three.js, sehingga dulu tidak ikut tersembunyi.
  - Cup kini terbuka di atas sehingga minumannya terlihat; pompa turun lebih dalam dan menyala
    saat ditekan agar jelas dari sudut atas.
  - Tata letak meja dirapatkan dan sudut kamera dinaikkan supaya semua bahan terlihat sekaligus.
  - HUD Explore disembunyikan selama di bar; bar tidak terbuka bila belum ada pesanan dari kasir.
  - Warna tamu dulu tidak berubah (material ditukar toon setelahnya); sekarang dicari saat dipakai,
    tekstur piksel dibuat abu-abu agar bisa diwarnai tanpa kehilangan detail.
- Diuji di browser (dev): Winds Chocolate panas, Lemontea dingin (freezer, teh, lemon, gula, tombol
  selesai), shot Espresso, dan tamu laki-laki/perempuan. `typecheck`, `format:check`, `build`
  lulus; `barista.test` + `people.test` 19/19, `engine.test` 28/32 (4 gagal lama). 13 error lint di
  `scene-3d.tsx` sudah ada sebelumnya.

## 49. Tamu Windstopia: proporsi dewasa, rambut & wajah bervariasi, gelas di meja (1 Nov 2026)

- **Nama tamu baru** (20): Fajar, Uli, Ekki, Vira, Aan, Ayi, Aslam, Nisa, Fina, Podding, Adit,
  Acca, Mamat, Novy, Ifnul, Giffari, Aris, Bayu, Amal, Amma. Laki-laki: Fajar, Ekki, Aan, Aslam,
  Adit, Mamat, Ifnul, Giffari, Aris, Bayu, Amal; perempuan: Uli, Vira, Ayi, Nisa, Fina, Podding,
  Acca, Novy, Amma. Dua tamu yang sedang di kafe tidak pernah bernama sama.
- **Penampilan mengikuti nama**: Fajar selalu terlihat sama setiap datang (warna, rambut, wajah).
- **Proporsi dewasa**: kepala lebih kecil, kaki, badan, dan lengan lebih panjang, tinggi sedikit
  berbeda per orang (laki-laki rata-rata lebih tinggi). Tamu kini punya **lutut**, jadi saat duduk
  di kursi kakinya menekuk ke bawah.
- **Tangan tidak lagi putus**: lengan bawah sebelumnya ikut terhapus karena nama "Elbow" mengandung
  kata "bow" (pita barista). Pita kini dikenali dengan nama lengkapnya.
- **12 gaya rambut**: laki-laki (cepak, jabrik, belah samping, botak tipis, topi, keriting),
  perempuan (panjang, kuncir kuda, cepol, bob, **hijab**, kuncir dua). Rambut Luna tidak dipakai.
- **Wajah digambar per tamu** dalam gaya piksel Luna: 6 bentuk mata, alis, 5 bentuk mulut, pipi
  merah, bintik, kacamata, kumis/janggut/brewok untuk laki-laki; warna kulit ikut tamu.
- **Gelas tamu** kini diletakkan tepat di atas meja yang dihadapi (termasuk meja lesehan rendah di
  lantai 2), tidak lagi melayang. Di lesehan, tamu duduk di lantai dengan kaki selonjor ke bawah
  meja, bukan pose duduk di kursi yang menembus lantai.
- Diuji di browser (dev): tamu antre, duduk di kursi dan bangku teras lantai 2, wajah dan rambut
  dilihat dari dekat. `typecheck`, `format:check`, `build` lulus; `barista.test` + `people.test`
  19/19.

## 50. Windstopia: kamera tak tertutup, kasir otomatis, tuang susu/teh ditahan, tamu naik mobil (1 Nov 2026)

- **Kamera Explore** tidak lagi tertutup atap/dinding: bila pandangan ke Luna terhalang, kamera
  berputar dan naik/turun pelan ke sudut terdekat yang bersih **dengan jarak yang sama** (tanpa
  zoom mendadak, tanpa menyembunyikan objek). Baru mendekat bila tidak ada sudut bersih. Kaca tidak
  dianggap penghalang. Kembali ke sudut pemain setelah sudut itu bersih sebentar.
- **Kasir**: tidak ada langkah kembalian; pilih menu yang benar → uang langsung diterima.
- **Bar**:
  - Cup **tetap di stasiun terakhir**: pump kedua di botol yang sama tidak bergerak lagi; setelah
    espresso cup tetap di bawah mesin.
  - **Susu dan teh dituang sambil ditahan**: kotak/teko datang ke atas cup, miring, mengalir selama
    ditahan. Meteran kecil di samping cup menunjukkan ml dan zona hijau (92–110 % resep). Saat
    dilepas: "Pas! Takarannya sempurna ✨", "Kurang sedikit", atau "Kebanyakan sedikit".
  - **Isi cup naik** sesuai bahan yang masuk dan **penuh di langkah terakhir** (volume resep).
  - Kotak susu dan teko teh digeser agar berdiri di atas meja; tumpukan cup dibuat rendah di tepi
    depan agar cup di bawah pump tetap terlihat.
  - **Kamera meracik setinggi mata Luna**, sedikit mundur: semua bahan terlihat dan suasana kafe di
    depan meja tetap tampak.
  - **Freezer**: kamera menoleh dan melihat ke bawah, **tutup freezer terbuka**, es diambil, tutup
    menutup kembali, baru kamera kembali ke meja.
- **Tamu datang naik mobil** (mode Explore): mobil datang di lajur sisi kafe, berhenti di depan
  pintu masuk, tamu turun di trotoar lalu berjalan masuk, mobil melaju lagi. Mobil lain di lajur itu
  menunggu di belakangnya.
- Diuji di browser (dev): mobil antar tamu, alur Winds Coffee (espresso, 2× pump aren), cokelat
  dingin (freezer, tuang susu ditahan dengan meteran), kamera berjalan di sekitar kafe.
  `typecheck`, `format:check`, `build` lulus; `barista.test` + `people.test` 19/19.

## 51. Windstopia: kamera halus, rupiah, lutut Luna, lampu bercahaya, tamu dijemput mobil (1 Nov 2026)

- **Teko teh** kini menuang dari corongnya: teko berdiri di sisi kiri cup dan miring ke kanan.
- **Kamera lebih halus**: putaran pemain langsung diikuti setiap frame (tidak lagi diperlambat dan
  diperbarui 10× per detik, penyebab patah-patah). Hanya ayunan otomatis menghindari dinding yang
  diperhalus. Pencarian sudut bersih memakai paling banyak 32 sinar dan paling sering tiap 0,3 dtk;
  saat pemain sedang memutar, kamera mengikuti pemain.
- **Novy** laki-laki.
- **Hijab berlengan panjang**: lengan atas dan bawah memakai warna baju.
- **Lutut** kini bagian dari rig Luna sendiri: Luna dan tamu menekuk lutut saat duduk, saat bermain
  piano/gitar/cello, membaca, kaki berayun di dermaga, melompat, dan sedikit saat berjalan.
- **Rupiah**: skor diganti uang. Tiap pembelian di kasir menambah harga menu ("+Rp18.000"), tampil
  di kiri atas ("Rp36.000 · 2 tamu"). Tugas bersih-bersih tidak lagi memberi poin.
- **Lampu**:
  - Kabel lampu gantung di area duduk luar tetap terlihat sebagai garis gelap utuh (kabel tinggi
    di langit tetap samar).
  - Bola lampu kafe menyala juga di siang hari (lembut), terang saat sore/malam.
  - Setiap bola lampu (lampu gantung dan lampu peri) dan papan neon punya **halo cahaya** yang
    berkedip halus seperti nyala lilin.
  - Dua lampu pengisi lembut di dalam kafe (lantai 1 dan 2), menyala siang dan malam, agar sudut
    tidak gelap.
- **Tamu pulang dijemput mobil**: tamu berjalan keluar pagar ke trotoar, menunggu, mobil berhenti,
  tamu masuk, mobil melaju. Mobil yang sama juga mengantar tamu baru bila ada.
- **Luna membaca di kursi**: saat duduk di kursi muncul tombol "Baca buku" (atau buku dari tas);
  Luna membaca tanpa berdiri.
- **Hujan**: tamu baru memilih kursi yang beratap (dicek dengan sinar ke atas dari tiap kursi).
- Diuji di browser (dev): lampu malam, halo, kabel. Bagian lain lulus typecheck/tes tapi belum dicoba
  langsung. `typecheck`, `format:check`, `build` lulus; `barista.test` + `people.test` 19/19.

## 52. Bar ditata ulang, kaca box bar, tekstur tidak ter-stretch, langit lebih cerah (1 Nov 2026)

- **Cangkir keramik yang berjejer** di meja bar disembunyikan.
- **Tata letak meja bar** (dilihat dari mata Luna):
  - Sudut kiri dekat kaca: tumpukan cup plastik dan paper cup, lalu 3 botol sirup, lalu toples
    cokelat dan matcha.
  - Ujung kanan: serokan es di atas nampan (diklik → langsung ke freezer ambil es), kotak susu, teko
    teh, mesin kopi.
  - Bagian tengah (jendela pesan) dibiarkan kosong.
  - Kamera meracik mengikuti cup sepanjang meja (perjalanan jauh lebih pelan); geser layar untuk
    melihat ke ujung lain. Setiap kali cup berpindah, atau Luna kembali dari freezer, kamera kembali
    ke cup.
- **Kaca** di jendela sudut box bar: dua sudut depan di kiri-kanan jendela pesan, dan dua jendela
  samping pendek di ujung meja. Jendela pesan di tengah tetap terbuka.
- **Tekstur kafe**: tekstur "baked" kecil (256–512 px) yang ter-stretch di permukaan besar diganti
  tekstur mulus kecil berwarna sama (plester, beton, papan kayu, plywood, kulit pohon, terakota),
  diproyeksikan dari sisi yang dihadapi dengan ukuran tetap (`lib/cafe-retexture.ts`).
- **Langit siang** lebih cerah ala Ghibli: biru cerulean di atas, biru muda pucat di cakrawala, awan
  putih bersih (langit teleskop tidak berubah). Kabut jauh ikut biru muda.
- Diuji di browser (dev): tampak luar box bar (kaca, meja), sudut kiri dan ujung kanan dari mata
  Luna, serokan es → freezer, langit siang. `typecheck`, `format:check`, `build` lulus;
  `barista.test` + `people.test` 19/19.

## 53. Perbaikan tekstur yang jadi hitam (1 Nov 2026)

- Penyebab: warna tekstur baru diambil dari rata-rata seluruh gambar tekstur baked, padahal sebagian
  besar gambar itu ruang hitam kosong di antara potongan UV. Benda dengan potongan kecil (kursi
  beton, meja, bingkai cermin, lantai beton bertangga, dinding kayu lantai 2, pagar batu, dinding
  bangku logo) jadi hampir hitam.
- Sekarang warna diambil hanya dari titik tekstur yang benar-benar dipakai permukaan (dari UV asli
  tiap segitiga), mengabaikan piksel hitam di tepi potongan. Hasilnya seragam per bahan: beton abu-abu
  seperti lantai bawah, kayu gelap cokelat, plywood madu, plester putih hangat, terakota.
- Tekstur beton dan plester dipertegas (noda, butiran, pori) agar teksturnya terlihat.
- Diuji di browser (dev): halaman depan (meja, bangku beton, lantai bertangga, dinding logo, pagar
  kotak-kotak, pot). `format:check`, `build` lulus; tes 19/19.

## 54. Bar, kaca, kamera halus, tripod, kamera Story of Winds untuk video, kucing (1 Nov 2026)

- **Meja bar**: teko teh dan kotak susu di samping toples bubuk; mesin kopi digeser ke kiri tetap di
  dalam rangka jendela kanan; serokan es di ujung kanan. Peralatan barista sebagai hiasan: tempat
  sedotan warna-warni, gelas sendok panjang, toples tip di jendela pesan, pitcher susu stainless,
  knock box, lap bar terlipat, dan pot sukulen kecil.
- **Kaca box bar** dipasang tepat di dalam rangka: dua sudut depan, tiga bukaan di sisi kiri (antara
  tiang rangka), sisi kanan dekat ujung meja, dan **jendela belakang dekat kulkas**. Setiap kaca diberi
  **garis tepi** gelap seperti outline benda lain.
- **Kamera mengikuti Luna** kini berbelok mulus, bukan melompat: saat terhalang, kamera berputar ke
  sisi yang bersih (naik bila kedua sisi tertutup) dengan kecepatan yang diperhalus, lalu pelan kembali
  ke sudut pemain. Saat pemain memutar, putaran kamera otomatis langsung menjadi sudut pemain (tanpa
  lompatan).
- **Masuk/keluar box bar**: batas ganda (harus agak masuk untuk pindah ke CCTV, agak keluar untuk
  kembali) dan jeda minimal 0,6 dtk, sehingga tidak berkedip bolak-balik di pintu.
- **Tripod**: kaki kini menapak di tanah dan bertemu di bawah kamera (sebelumnya terbalik).
- **Digicam digabung ke kamera Story of Winds**: item digicam di tas dihapus. Kamera Story of Winds
  mendapat tombol **REC** (di panel belakang): video direkam lewat film yang dipilih (warna sama
  dengan fotonya), dengan zoom, sampai 1 menit, lalu bisa disimpan ke perangkat atau dibuang.
  Tripod membuka kamera Story of Winds yang terpasang di tripod. Berlaku juga di halaman Story of
  Winds biasa (kamera perangkat).
- **Kucing**: kaki menembus sedikit ke dalam badan sehingga tidak terlihat terpisah.
- Diuji di browser (dev): tampak luar meja bar dan kaca, kamera Story of Winds di tripod + rekam video
  3 dtk dengan film, kucing. `typecheck`, `format:check`, `build` lulus; tes 19/19.

## 55. Kamera kembali manual; penghalang dibuat transparan (1 Nov 2026)

- Pergerakan kamera otomatis (berbelok/naik/mendekat saat terhalang) dihapus. Kamera kembali
  mengikuti Luna di sudut dan jarak yang diatur pemain saja.
- Benda yang berdiri di antara kamera dan Luna (dinding, atap, lantai atas, pohon, perabot besar)
  kini **memudar** ke ±30 % opacity, pelan masuk dan keluar, lalu kembali normal setelah tidak
  menghalangi. Dicek beberapa kali per detik dengan dua garis pandang (dada dan lutut Luna). Kaca dan
  perlengkapan bar tidak ikut.
- Diuji di browser (dev): Luna di bawah lantai 2, lantai atas dan dinding di depannya memudar.

## 56. Noisegasm: pemutar YouTube lebih tangguh (1 Nov 2026)

- Di situs live (Chrome di panel asisten) Noisegasm bisa diputar/dijeda, dan ke-21 video playlist
  bisa diputar di windsverse.com. Masalah belum bisa direproduksi, jadi pemutar dibuat lebih tangguh:
  - Video yang tidak bisa diputar (dihapus, privat, atau tidak boleh di-embed) dilewati otomatis,
    bukan menghentikan musik.
  - Tombol play yang ditekan sebelum pemutar YouTube siap tidak lagi error; pemutar mulai begitu siap,
    dan suara dinyalakan bila YouTube memulai dalam keadaan bisu.
  - Bila dalam 3 detik musik tetap tidak jalan (beberapa browser, terutama iPhone/iPad, hanya mengizinkan
    YouTube mulai dari ketukan langsung pada videonya), pemutar mini menulis "Ketuk video kecil untuk
    memutar".

## 57. Langit lebih lembut, kucing tidak menembus dinding, gunung dan laut ditukar (1 Nov 2026)

- **Langit siang** kembali ke warna lama yang lembut, hanya sedikit lebih biru dan segar (atas
  sedikit lebih biru, cakrawala sedikit lebih bersih, awan sedikit lebih terang). Kabut jauh ikut.
- **Kucing menembus dinding**: pemeriksaan langkah (dipakai kucing dan langkah bebas Luna) hanya
  menembakkan sinar ke depan, sehingga dinding satu sisi yang terlihat dari belakang tidak terdeteksi.
  Kini ada sinar balik dari arah sebaliknya, jadi dinding dari sisi mana pun menghalangi.
- **Gunung dan laut ditukar**: laut dan pantai (beserta dermaga dan perahu) kini di belakang kafe,
  di balik bukit menara; pegunungan di seberang jalan depan. **Sungai** ikut ke belakang, mengalir di
  antara kafe dan menara, dengan danau hati di sisi lautnya. **Menara tetap** di tempatnya. Jembatan
  kayu kini di belakang kafe: jalan tanah dari belakang kafe ke jembatan, lalu batu pijakan dari
  ujung jembatan ke tangga menara.
- Diuji di browser (dev): tinggi tanah (laut di belakang, gunung di depan), sungai + jembatan + batu
  pijakan ke menara terlihat dari kamera Explore. `typecheck`, `format:check`, `build` lulus; tes
  19/19, `engine.test` 28/32 (4 gagal lama).

## 58. Noisegasm shuffle; kontrol HP: joystick jalan/lari, jari kedua memutar kamera (1 Nov 2026)

- **Noisegasm**: tombol **putar acak** (ikon shuffle) di samping tombol lagu berikutnya. Menyala
  kuning saat aktif dan diingat selama sesi. Untuk playlist YouTube memakai acak bawaan YouTube;
  untuk lagu unggahan, lagu berikutnya/sebelumnya dipilih acak (tidak mengulang lagu yang sama).
- **HP — jalan dan lari dengan satu jempol**: dorong joystick sedikit untuk jalan, dorong lebih jauh
  (lebih dari 80 % jangkauan, jangkauan diperbesar jadi 60 px) untuk lari. Cara lama (menahan jari
  kedua untuk lari) dihapus.
- **HP — jari kedua memutar kamera**: sambil jalan dengan joystick, jari lain bebas menggeser layar
  untuk memutar kamera (multitouch).
- **Tidak ada lagi seleksi layar**: selama mode Explore, menahan jari di layar tidak menyeleksi teks
  halaman dan tidak memunculkan menu tekan-lama (kolom ketik tetap bisa diseleksi).
- `typecheck`, `format:check`, `build` lulus; tes 19/19. Belum diuji di HP sungguhan.

## 59. Noisegasm di HP: video membesar untuk diketuk (1 Nov 2026)

- Di HP (terutama iPhone), YouTube sering hanya mau mulai dari ketukan langsung pada videonya,
  bukan dari tombol play halaman; video mini 96×54 px gampang terlewat.
- Kini bila 1,5 detik setelah play musik belum jalan, video YouTube **membesar di atas pemutar mini**
  (lebar hingga 300 px, berbingkai kuning) dengan tulisan berdenyut "Ketuk video untuk memutar ↓".
  Begitu musik berputar, video kembali kecil. Pemutar yang disembunyikan ke tepi ikut muncul saat itu.
- Di emulasi HP (Chrome Android) Noisegasm bisa diputar; perilaku iPhone belum bisa diuji langsung.

## 60. Sistem kartu member, tahap 1 (1 Nov 2026)

Aturan lengkap ada di `RENCANA_MEMBER.md`. Ringkasnya:

- **Stamp**: 1 transaksi = 1 stamp bila ada minimal 1 minuman berbayar seharga ≥ Rp15.000.
  10 stamp per kartu, lalu lanjut ke kartu baru. Stamp ke-5 memberi minuman **non-kopi** gratis,
  stamp ke-10 minuman **kopi** gratis. Minuman gratis hangus 6 bulan bila tidak dipakai dan tidak
  menghasilkan stamp atau poin.
- **Poin**: bawaan 1 poin per Rp1.000 harga menu (setelah diskon), semua item berbayar dihitung.
  Admin bisa mengisi poin sendiri per menu (kolom "Poin member" di Produk). Poin terkumpul lintas
  kartu dan hangus bila 12 bulan tanpa transaksi yang memenuhi syarat.
- **Hadiah tahunan**: koleksi per tahun (poin + minimal kartu penuh). Tiap hadiah hanya bisa ditukar
  sekali per tahun per member. Kartu penuh dihitung sejak penukaran terakhir jenis yang sama, jadi
  T-shirt tahun depan butuh 5 kartu baru. Menukar hadiah mengurangi poin.
- **Pendaftaran**: di kasir (langsung aktif) atau sendiri lewat QR `windsverse.com/member/daftar`
  (aktif setelah transaksi pertama yang memenuhi syarat; dibatasi 3 pendaftaran per jam per
  perangkat). Gratis, tanggal lahir opsional, kartu digital saja.
- **Kasir POS**: kotak Member untuk mencari (HP/kode/nama), mendaftarkan, melihat kartu, memakai
  minuman gratis (langsung jadi potongan), melihat stamp/poin yang akan didapat, dan mengirim
  tautan kartu lewat WhatsApp.
- **Menu Member** (Operasional): daftar member + detail (stamp, minuman gratis, tukar hadiah,
  riwayat), hadiah tahunan, aturan, dan poster QR pendaftaran yang bisa dicetak.
- **Kartu pelanggan** `/member/<tautan rahasia>`: stamp, poin, minuman gratis, progres hadiah,
  QR kode member, riwayat penukaran. Tanpa nomor HP.
- Semua dihitung ulang dari pesanan, jadi pembatalan atau koreksi pesanan otomatis menyesuaikan kartu.
- Diuji di server lokal: daftar mandiri, aktivasi, 5 stamp → voucher non-kopi, pakai voucher di
  kasir (total Rp0, stamp tidak bertambah), tukar hadiah (poin berkurang). `typecheck`,
  `format:check`, `build` lulus; tes member 8/8, tes lain 19/19, `engine.test` 28/32 (4 gagal lama).

## 61. Kartu member 3D, animasi stempel, katalog hadiah geser (1 Nov 2026)

- **Kartu 3D seukuran kartu ATM** (85,6 × 54 mm, landscape) di halaman kartu member: mengilap,
  bertepi tipis, bisa diputar dengan menggeser ke samping (berhenti di sisi terdekat), diketuk
  untuk membalik, atau tombol "Lihat depan / Lihat stamp".
- **Animasi stempel**: saat kartu dibuka, kartu berbalik ke belakang lalu tiap stamp dicap satu per
  satu. Stamp baru sejak kunjungan terakhir dicap lebih keras (kartu bergetar, ada cincin tinta).
- **Desain sendiri**: Member → **Tampilan kartu** (admin) untuk mengunggah desain depan dan belakang
  (PNG/JPEG/WebP maks 5 MB), memilih warna nama, tinta stempel, dan lingkaran stamp, dengan pratinjau
  3D langsung. Tombol **Template depan/belakang** mengunduh gambar 2048 × 1291 px yang menandai area
  yang diisi otomatis (nama, kode, nomor kartu, 10 stamp). Tanpa unggahan, kartu memakai desain
  bawaan Winds Space.
- **Katalog hadiah eksklusif** di bawah kartu: satu hadiah per layar, digeser kiri-kanan (ada panah
  dan titik). Hadiah yang belum cukup poin/kartu tampil abu-abu dengan gembok dan progresnya; begitu
  cukup, gembok terbuka dengan animasi dan muncul tombol **Klaim hadiah**.
- **Klaim oleh pelanggan**: poin langsung terpakai, hadiah berstatus "menunggu diserahkan". Staf
  melihatnya di menu Member (pemberitahuan di atas) dan di kotak member Kasir POS, lalu menekan
  **Serahkan**; klaim yang belum diserahkan bisa dibatalkan (poin kembali).
- **Mockup hadiah**: di Hadiah tahunan, tiap hadiah kini punya keterangan singkat, unggah gambar
  mockup (persegi 1:1), dan unggah model 3D `.glb` (maks 20 MB) yang bisa diputar di katalog.
- **Akses dari 3D**: tombol **Kartu Member** di halaman utama (bersama Menu, Library, Windstopia, …)
  dan tombol **kartu** di Windstopia membuka kartu 3D yang terakhir dibuka di perangkat itu, atau
  ajakan mendaftar.
- Diuji di server lokal: animasi stempel, desain unggahan tampil di kartu dan pratinjau admin, klaim
  dari kartu, hadiah terkunci, tombol Kartu Member di halaman 3D. `typecheck`, `format:check`,
  `build` lulus; tes member 10/10, tes lain 19/19, `engine.test` 28/32 (4 gagal lama).

## 62. Perbaikan: stamp tidak bertambah di menu asli (1 Nov 2026)

- Penyebab: aturan bawaan member menganggap "minuman" hanya kategori demo (`kopi`, `non_kopi`,
  `mocktail`), sedangkan menu asli memakai kategori lain (Ice Coffee, Hot Coffee, Fresh Drink, …).
  Akibatnya tidak ada menu yang dihitung sebagai minuman sehingga stamp tidak muncul.
- Kini, selama admin belum menyimpan aturan, kategori **ditebak dari nama**: semua kategori kecuali
  makanan/snack dianggap minuman, dan yang bernama coffee/kopi/espresso dianggap kopi ("non kopi"
  tidak). Di menu asli: Ice Coffee & Hot Coffee = kopi; Fresh Drink, Chocolate Series, Milk Base,
  Hot Series, Milkshake, Yogurt = non-kopi; Snack & Food = bukan minuman.
- Tab Aturan menampilkan pemberitahuan bahwa kategori masih tebakan dan perlu diperiksa lalu disimpan.
- Karena stamp dihitung dari pesanan, transaksi yang sudah lewat langsung mendapat stamp-nya setelah
  perbaikan ini (atau setelah admin menyimpan kategori yang benar).
- **Simpan aturan** sempat gagal dengan "Data tidak ditemukan" karena aturan masih membawa kategori
  demo yang tidak terlihat di tabel. Kini kategori yang tidak ada di menu dibuang otomatis, baik saat
  dibaca maupun saat disimpan.
- Tes member 12/12, tes lain 19/19, `engine.test` 28/32 (4 gagal lama).

## 63. Makanan juga memberi stamp (1 Nov 2026)

- Member → Aturan punya kolom baru **Makanan** dan isian **Harga minimal makanan** (bawaan
  Rp15.000). Transaksi dengan minimal 1 makanan berbayar dari kategori itu (≥ harga minimal) kini
  mendapat stamp, walau tanpa minuman.
- Satu kategori hanya bisa minuman atau makanan (mencentang yang satu melepas yang lain).
- Tebakan otomatis: kategori bernama makanan/snack/food/roti/kue/dessert = Makanan (di menu asli:
  Snack & Food).
- Minuman gratis tetap minuman (stamp ke-5 non-kopi, ke-10 kopi). Teks aturan di kartu, kasir, dan
  halaman daftar ikut menyebut makanan.
- Tes member 12/12, tes lain 19/19, `engine.test` 28/32 (4 gagal lama).

## 64. Noisegasm di iPhone: "This video is unavailable" (1 Nov 2026)

- Penyebab: pemutar YouTube untuk playlist dibuat tanpa ID video, jadi alamatnya
  `youtube.com/embed/?list=…`. Browser komputer memaklumi, tetapi iPhone menampilkan "This video
  is unavailable".
- Kini playlist dimuat sebagai `embed/videoseries?list=…` (cara resmi YouTube). Daftar lagu langsung
  diketahui sebelum diputar (21 lagu), sehingga lagu yang tidak bisa diputar bisa dilompati.
- Bila daftar lagu belum diketahui saat sebuah lagu gagal, pemutar melompat ke lagu berikutnya
  berdasarkan urutannya di playlist (cara yang juga berjalan di iPhone).
- Diuji di windsverse.com dengan pemutar yang sama: alamat baru dipakai, playlist terbaca, lagu
  berputar. Belum diuji di iPhone sungguhan.

## 65. Perbaikan: input pesanan lampau masuk ke tanggal yang dipilih (3 Nov 2026)

- Penyebab: sejak aturan "transaksi ikut akun" (31 Okt), karyawan yang sedang cek in selalu masuk ke
  shift berjalan, sehingga pilihan tanggal lampau di Kasir POS diabaikan tanpa pemberitahuan.
- Kini shift lampau yang dipilih dihormati: pesanan masuk ke tanggal itu, langsung lunas dan selesai,
  dan tidak masuk antrean. Karyawan tetap hanya bisa memilih shift yang menjadi jadwalnya.
- Kasir POS menampilkan peringatan tanggal tujuan saat shift lampau dipilih, dan pilihan kembali ke
  shift berjalan setelah pesanan dicatat.
- Kartu pesanan lampau menampilkan tanggal transaksi beserta waktu input.
- `typecheck`, `format:check`, `build` lulus; `engine.test` 29/33 (4 gagal lama), ditambah tes baru
  untuk kasus ini.

## 66. Pengeluaran disatukan per hari dan dibagi rata ke semua shift (3 Nov 2026)

- Permintaan pemilik: tidak adil bila belanja hanya mengurangi gaji shift yang kebetulan berbelanja.
- Pilihan "Alokasi" ke shift dihapus. Perhitungan kini ditentukan kategori dan tanggal:
  - **Operasional, lainnya**: pengeluaran harian, disatukan per tanggal lalu dibagi rata ke semua
    shift hari itu. Sisa pembagian Rp1 masuk ke shift paling awal.
  - **Sewa, utilitas**: bulanan, hanya mengurangi laba bulanan untuk bonus, supaya sewa sebulan tidak
    menjatuhkan gaji satu hari.
  - **Bahan baku**: tetap tidak mengurangi laba karena sudah lewat HPP.
- Shift selesai yang tidak dikerjakan siapa pun dan tanpa penjualan tidak ikut menanggung. Hari tanpa
  shift masuk ke perhitungan bulanan.
- Tanggal bawaan pengeluaran mengikuti hari kerja kafe (sampai 05.00 WITA), supaya belanja lewat
  tengah malam tetap masuk ke hari shift malam itu.
- Menghapus shift tidak lagi menghapus catatan pengeluaran.
- Periode yang gajinya sudah dibayar tidak berubah. Gaji yang belum dibayar perlu dihitung ulang
  (`OPERATIONS_VERSION` naik ke 3).
- Admin mendapat ringkasan pengeluaran harian per tanggal di menu Pengeluaran.

## 67. Aturan member: 1 stamp per hari, hadiah stamp diubah (3 Nov 2026)

- Keputusan pemilik untuk menutup celah pembelian berulang di hari yang sama dan menjaga margin.
- Maksimal 1 stamp per hari kerja kafe. Transaksi berikutnya di hari itu hanya mendapat poin. Bila
  transaksi pertama dibatalkan, stamp pindah ke transaksi berikutnya.
- Stamp ke-5: potongan Rp5.000. Stamp ke-10: minuman gratis sampai Rp20.000, kopi atau non-kopi; bila
  lebih mahal, pelanggan membayar selisihnya. Nilainya bisa diatur di Member → Aturan.
- Kasir menampilkan "Stamp hari ini sudah didapat" sebelum transaksi dicatat.
- Teks kartu, pendaftaran, dan template kartu mengikuti aturan baru.
- Aturan berlaku juga untuk pesanan member yang sudah ada, karena stamp dihitung dari pesanan.

## 68. Pesanan dikelompokkan, cek out otomatis pukul 00.00 (4 Nov 2026)

- Menu Pesanan kini dikelompokkan per tanggal lalu per shift, masing-masing dengan jumlah pesanan dan
  total yang sudah dibayar. Tanggal terbaru terbuka, tanggal lama bisa dibuka dengan menekannya.
  Saat mencari atau memakai filter, semua tanggal yang cocok terbuka.
- Server menjalankan cek out otomatis pukul 00.00 WITA lewat Cron Trigger Cloudflare, dengan cadangan
  pukul 00.10. Jam keluarnya tercatat 00.00 dan catatan absensi diberi keterangan.
- Yang cek in setelah 00.00 tidak ikut keluar sampai tengah malam berikutnya. Periode yang gajinya
  sudah dibayar tidak disentuh.
- Shift dengan pesanan yang belum selesai tetap terbuka sampai pesanannya diselesaikan atau
  dibatalkan. Pesanan tidak diselesaikan otomatis.

## 69. Pesanan tanggal lampau tidak lagi pindah ke hari ini (4 Nov 2026)

- Laporan pemilik: karyawan memasukkan pesanan tanggal 3, tetapi tercatat tanggal 4.
- Penyebab 1: shift tanggal lama yang masih terbuka (misalnya pesanannya belum selesai) dianggap
  "berjalan", sehingga pesanan dialihkan diam-diam ke shift yang sedang diikuti karyawan. Kini shift
  terbuka yang jamnya sudah lewat dan bukan shift karyawan saat ini diperlakukan sebagai lampau.
- Penyebab 2: pilihan tanggal kembali ke shift berjalan setelah setiap pesanan, sehingga pesanan
  kedua dan seterusnya masuk hari ini. Kini pilihan tetap sampai diganti atau kasir meninggalkan menu
  Kasir, dengan peringatan yang terlihat. Pesan berhasil menyebut tanggal dan shift tujuan.

## 70. Riwayat absensi dipisah per karyawan (4 Nov 2026)

- Riwayat di menu Absensi tidak lagi tercampur dalam satu tabel: setiap karyawan punya tabel sendiri
  yang bisa dibuka dan ditutup, dengan jumlah shift hadir dan kolom tanggal. Karyawan tetap hanya
  melihat riwayatnya sendiri.

## 71. Tombol Area staf kembali muncul di HP (5 Nov 2026)

- Aturan lama menyembunyikan tautan pertama di navigasi halaman utama pada layar kecil. Setelah
  tautan lain dihapus, Area staf menjadi tautan pertama sehingga ikut tersembunyi. Aturan itu dihapus.
