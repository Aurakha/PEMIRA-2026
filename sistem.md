# 🗳️ BLUEPRINT ARSITEKTUR & DESAIN SISTEM E-VOTING PEMIRA 2026
**Arsitektur Terdistribusi Berperforma Tinggi & Berintegritas Kriptografis (Zero-Linkability)**

---

## 📌 1. Ringkasan Eksekutif & Latar Belakang

Sistem E-Voting Pemilihan Umum Raya (PEMIRA) 2026 dirancang untuk memfasilitasi pemilihan pimpinan mahasiswa kampus secara digital dengan menjunjung tinggi asas **Luber Jurdil** (Langsung, Umum, Bebas, Rahasia, Jujur, dan Adil).

### 🔍 Evaluasi Masalah Sistem Lama (PNJ 2025) vs Solusi Baru (2026)

| Komponen | Sistem Lama (PNJ 2025) | Sistem Baru (PEMIRA 2026) |
| :--- | :--- | :--- |
| **Pola Arsitektur** | Monolithic Backend + React SPA (Hardcoded API) | Decoupled Client-Server (Go Clean Architecture + Modern React SPA) |
| **Kerahasiaan Suara** | ❌ **Bocor**: Tabel `votes` memiliki kolom `user_id` yang berelasi langsung ke pemilih. Admin bisa melihat pilihan mahasiswa. | ✅ **Zero-Linkability**: Pemisahan total antara data pemilih (`voters`) dan kotak suara digital (`ballots`). Sama sekali tanpa Foreign Key identitas. |
| **Pencegahan Double-Voting** | ⚠️ Cek `HasVoted` manual tanpa *concurrency lock* (rentan *race condition* jika diklik 2x serentak). | ✅ **2-Layer Protection**: Redis Distributed Lock (`SETNX`) + Atomic Database Conditional Update (`WHERE has_voted = false`). |
| **Bukti Pemilihan** | ❌ Tidak ada tanda terima bagi mahasiswa. | ✅ **Cryptographic Voting Receipt (HMAC-SHA256)**: Mahasiswa mendapat token bukti suara masuk tanpa mengungkap paslon yang dipilih. |
| **Keamanan Autentikasi** | ⚠️ Nilai `state` OAuth hardcoded (`"pseudo-random"`) rentan CSRF, regex email rapuh. | ✅ State OAuth acak dengan TTL Redis, resilient email domain validator & PKCE. |
| **Konkurensi & Skalabilitas** | Query GORM default tanpa tuning connection pool & caching paslon. | Tuning Go Connection Pool (`SetMaxOpenConns`), In-Memory Caching untuk data paslon statis. |

---

## 🏗️ 2. Arsitektur Sistem Keseluruhan

Sistem menggunakan model **Client-Server Decoupled** berkinerja tinggi:

```mermaid
graph TD
    User["👤 Mahasiswa / Pemilih"] -->|HTTPS / WSS| Web["💻 Frontend Portal (React + Vite)"]
    Admin["🛡️ Panitia KPU / Saksi"] -->|HTTPS| WebAdmin["💻 Panel Admin & Rekapitulasi"]
    
    Web -->|REST API JSON| Nginx["🌐 Reverse Proxy (Nginx)"]
    WebAdmin -->|REST API JSON| Nginx
    
    Nginx -->|Load Balanced| Backend["⚡ Backend API (Golang Gin/Fiber)"]
    
    Backend -->|Distributed Lock & Token Cache| Redis["🔴 Redis In-Memory"]
    Backend -->|Atomic Transaction (ACID)| DB[("🐘 Relational DB (PostgreSQL / MySQL 8)")]
```

---

## 🛡️ 3. Pilar Inti: Zero-Linkability Ballot Box (Kerahasiaan Suara Mutlak)

Untuk menjamin tidak ada seorang pun (termasuk superadmin database) yang dapat melacak pilihan mahasiswa, kotak suara digital dirancang menggunakan **Decoupled Ballot Box Pattern**:

```mermaid
sequenceDiagram
    autonumber
    actor V as Mahasiswa
    participant API as Backend API (Go)
    participant R as Redis (Lock)
    participant DPT as Tabel Voters (DPT)
    participant BOX as Tabel Ballots (Kotak Suara)

    V->>API: POST /api/vote/submit (JWT + Paslon Pilihan)
    API->>R: SETNX lock:vote:<user_id> (TTL 30s)
    alt Lock Gagal
        API-->>V: HTTP 429: Transaksi sedang berlangsung
    else Lock Berhasil
        API->>DPT: UPDATE voters SET has_voted = TRUE, voted_at = NOW(), receipt_hash = <hash> WHERE id = <user_id> AND has_voted = FALSE
        alt Rows Affected == 0 (Sudah pernah mencoblos)
            API-->>V: HTTP 400: Anda sudah menggunakan hak suara!
        else Rows Affected == 1 (Berhasil)
            API->>BOX: INSERT INTO ballots (id, chair_id, candidate_group_id, timestamp)
            Note over BOX: TIDAK ADA voter_id atau FK ke pemilih!
            API->>R: DEL lock:vote:<user_id>
            API-->>V: HTTP 201: {"success": true, "receipt_token": "RCPT-XXXX..."}
        end
    end
```

### Karakteristik Kriptografis:
1. **Receipt Token**: Dihasilkan menggunakan `HMAC-SHA256(voter_id + timestamp, ServerSecretKey)`.
2. Token ini disimpan sebagai `receipt_hash` pada tabel `voters` untuk membuktikan mahasiswa tersebut telah mencoblos.
3. Tabel `ballots` disimpan tanpa korelasi identitas atau urutan waktu langsung (diberi jitter acak) untuk mencegah *timing attack*.

---

## 📊 4. Skema Basis Data Lengkap (DDL SQL)

```sql
-- ==========================================================
-- 1. TABEL DAFTAR PEMILIH TETAP (DPT) & STATUS KEIKUTSERTAAN
-- ==========================================================
CREATE TABLE voters (
    id VARCHAR(36) PRIMARY KEY,              -- UUID
    nim VARCHAR(20) NOT NULL UNIQUE,         -- Nomor Induk Mahasiswa
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,      -- Email kampus resmi
    faculty VARCHAR(100) NOT NULL,           -- Fakultas
    major VARCHAR(100) NOT NULL,             -- Jurusan (TIK, Elektro, dll.)
    generation INT NOT NULL,                 -- Tahun Angkatan (misal: 2023)
    role VARCHAR(20) DEFAULT 'voter',        -- 'voter', 'admin', 'kpu', 'bawaslu'
    has_voted BOOLEAN DEFAULT FALSE,         -- Penanda status coblos
    voted_at TIMESTAMP NULL,                 -- Waktu pencoblosan
    receipt_hash VARCHAR(64) NULL,           -- Hash tanda terima digital
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_voter_email (email),
    INDEX idx_voter_nim (nim),
    INDEX idx_voter_major (major)
);

-- ==========================================================
-- 2. TABEL KATEGORI PEMILIHAN / KURSI JABATAN
-- ==========================================================
CREATE TABLE chairs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,              -- Contoh: "BEM", "MPM", "HMJ TIK"
    scope VARCHAR(50) NOT NULL,              -- 'ALL' (Kampus umum) atau nama jurusan spesifik
    max_selection INT DEFAULT 1,             -- Jumlah paslon yang boleh dipilih
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 3. TABEL PASANGAN CALON (CANDIDATE GROUPS)
-- ==========================================================
CREATE TABLE candidate_groups (
    id VARCHAR(36) PRIMARY KEY,              -- UUID
    chair_id INT NOT NULL,                   -- Relasi ke kursi jabatan
    ballot_number INT NOT NULL,              -- Nomor urut paslon (1, 2, 3...)
    leader_name VARCHAR(150) NOT NULL,
    vice_name VARCHAR(150) NULL,
    vision TEXT,
    mission TEXT,
    work_programs TEXT,
    image_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chair_id) REFERENCES chairs(id) ON DELETE CASCADE,
    UNIQUE KEY uq_chair_ballot_no (chair_id, ballot_number)
);

-- ==========================================================
-- 4. KOTAK SUARA DIGITAL (BALLOTS) - ZERO LINKABILITY
-- ==========================================================
CREATE TABLE ballots (
    id VARCHAR(36) PRIMARY KEY,              -- UUID Suara Acak
    chair_id INT NOT NULL,                   -- Kategori kursi
    candidate_group_id VARCHAR(36) NOT NULL, -- Paslon yang dipilih
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chair_id) REFERENCES chairs(id),
    FOREIGN KEY (candidate_group_id) REFERENCES candidate_groups(id)
    -- CATATAN KRITIS: SAMA SEKALI TIDAK ADA KOLOM voter_id DI SINI!
);

-- ==========================================================
-- 5. AUDIT LOG PANITIA & AKSES SISTEM
-- ==========================================================
CREATE TABLE audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_id VARCHAR(36) NOT NULL,
    action VARCHAR(100) NOT NULL,            -- 'LOGIN', 'DPT_IMPORT', 'CONFIG_CHANGE'
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT,
    payload JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## ⚡ 5. Penanganan Konkurensi & Performa Tinggi (High Concurrency)

Untuk menangani lonjakan serentak (3.000–5.000 request pada jam puncak pemilu):

1. **Redis Caching untuk Data Statis**:
   - Profil paslon, visi-misi, dan daftar kursi disimpan di Redis cache dengan TTL 1 jam. Backend tidak perlu membebani database setiap kali pemilih membuka bilik suara.
2. **Go Database Connection Pooling**:
   ```go
   db.SetMaxOpenConns(100)
   db.SetMaxIdleConns(25)
   db.SetConnMaxLifetime(5 * time.Minute)
   ```
3. **Optimistic Locking / Conditional Update**:
   - Eksekusi atomic update langsung di level database engine mencegah masalah *lost update* dan *deadlock*.

---

## 📡 6. Spesifikasi Endpoint REST API

### A. Autentikasi & Pengguna (`/api/auth`)
* `GET  /api/auth/google/login` : Inisialisasi Google OAuth dengan CSRF State acak.
* `GET  /api/auth/google/callback` : Pertukaran kode OAuth -> Verifikasi domain mahasiswa -> Generate JWT token.
* `GET  /api/auth/me` : Membaca profil pemilih yang sedang login (NIM, Jurusan, status `has_voted`).

### B. Bilik Suara (`/api/vote`)
* `GET  /api/vote/candidates` : Mengambil daftar paslon yang **berhak dipilih** oleh mahasiswa sesuai jurusannya.
* `POST /api/vote/submit` : Mengirim surat suara (Atomic transaction + Zero Linkability).
  ```json
  // Request Body:
  {
    "votes": [
      { "chairId": 1, "candidateGroupId": "uuid-paslon-bem" },
      { "chairId": 5, "candidateGroupId": "uuid-paslon-hmj-tik" }
    ]
  }
  ```
* `GET  /api/vote/receipt/:receiptCode` : Cek verifikasi keabsahan tanda terima suara.

### C. Administrasi & Rekapitulasi (`/api/admin`)
* `GET  /api/admin/dpt` : Manajemen DPT (pencarian & filter).
* `POST /api/admin/dpt/import` : Unggah massal DPT via file CSV/Excel.
* `GET  /api/admin/tally` : Rekapitulasi hasil suara (terkunci sebelum waktu pemilihan resmi ditutup).

---

## 📂 7. Struktur Folder Proyek Rekomendasi (Clean Architecture)

```text
PEMIRA-2026/
├── .gitignore
├── SYSTEM_DESIGN.md
├── docker/
│   ├── docker-compose.yml
│   └── nginx/default.conf
│
├── backend/                       # Golang REST API Service
│   ├── cmd/
│   │   └── api/
│   │       └── main.go           # Entry point aplikasi
│   ├── internal/
│   │   ├── config/               # Manajemen .env & konfigurasi
│   │   ├── database/             # Koneksi DB & Skema Migrasi
│   │   ├── domain/               # Struct Entity, DTO, & Interface
│   │   ├── handler/              # HTTP Controller (Gin)
│   │   ├── middleware/           # JWT Auth, CORS, Rate Limit
│   │   ├── repository/           # Lapisan Query Database
│   │   └── service/              # Logika Bisnis (Vote Engine, Auth, Paslon)
│   ├── pkg/
│   │   ├── crypto/               # Generator Hash & HMAC Receipt
│   │   └── redis/                # Redis Client & Distributed Locker
│   ├── go.mod
│   └── .env.example
│
└── frontend/                      # React 19 + Vite + Tailwind CSS
    ├── src/
    │   ├── assets/               # Logo & Gambar
    │   ├── components/           # UI Reusable (Navbar, CardPaslon, Modal)
    │   ├── hooks/                # Custom Hooks (useAuth, useVote)
    │   ├── layouts/              # MainLayout, AdminLayout
    │   ├── pages/
    │   │   ├── Home.tsx          # Landing & Countdown
    │   │   ├── Candidate.tsx     # Profil & Visi Misi
    │   │   ├── VotingBooth.tsx   # Bilik Suara Digital
    │   │   ├── Receipt.tsx       # Tanda Terima Coblos
    │   │   ├── LiveCount.tsx     # Grafik Rekapitulasi Suara
    │   │   └── Admin/            # Manajemen DPT & Paslon
    │   ├── services/             # Axios/Fetch API Client
    │   ├── App.tsx
    │   └── main.tsx
    ├── package.json
    └── vite.config.ts
```

---

## 🗺️ 8. Roadmap Tahapan Pengerjaan

1. **Tahap 1 (Fondasi):**
   - Inisialisasi struktur folder `backend/` dan `frontend/`.
   - Setup migrasi database SQL (DPT, Chairs, Candidate Groups, Ballots).
2. **Tahap 2 (Backend Core & Keamanan):**
   - Implementasi Engine Voting Atomik dengan Redis Distributed Lock.
   - Implementasi generator tanda terima (Receipt Token).
   - Implementasi Google SSO OAuth & JWT Middleware.
3. **Tahap 3 (Frontend User Portal):**
   - Halaman Landing Page responsif & Countdown.
   - Bilik suara digital yang interaktif dan ramah ponsel (*mobile-first*).
   - Halaman cetak bukti pencoblosan digital.
4. **Tahap 4 (Admin Panel & Live Count):**
   - Dasbor admin untuk kelola DPT dan paslon.
   - Visualisasi Live Count chart real-time.
5. **Tahap 5 (Testing & Verifikasi):**
   - Uji coba skenario *double voting* secara konkurensi.
   - Pengujian beban (*load testing*) untuk menjamin kestabilan sistem.
