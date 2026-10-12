# PEMIRA 2026 - Backend API Service
**High-Performance, Zero-Linkability E-Voting Backend (Fastify + TypeScript + BullMQ + PostgreSQL + Redis)**

Service backend ini mengimplementasikan logika inti pemilu digital mahasiswa yang aman, adil, rahasia (*zero linkability*), dan mampu menangani lonjakan konkurensi ekstrem (3.000–5.000 request serentak).

---

## 🌟 Fitur Utama Backend

1. **Zero-Linkability Ballot Box:**
   - Pemisahan total antara data pemilih (`voters`) dan surat suara (`ballots`).
   - Penulisan suara ke database menggunakan antrean terisolasi **BullMQ Worker** dengan jitter delay acak untuk mencegah *timing attack*.
   - Penerbitan **Cryptographic Voting Receipt (HMAC-SHA256 Token)**.
2. **Pencegahan Coblos Ganda (Double-Voting Prevention):**
   - **Redis Distributed Lock (`SETNX`)** memutus *race condition* saat mahasiswa submit suara secara bersamaan.
   - **Atomic Conditional Database Update** (`WHERE has_voted = FALSE`).
3. **Single Session Enforcement:**
   - Satu akun pemilih hanya boleh aktif di 1 perangkat. Sesi lama di perangkat lain otomatis diakhiri via Redis TTL.
4. **Quarantined Quorum Tally:**
   - Hasil suara dikunci dan hanya dapat dibuka setelah waktu pemilihan selesai dengan 2 kunci otorisasi (KPU & Bawaslu).

---

## 🚀 Panduan Memulai Cepat (Local Development)

### 1. Install Dependencies
Pastikan Node.js v20+ telah terpasang:
```bash
npm install
```

### 2. Jalankan Database & Redis (Docker)
```bash
docker-compose -f docker/docker-compose.yml up -d postgres redis pgbouncer
```

### 3. Konfigurasi Environment Variables
Buat file `.env` di root direktori:
```env
PORT=4000
HOST=0.0.0.0
NODE_ENV=development
DATABASE_URL=postgres://postgres:postgrespassword123@localhost:5432/pemira_db?sslmode=disable
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redispassword123
JWT_SECRET=super_secure_pemira_jwt_secret_key_2026_xyz
VOTING_SECRET_KEY=server_blinded_receipt_salt_hash_key_2026
GOOGLE_CLIENT_ID=mock_google_client_id_for_dev
GOOGLE_CLIENT_SECRET=mock_google_client_secret_for_dev
CLOUDFLARE_TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
ALLOWED_EMAIL_DOMAINS=mahasiswa.ac.id,campus.ac.id,gmail.com
```

### 4. Menjalankan Server API & Worker
Terminal 1 (HTTP Server):
```bash
npm run dev
```

Terminal 2 (Ballot Queue Worker):
```bash
npm run worker:dev
```

API akan berjalan di `http://localhost:4000`.

---

## 📡 Endpoint Utama

- **POST** `/api/auth/login-sso` : Autentikasi Google SSO / Mock dev token & DPT check
- **GET** `/api/auth/me` : Cek profil & status hak suara
- **GET** `/api/vote/candidates` : Ambil daftar paslon (dilayani dari cache Redis)
- **POST** `/api/vote/submit` : Kirim surat suara terenkripsi & anonim
- **POST** `/api/admin/tally-results` : Buka rekapitulasi terkarantina (Dual-Control header)

---

## 🧪 Load Testing (k6)
Lihat panduan lengkap di [`load-tests/README.md`](load-tests/README.md).
