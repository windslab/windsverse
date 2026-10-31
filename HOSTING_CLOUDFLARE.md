# Pindah hosting ke akun Cloudflare sendiri

Website (sistem kafe dan game Explore) berjalan di Cloudflare Workers dengan database D1 dan
penyimpanan file R2, sama seperti di Sites, tetapi di akun Cloudflare milik pemilik. Domain tetap
dibeli di Rumahweb.

## Yang disimpan di repo dan yang tidak

- `cloudflare.json`: nama worker, nama dan ID database D1, nama bucket R2. **Bukan rahasia.**
  Selama `d1.id` kosong, build tetap seperti untuk Sites.
- `OWNER_SETUP_CODE`: kode penyiapan untuk mengaktifkan pemilik pertama. **Rahasia**, disimpan
  di Cloudflare dengan `npm run cf:setup-code`, tidak pernah di repo.
- Paket cadangan lama (`.winds.jsonl`) berisi resep asli: simpan di luar repo.

## Langkah pertama kali

1. **Login Cloudflare** dari komputer ini: `npx wrangler login` (setujui di browser).
2. **Aktifkan R2** di dashboard Cloudflare (perlu kartu tercatat; tetap gratis sampai 10 GB).
3. **Buat database dan bucket**:
   `npx wrangler d1 create winds-space-db` lalu salin `database_id` ke `cloudflare.json`
   (`d1.id`), dan `npx wrangler r2 bucket create winds-space-files`.
4. **Deploy**: `npm run cf:deploy` (build, migrasi database, lalu unggah worker). Alamat sementara
   muncul di akhir, misalnya `https://winds-space.<akun>.workers.dev`.
5. **Kode penyiapan**: `npm run cf:setup-code`, lalu ketik kode rahasia buatanmu sendiri
   (minimal 12 karakter). Simpan kode itu, misalnya di aplikasi catatan yang aman.
6. **Aktivasi pemilik**: buka `/login` di alamat sementara, pilih "Aktifkan login admin pertama",
   isi kode penyiapan, nama, ID, dan PIN. Kafe kosong langsung dibuat dengan kamu sebagai admin.
7. **Pindahkan menu, foto menu, HPP, dan resep** dari website lama:
   - Di komputer: `node scripts/filter-backup.mjs <cadangan-lama.winds.jsonl> <hasil.winds.jsonl>`
     (hanya menyisakan menu, kategori, foto menu, bahan/HPP, resep, pengaturan kafe, dan tier gaji).
   - Di website baru: admin → **Cadangan & pemulihan** → unggah paket hasil → pratinjau →
     pulihkan (ketik PULIHKAN dan PIN admin).
8. **Domain**: tambahkan domain di Cloudflare (Add a site), salin catatan DNS yang ada (misalnya
   email), ganti nameserver di panel Rumahweb ke nameserver Cloudflare, lalu di Workers → worker
   `winds-space` → Settings → Domains & Routes tambahkan domainnya. Situs lama tetap jalan sampai
   nameserver berpindah (bisa beberapa jam).

## Deploy berikutnya

Cukup `npm run cf:deploy` dari branch yang sudah disetujui. Naikkan `?v=` seperti biasa bila aset
berubah.
