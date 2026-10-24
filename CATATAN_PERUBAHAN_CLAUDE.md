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
| `public/models/luna-ps1.glb` | Model baru, 397 KB (yang lama 1,7 MB), 2.800 segitiga, 57 mesh. |
| `public/models/luna-ps1-preview.webp` | Poster untuk halaman `/luna`. |
| `app/scene-3d.tsx` | Café memuat `luna-ps1.glb`. |
| `app/luna/cafe-rig.ts` | Skala seragam. Faktor penyempitan 0.78/0.85 untuk model lama dihapus. |
| `app/luna/viewer.tsx`, `studio.tsx` | Studio memakai model dan poster baru, dengan skala ke tinggi kamera studio. Cache versi `?v=4`. |

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

## Deploy ke Sites

Bawa branch ini (atau patch-nya) ke lingkungan ChatGPT Sites yang punya akses project `appgprj_6ac7d63cb4f48191a187a55fc5239204`. Lalu: `npm ci` → `npm run build` → simpan versi → deploy ke project yang sama → cek `/` dan `/luna`. Tidak ada migrasi database.
