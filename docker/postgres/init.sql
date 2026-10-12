-- ====================================================================
-- E-VOTING PEMIRA KAMPUS - HIGH PERFORMANCE & ZERO LINKABILITY DDL
-- Database Engine: PostgreSQL 16+
-- Concurrency Target: 8.000 Pemilih Aktif (Peak 3.000 - 5.000 VU)
-- Asas: Luber Jurdil (Zero Linkability / Cryptographic Voter Privacy)
-- ====================================================================

-- Pastikan extension pgcrypto dan uuid aktif
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Set timezone standar
SET TIME ZONE 'Asia/Jakarta';

-- ====================================================================
-- 1. TABEL ELECTIONS (Konfigurasi & Window Akses Pemilihan)
-- ====================================================================
CREATE TABLE IF NOT EXISTS elections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(150) NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT FALSE NOT NULL,
    is_tallied BOOLEAN DEFAULT FALSE NOT NULL, -- Dikunci sampai pemilu resmi ditutup
    allowed_domains TEXT[] NOT NULL DEFAULT ARRAY['mahasiswa.ac.id', 'campus.ac.id'],
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_election_time CHECK (end_time > start_time)
);

-- ====================================================================
-- 2. TABEL KATEGORI PEMILIHAN (Presma, DPM, dsb)
-- ====================================================================
CREATE TABLE IF NOT EXISTS election_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    max_selection INT DEFAULT 1 NOT NULL,
    display_order INT DEFAULT 1 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_categories_election ON election_categories(election_id, display_order);

-- ====================================================================
-- 3. TABEL KANDIDAT / PASLON
-- ====================================================================
CREATE TABLE IF NOT EXISTS candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES election_categories(id) ON DELETE CASCADE,
    candidate_number INT NOT NULL,
    chairman_name VARCHAR(150) NOT NULL,
    vice_chairman_name VARCHAR(150),
    vision TEXT,
    mission TEXT,
    photo_url VARCHAR(255),
    display_order INT DEFAULT 1 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_candidate_number UNIQUE (category_id, candidate_number)
);

CREATE INDEX IF NOT EXISTS idx_candidates_category ON candidates(category_id, display_order);

-- ====================================================================
-- 4. TABEL VOTERS (Daftar Pemilih Tetap - DPT)
-- PRINSIP KEAMANAN:
-- - Menyimpan data identitas mahasiswa & status hak suara.
-- - TIDAK ADA FOREIGN KEY ATAU HUBUNGAN APAPUN KE TABEL BALLOTS.
-- ====================================================================
CREATE TABLE IF NOT EXISTS voters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    nim VARCHAR(30) NOT NULL,
    email VARCHAR(150) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    faculty VARCHAR(100),
    study_program VARCHAR(100),
    has_voted BOOLEAN DEFAULT FALSE NOT NULL,
    voted_at TIMESTAMPTZ,
    receipt_hash VARCHAR(128), -- Token bukti keikutsertaan (HMAC tanpa memuat pilihan paslon)
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_voter_email UNIQUE (election_id, email),
    CONSTRAINT uq_voter_nim UNIQUE (election_id, nim)
);

-- Index b-tree performa tinggi untuk pencarian saat login dan update status coblos
CREATE INDEX IF NOT EXISTS idx_voters_email_search ON voters(email);
CREATE INDEX IF NOT EXISTS idx_voters_election_voted ON voters(election_id, has_voted);

-- ====================================================================
-- 5. TABEL BALLOTS (Kotak Suara Digital Terisolasi / Zero Linkability)
-- PRINSIP KEAMANAN:
-- - Sama sekali TANPA identitas pemilih (NIM/Email/Voter ID).
-- - Menggunakan batch_id dan created_date (tanpa microsecond order)
--   untuk mencegah korelasi waktu (Anti-Timing Correlation Attack).
-- ====================================================================
CREATE TABLE IF NOT EXISTS ballots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES election_categories(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
    batch_id UUID NOT NULL, -- Diberikan oleh Queue Worker saat flush micro-batch
    created_date DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_ballots_tally ON ballots(election_id, category_id, candidate_id);
CREATE INDEX IF NOT EXISTS idx_ballots_batch ON ballots(batch_id);

-- ====================================================================
-- 6. TABEL AUDIT LOGS (Integritas & Rekam Jejak Sistem)
-- ====================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor VARCHAR(150) NOT NULL,
    action VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_date ON audit_logs(action, created_at);

-- ====================================================================
-- SEED DATA AWAL UNTUK PENGUJIAN & DEVELOPMENT
-- ====================================================================
DO $$
DECLARE
    v_election_id UUID;
    v_cat_presma UUID;
    v_cat_dpm UUID;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM elections LIMIT 1) THEN
        -- Insert Pemilihan Aktif (Window 08:00 - 16:00 WIB)
        INSERT INTO elections (
            id, title, description, start_time, end_time, is_active, is_tallied, allowed_domains
        ) VALUES (
            '11111111-1111-1111-1111-111111111111',
            'Pemilihan Umum Raya Mahasiswa (PEMIRA) 2026/2027',
            'Pemilihan Presiden & Wakil Presiden Mahasiswa serta Anggota DPM Kampus',
            NOW() - INTERVAL '1 hour',
            NOW() + INTERVAL '12 hours',
            TRUE,
            FALSE,
            ARRAY['mahasiswa.ac.id', 'campus.ac.id', 'gmail.com'] -- gmail.com disertakan utk testing dev
        ) RETURNING id INTO v_election_id;

        -- Insert Kategori Presma
        INSERT INTO election_categories (
            id, election_id, name, max_selection, display_order
        ) VALUES (
            '22222222-2222-2222-2222-222222222221',
            v_election_id,
            'Presiden & Wakil Presiden Mahasiswa',
            1,
            1
        ) RETURNING id INTO v_cat_presma;

        -- Insert Paslon 1
        INSERT INTO candidates (
            id, category_id, candidate_number, chairman_name, vice_chairman_name, vision, mission, photo_url, display_order
        ) VALUES (
            '33333333-3333-3333-3333-333333333331',
            v_cat_presma,
            1,
            'Ahmad Fauzi (Teknik Informatika 2023)',
            'Siti Rahma (Kedokteran 2023)',
            'Mewujudkan Kampus Inklusif, Transparan, dan Berdaya Saing Global berbasis Teknologi.',
            '1. Digitalisasi birokrasi ormawa.\n2. Advokasi biaya UKT berkeadilan.\n3. Inkubasi riset & karir mahasiswa.',
            'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
            1
        );

        -- Insert Paslon 2
        INSERT INTO candidates (
            id, category_id, candidate_number, chairman_name, vice_chairman_name, vision, mission, photo_url, display_order
        ) VALUES (
            '33333333-3333-3333-3333-333333333332',
            v_cat_presma,
            2,
            'Bima Perkasa (Ekonomi & Bisnis 2023)',
            'Dian Lestari (Hukum 2023)',
            'Sinergi Kolaboratif Mengawal Keadilan Sosial dan Kesejahteraan Mahasiswa.',
            '1. Optimalisasi dana kegiatan kemahasiswaan.\n2. Layanan bantuan hukum & mental health gratis.\n3. Kolaborasi lintas rumpun keilmuan.',
            'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
            2
        );

        -- Insert Sampel DPT
        INSERT INTO voters (
            id, election_id, nim, email, full_name, faculty, study_program, has_voted
        ) VALUES 
        ('44444444-4444-4444-4444-444444444001', v_election_id, '13523001', 'pemilih1@mahasiswa.ac.id', 'Andi Pratama', 'Sekolah Teknik Elektro dan Informatika', 'Teknik Informatika', FALSE),
        ('44444444-4444-4444-4444-444444444002', v_election_id, '13523002', 'pemilih2@mahasiswa.ac.id', 'Bella Safitri', 'Fakultas Ekonomi dan Bisnis', 'Manajemen', FALSE),
        ('44444444-4444-4444-4444-444444444003', v_election_id, '13523003', 'pemilih3@mahasiswa.ac.id', 'Citra Kirana', 'Fakultas Kedokteran', 'Pendidikan Dokter', FALSE),
        ('44444444-4444-4444-4444-444444444004', v_election_id, '13523004', 'pemilih4@mahasiswa.ac.id', 'Doni Kusuma', 'Fakultas Hukum', 'Ilmu Hukum', FALSE);

    END IF;
END $$;
