# 🚀 DEPLOYMENT & DISASTER RECOVERY PLAN (DRP)
## SISTEM E-VOTING PEMIRA 2026
**Panduan Rilis Produksi, Konfigurasi Cloudflare/Domain, dan Prosedur Pemulihan Darurat**

---

## 1. Topologi Rilis Produksi (Production Topology)

Sistem di-deploy menggunakan **Docker Compose** pada Virtual Private Server (VPS / Cloud Compute) berspesifikasi minimum:
- **CPU:** 4 vCPU (Disarankan 8 vCPU pada hari pemilu)
- **RAM:** 8 GB (Disarankan 16 GB untuk caching PgBouncer & Redis)
- **Storage:** 50 GB NVMe SSD
- **OS:** Ubuntu 22.04 LTS / 24.04 LTS

---

## 2. Panduan Langkah Demi Langkah Deployment

### Langkah 1: Kloning Repositori di Server
```bash
git clone -b main https://github.com/Aurakha/PEMIRA-2026.git /opt/pemira-2026
cd /opt/pemira-2026
```

### Langkah 2: Setup File Environment Produksi
Buat file `/opt/pemira-2026/.env.production`:
```env
NODE_ENV=production
PORT=4000
DATABASE_URL=postgres://postgres:StrongPasswordDb2026@pgbouncer:6432/pemira_db?sslmode=disable
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=StrongPasswordRedis2026
JWT_SECRET=super_secret_pemira_jwt_random_key_64_char_hex_2026
VOTING_SECRET_KEY=hmac_salt_voting_receipt_secret_key_2026
GOOGLE_CLIENT_ID=google_client_id_resmi_kampus.apps.googleusercontent.com
ALLOWED_EMAIL_DOMAINS=mahasiswa.ac.id,campus.ac.id,stu.pnj.ac.id
CLOUDFLARE_TURNSTILE_SECRET_KEY=0x4AAAAAA...
ENABLE_TURNSTILE=true
NEXT_PUBLIC_API_URL=https://pemira.kampus.ac.id/api
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAA...
```

### Langkah 3: Build & Jalankan Seluruh Kontainer
```bash
cd docker
docker-compose --env-file ../.env.production up --build -d
```

### Langkah 4: Verifikasi Status Kontainer
```bash
docker-compose ps
# Pastikan 7 kontainer aktif:
# 1. pemira_postgres        (Healthy)
# 2. pemira_pgbouncer       (Up)
# 3. pemira_redis           (Healthy)
# 4. pemira_api             (Up)
# 5. pemira_ballot_worker   (Up)
# 6. pemira_web             (Up)
# 7. pemira_nginx           (Up)
```

---

## 3. Konfigurasi Cloudflare CDN, DNS, & WAF

Untuk melindungi sistem dari serangan DDoS dan lalu lintas bot masif:

### A. Pengaturan DNS & SSL:
- **A Record:** `pemira.kampus.ac.id` $\rightarrow$ IP Publik Server (Proxy Status: **Proxied / Orange Cloud**).
- **SSL/TLS Mode:** **Full (Strict)** dengan sertifikat Cloudflare Origin CA terpasang di Nginx.
- **Minimum TLS Version:** **TLS 1.3** (Menolak koneksi usang TLS 1.0/1.1).

### B. Cloudflare Web Application Firewall (WAF) Rules:
1. **Rule 1: Bot Fight Mode (Active)**  
   Otomatis memblokir request yang berasal dari data-center scraper atau headless browser tak terverifikasi.
2. **Rule 2: Multi-Zone Rate Limiting:**
   - Path `/api/auth/*` : Maksimal 10 request per 1 menit per IP.
   - Path `/api/vote/submit` : Maksimal 3 request per 1 menit per IP.
3. **Rule 3: Cloudflare Turnstile CAPTCHA:**
   - Dihubungkan ke widget tombol kirim suara untuk verifikasi biometrik pasif tanpa puzzle rumit bagi mahasiswa.

---

## 4. Rencana Pemulihan Bencana (Disaster Recovery Plan - DRP)

### A. Target Pemulihan Layanan (SLA Pemulihan):
- **Recovery Point Objective (RPO):** $< 1\text{ Menit}$ (Maksimal data hilang jika terjadi bencana fisik server).
- **Recovery Time Objective (RTO):** $< 5\text{ Menit}$ (Sistem wajib pulih dan melayani pemilih kembali).

---

### B. Prosedur Pencadangan Otomatis (Automated Backup)

Pencadangan database dilakukan setiap **15 menit** selama hari pemilihan aktif via cron job:

```bash
# Tambahkan ke crontab server (crontab -e)
*/15 * * * * docker exec pemira_postgres pg_dump -U postgres -Fc pemira_db > /opt/backups/pemira_$(date +\%Y\%m\%d_\%H\%M\%S).dump
# Sinkronisasi instan cadangan ke Object Storage eksternal (AWS S3 / Cloudflare R2)
*/15 * * * * aws s3 sync /opt/backups/ s3://pemira-disaster-recovery-2026/backups/
```

Untuk Redis, persistensi dikonfigurasi menggunakan mode **AOF (Append Only File) `fsync everysec`**:
```conf
appendonly yes
appendfsync everysec
```
Setiap transaksi antrean dan distributed lock ditulis ke disk setiap detik, menjamin integritas antrean BullMQ jika terjadi mati lampu mendadak.

---

### C. Prosedur Pemulihan Darurat (Emergency Recovery Runbook)

Jika server utama mengalami kegagalan total (*Total Hardware Failure*):

1. **Siapkan Server Cadangan (Hot Standby Server):**
   Server cadangan telah di-provision dengan Docker & Docker Compose siap pakai.
2. **Unduh Dump Terakhir dari Cloud Storage:**
   ```bash
   aws s3 cp s3://pemira-disaster-recovery-2026/backups/latest.dump /opt/backups/
   ```
3. **Restore Database:**
   ```bash
   docker exec -i pemira_postgres pg_restore -U postgres -d pemira_db -c /opt/backups/latest.dump
   ```
4. **Alihkan DNS Cloudflare (Failover):**
   Ubah IP Address `pemira.kampus.ac.id` di Cloudflare Dashboard menuju IP Server Cadangan (Efektif dalam hitungan 5–15 detik tanpa masa propagasi DNS lama karena diproksi oleh Cloudflare).
5. **Verifikasi Integritas:**
   Jalankan query verifikasi konsistensi partisipasi DPT:
   ```sql
   SELECT 
       COUNT(CASE WHEN has_voted = TRUE THEN 1 END) AS total_dpt_voted,
       (SELECT COUNT(DISTINCT batch_id) FROM ballots) AS total_batches
   FROM voters;
   ```
   Pastikan sistem siap dibuka kembali untuk pemilih.
