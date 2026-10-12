# PANDUAN PENGUJIAN BEBAN TINGGI (LOAD TESTING) E-VOTING PEMIRA
**Target Uji:** 8.000 Pemilih Terdaftar, Lonjakan Puncak 3.000–5.000 Pengguna Aktif Serentak (*Virtual Users*)  
**Alat Pengujian:** [k6 by Grafana](https://k6.io/)  

---

## 1. Persiapan Lingkungan Uji

### A. Instalasi k6
- **Windows (via Chocolatey / Winget / Scoop):**
  ```powershell
  choco install k6
  # atau
  winget install k6
  ```
- **Linux (Debian / Ubuntu):**
  ```bash
  sudo gpg -k
  sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
  echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
  sudo apt-get update && sudo apt-get install k6
  ```
- **macOS:**
  ```bash
  brew install k6
  ```

### B. Injeksi 8.000 Data Pemilih Tetap (DPT) ke Database
Jalankan file SQL yang telah di-generate ke dalam database PostgreSQL:
```bash
# Jika menggunakan Docker Compose:
docker exec -i pemira_postgres psql -U postgres -d pemira_db < ./load-tests/data/seed_8000_voters.sql
```

---

## 2. Tahapan Eksekusi Pengujian Beban

Jalankan skrip k6 dengan menentukan target URL (baik melalui Nginx proxy port 80 atau langsung ke API port 4000):

```bash
# Menjalankan Spike Test 5.000 VU Serentak
k6 run --env TARGET_URL=http://localhost:80/api load-tests/scripts/spike-test.js
```

### Profil Lonjakan Lalu Lintas (*Traffic Profile*):
1. **00:00 - 01:00 (Ramp-up 0 → 2.000 VU):** Mensimulasikan mahasiswa yang serempak membuka bilik suara tepat pukul 08:00 WIB.
2. **01:00 - 04:00 (Peak Sustained 3.500 → 5.000 VU):** Uji ketahanan puncak transaksi submit voting serentak dengan antrean BullMQ, PgBouncer, dan Redis Locking.
3. **04:00 - 05:00 (Ramp-down 5.000 → 0 VU):** Stabilisasi lalu lintas dan penyelesaian backlog antrean oleh Background Worker.

---

## 3. Metrik Evaluasi & Ambang Batas (SLA)

| Metrik | Ambang Batas (Threshold) | Tujuan Pengujian |
| :--- | :--- | :--- |
| **P95 Latency** | `< 450 ms` | Memastikan 95% pemilih merasakan response cepat tanpa lagging |
| **P99 Latency** | `< 800 ms` | Menjamin tidak ada request yang mengalami timeout di browser pemilih |
| **HTTP Error Rate** | `< 0.1%` | Menjamin keandalan transaksi tanpa kegagalan koneksi |
| **Vote Success Rate**| `> 99.0%` | Memastikan suara sah diterima dan dikunci ke antrean (HTTP 202) |
| **Double Vote Rejections** | `100% Terblokir (HTTP 409)` | Memastikan percobaan coblos ganda ditolak mentah-mentah |

---

## 4. Verifikasi Integritas Pasca Pengujian (Zero Linkability Audit)

Setelah pengujian selesai, jalankan audit SQL berikut untuk memverifikasi konsistensi matematis sistem:

```sql
-- 1. Verifikasi Konsistensi Partisipasi vs Kotak Suara
SELECT 
    (SELECT COUNT(*) FROM voters WHERE has_voted = TRUE) AS total_pemilih_mencoblos,
    (SELECT COUNT(*) FROM ballots) AS total_suara_di_kotak_suara;
```
> **HASIL WAJIB:** Nilai `total_pemilih_mencoblos` **HARUS PERSIS SAMA** dengan `total_suara_di_kotak_suara`. Selisih harus bernilai **0**.

```sql
-- 2. Verifikasi Ketiadaan Pelacakan Identitas (Zero Linkability)
-- Pastikan tidak ada kolom identitas di tabel ballots
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'ballots';
```
> **HASIL WAJIB:** Kolom hanya berupa `id`, `election_id`, `category_id`, `candidate_id`, `batch_id`, dan `created_date`. Tidak terdapat foreign key ke `voters`.

```sql
-- 3. Verifikasi Distribusi Batch (Anti-Timing Correlation)
SELECT batch_id, COUNT(*) as suara_per_batch, created_date 
FROM ballots 
GROUP BY batch_id, created_date 
ORDER BY COUNT(*) DESC 
LIMIT 10;
```
