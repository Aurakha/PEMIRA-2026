# SISTEM E-VOTING PEMILIHAN UMUM RAYA (PEMIRA) KAMPUS
**Arsitektur Terdistribusi Berperforma Tinggi & Berintegritas Kriptografis (Luber Jurdil)**  
**Kapasitas:** 8.000 Pemilih Aktif (Lonjakan Konkurensi 3.000–5.000 User Serentak)

---

## 🌟 Fitur Utama & Prinsip Arsitektur

1. **Autentikasi SSO & Validasi Ketat DPT:**
   - Terintegrasi dengan Google Workspace OAuth 2.0 (domain whitelist `@mahasiswa.ac.id` / `@campus.ac.id`).
   - Pencocokan real-time dengan basis data Daftar Pemilih Tetap (DPT).
   - **Single Session Enforcement:** Satu akun hanya diizinkan aktif di 1 perangkat/browser pada saat yang sama. Sesi lama di perangkat lain otomatis diakhiri via Redis TTL.
   - **Election Window Guard:** Bilik suara hanya dapat diakses dalam rentang jam pemilihan resmi yang ditentukan panitia KPU.

2. **Kerahasiaan Suara Mutlak (Zero Linkability / Anonymity):**
   - **Decoupled Architecture:** Pemisahan total antara data pemilih (`voters`) dan kotak suara digital (`ballots`).
   - Sama sekali tidak ada *Foreign Key* atau korelasi identitas pemilih di tabel surat suara.
   - **Anti-Timing Correlation Attack:** Penulisan suara ke database dilakukan secara asinkron melalui antrean BullMQ dengan *micro-batch shuffle* dan *randomized jitter delay*, mencegah penyerang mencocokkan waktu pencoblosan dengan waktu pembuatan suara di database.
   - **Cryptographic Voting Receipt:** Pemilih memperoleh bukti tanda terima digital (HMAC-SHA256 Token) yang membuktikan keikutsertaan tanpa mengungkap paslon yang dipilih.

3. **Penanganan Konkurensi Ekstrem (8.000 Mahasiswa):**
   - **Redis Distributed Locking (`SETNX`):** Memotong *race condition* dan menjamin pencegahan coblos ganda (*Double Voting Prevention*).
   - **Asynchronous Write via BullMQ:** Mencegah *database deadlock* saat ribuan mahasiswa submit suara di menit yang sama.
   - **PgBouncer Connection Pooling:** Mengoptimalkan koneksi PostgreSQL dengan *Transaction Pooling* (mendukung hingga 5.000 concurrent client).
   - **In-Memory & CDN Caching:** Profil paslon dan aset visual di-cache di memori Redis dan Cloudflare CDN, sehingga server backend fokus 100% memproses transaksi suara.

4. **Proteksi Keamanan Siber Komprehensif:**
   - **Cloudflare Turnstile:** Perlindungan bot dan skrip otomatis pada tombol submit suara.
   - **Multi-Zone Rate Limiting:** Pembatasan laju request per IP dan per sesi (Login: 5 req/menit, Voting: 2 req/menit).
   - **Quarantined Tally Endpoint:** Endpoint rekapitulasi hasil perolehan suara dikarantina secara kriptografis dan tidak dapat diakses publik maupun admin sebelum jam pemilihan resmi ditutup (dilindungi dengan *Dual-Control Quorum Secret*).

---

## 🏗️ Tech Stack

- **Frontend:** Next.js 14 (App Router) + Tailwind CSS + Lucide Icons (Mobile-First, Responsive).
- **Backend:** Node.js (Fastify + TypeScript) + BullMQ.
- **Database & Cache:** PostgreSQL 16 + PgBouncer + Redis 7.
- **Infrastruktur:** Docker Compose + Nginx Reverse Proxy + Cloudflare CDN/WAF.
- **Load Testing:** k6 by Grafana.

---

## 🚀 Panduan Memulai Cepat (Quick Start)

### 1. Menjalankan Seluruh Sistem dengan Docker Compose
Pastikan Docker dan Docker Compose telah terpasang:
```bash
cd docker
docker-compose up --build -d
```

Layanan yang akan aktif:
- **Web App (Voter Portal):** `http://localhost:80` (via Nginx) atau `http://localhost:3000`
- **Backend API:** `http://localhost:80/api` atau `http://localhost:4000`
- **PgBouncer Pooler:** `localhost:6432`
- **PostgreSQL Database:** `localhost:5432`
- **Redis Cache & Queue:** `localhost:6379`

### 2. Memeriksa Status Layanan
```bash
docker-compose ps
docker logs -f pemira_ballot_worker
```

### 3. Akses Portal Pemilih
Buka peramban ke [http://localhost:80](http://localhost:80). Anda dapat langsung menguji login menggunakan akun sampel DPT:
- `pemilih1@mahasiswa.ac.id` (Andi Pratama - Teknik Informatika)
- `pemilih2@mahasiswa.ac.id` (Bella Safitri - Manajemen)

---

## 📡 Dokumentasi Endpoint Kunci API

### 1. Autentikasi SSO & DPT Matching
- **POST** `/api/auth/login-sso`
- **Body:** `{"idToken": "mock-token:pemilih1@mahasiswa.ac.id"}`
- **Response:**
  ```json
  {
    "success": true,
    "token": "eyJhbGciOi...",
    "voter": {
      "id": "44444444-4444-4444-4444-444444444001",
      "nim": "13523001",
      "fullName": "Andi Pratama",
      "hasVoted": false
    }
  }
  ```

### 2. Submit Pilihan Suara (Atomic & Zero Linkability)
- **POST** `/api/vote/submit`
- **Headers:** `Authorization: Bearer <JWT>`, `Content-Type: application/json`
- **Body:**
  ```json
  {
    "turnstileToken": "mock-turnstile-token-dev",
    "votes": [
      {
        "categoryId": "22222222-2222-2222-2222-222222222221",
        "candidateId": "33333333-3333-3333-3333-333333333331"
      }
    ]
  }
  ```
- **Response (HTTP 202 Accepted):**
  ```json
  {
    "success": true,
    "receiptToken": "VOTE-RCPT-A79B3E8C12...",
    "message": "Suara Anda telah berhasil masuk ke kotak suara digital."
  }
  ```

### 3. Rekapitulasi Suara Terkarantina (Dual-Control Quorum)
- **POST** `/api/admin/tally-results`
- **Headers:**  
  `x-kpu-secret-key: kpu-master-secret-2026`  
  `x-bawaslu-secret-key: bawaslu-audit-secret-2026`
- **Aturan:** Hanya merespons jika waktu pemilihan telah resmi ditutup (`NOW() > end_time`).

---

## 🧪 Pengujian Beban (Load Testing k6)

Untuk menyimulasikan 3.000–5.000 mahasiswa yang mengakses sistem secara serentak:
```bash
# 1. Generate 8.000 DPT ke database
node load-tests/data/generate_mock_dpt.js
docker exec -i pemira_postgres psql -U postgres -d pemira_db < ./load-tests/data/seed_8000_voters.sql

# 2. Jalankan simulasi lonjakan k6
k6 run --env TARGET_URL=http://localhost:80/api load-tests/scripts/spike-test.js
```
Pelajari panduan lengkap dan metrik SLA di [load-tests/README.md](file:///d:/Pemira/load-tests/README.md).
