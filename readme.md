# PEMIRA 2026 - Frontend Voter Portal
**Portal Pemilih & Bilik Suara Digital Modern (Next.js 14 + Tailwind CSS + Lucide Icons)**

Aplikasi web portal pemilih untuk Pemilihan Umum Raya (PEMIRA) Kampus 2026. Dibangun dengan antarmuka yang bersih, responsif (*mobile-first*), cepat, dan aman untuk melayani ribuan mahasiswa secara serentak.

---

## 🌟 Fitur & Halaman

1. **Halaman Autentikasi (`/`)**:
   - Terintegrasi SSO Google Workspace (email kampus `@mahasiswa.ac.id`).
   - Mode pengujian cepat DPT lokal (`pemilih1@mahasiswa.ac.id`, `pemilih2@mahasiswa.ac.id`).
   - Single session detection & validasi hak suara.
2. **Bilik Suara Digital (`/voting`)**:
   - Tampilan profil paslon, foto, nomor urut, visi, dan misi.
   - Pilihan interaktif multi-kategori (Presma, DPM, dsb).
   - Dialog konfirmasi pilihan untuk mencegah salah coblos.
   - Perlindungan anti-bot via **Cloudflare Turnstile Widget**.
3. **Bukti Tanda Terima Kriptografis (`/receipt`)**:
   - Menampilkan token bukti suara masuk (**HMAC-SHA256 Token**) tanpa membuka pilihan paslon (*Zero Linkability*).
   - Fitur salin token dan cetak/simpan tanda terima.
4. **Panel Saksi & Rekapitulasi Terkarantina (`/admin`)**:
   - Form otorisasi ganda (*Dual-Control Quorum Secret* untuk KPU & Bawaslu).
   - Menampilkan hasil perolehan suara terbuka dan statistik partisipasi setelah bilik suara resmi ditutup.

---

## 🚀 Panduan Memulai Cepat (Local Development)

### 1. Install Dependencies
Pastikan Node.js v20+ telah terpasang:
```bash
npm install
```

### 2. Konfigurasi Environment Variables
Buat file `.env.local` di root direktori:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

### 3. Jalankan Development Server
```bash
npm run dev
```

Buka peramban di [http://localhost:3000](http://localhost:3000).

---

## 📦 Build & Deployment

Untuk membuat production build:
```bash
npm run build
npm run start
```

### Deploy ke Vercel / Cloudflare Pages
Karena konfigurasi dan `package.json` berada langsung di root branch `frontend`, proyek ini dapat langsung di-deploy ke Vercel atau hosting modern lainnya dengan memilih branch `frontend`.
