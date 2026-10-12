# 📋 PRODUCT REQUIREMENT DOCUMENT (PRD) & USER STORIES
## SISTEM E-VOTING PEMILIHAN UMUM RAYA (PEMIRA) 2026
**Arsitektur Terdistribusi Berintegritas Kriptografis & Berkinerja Tinggi (Luber Jurdil)**

---

## 1. Ringkasan Eksekutif & Visi Produk

Sistem E-Voting PEMIRA 2026 dirancang untuk memfasilitasi pesta demokrasi kampus yang modern, transparan, dan terpercaya bagi **8.000 mahasiswa aktif**, dengan kemampuan menangani lonjakan beban ekstrem **3.000 hingga 5.000 pemilih serentak** pada jam-jam puncak pemungutan suara.

Sistem beroperasi di atas prinsip utama **Luber Jurdil**:
- **Langsung:** Mahasiswa memilih langsung tanpa perantara.
- **Umum:** Hak pilih terbuka bagi seluruh mahasiswa yang terdaftar sah di DPT.
- **Bebas:** Pemilih bebas menentukan paslon tanpa intimidasi atau pemaksaan antarmuka.
- **Rahasia (Zero Linkability):** Pilihan mahasiswa terisolasi secara kriptografis; tidak seorang pun (termasuk superadmin database atau panitia KPU) dapat mengetahui siapa memilih siapa.
- **Jujur:** Setiap suara dihitung tepat 1 kali (*Zero Double Voting*, dilindungi Redis lock).
- **Adil:** Hasil suara dikarantina secara ketat (*Dual-Control Quorum*) dan dilarang bocor sebelum pemilu resmi ditutup.

---

## 2. Cakupan Fitur Fungsional (Functional Requirements)

### Modul 1: Autentikasi & Validasi DPT
1. **Google Workspace SSO:** Login wajib menggunakan akun Google resmi kampus (`@mahasiswa.ac.id`, `@campus.ac.id`, `@stu.pnj.ac.id`).
2. **Auto-Parser Identitas Mahasiswa:** Sistem otomatis mengekstrak Nama, Jurusan, dan Angkatan dari struktur email kampus resmi.
3. **Single Session Enforcement:** Satu akun pemilih hanya diizinkan aktif di 1 sesi perangkat/browser pada waktu yang sama. Login baru otomatis menimpa sesi lama di Redis.
4. **DPT Eligibility Guard:** Akses ditolak jika akun tidak terdaftar dalam Daftar Pemilih Tetap aktif.

### Modul 2: Bilik Suara Digital (Voting Booth)
1. **Penyajian Paslon Berkecepatan Tinggi:** Profil paslon (foto, visi, misi, program kerja, nomor urut) dilayani dari memori cache Redis.
2. **Kategori Multi-Jabatan:** Mendukung pemilihan berjenjang (Presiden Mahasiswa, MPM, HMJ/Himpunan Mahasiswa Jurusan).
3. **Turnstile Bot Defense:** Tombol kirim suara dilindungi oleh Cloudflare Turnstile CAPTCHA tak kasat mata (*invisible token*).
4. **Dialog Konfirmasi Pilihan:** Modal pratinjau pilihan suara sebelum pengiriman final untuk mencegah salah klik.
5. **HMAC Digital Voting Receipt:** Pemilih yang sukses mencoblos menerima token bukti tanda terima digital berformat `VOTE-RCPT-<HMAC-SHA256>` yang dapat dicetak/disimpan.

### Modul 3: Rekapitulasi & Panel Saksi (Tally Quorum)
1. **Quarantined Results:** Hasil perolehan suara terkunci rapat dan memblokir seluruh request selama jam pemungutan suara masih berlangsung (`NOW() < end_time`).
2. **Dual-Control Quorum Secret:** Pembukaan hasil suara pasca-pemilu mewajibkan dua kunci otorisasi rahasia: Kunci Master KPU dan Kunci Audit Pengawas (Bawaslu).
3. **Audit Partisipasi Suara:** Menampilkan perbandingan jumlah DPT, jumlah suara sah, dan persentase kehadiran pemilih (*voter turnout*).

### Modul 4: Administrasi Panitia KPU
1. **Bulk Import DPT:** Mengunggah daftar pemilih secara massal berbasis array email kampus dengan auto-resolve NIM & Jurusan.
2. **DPT Not-Voted Monitor:** Menampilkan daftar pemilih yang belum menggunakan hak suara untuk evaluasi partisipasi pemilu.
3. **Sinkronisasi Waktu Server (`/api/time`):** Menjamin seluruh browser pemilih mengacu pada waktu atomik server KPU.

---

## 3. Aturan Bisnis (Business Rules)

| ID | Kode Aturan | Deskripsi & Penegakan Sistem |
| :--- | :--- | :--- |
| **BR-01** | **One Person One Vote** | Mahasiswa hanya memiliki tepat 1 hak suara. Pemilihan kedua akan diblokir dengan `HTTP 409 Conflict`. |
| **BR-02** | **Zero Linkability** | Tidak diperbolehkan adanya kolom `voter_id` atau relasi Foreign Key apa pun pada tabel surat suara (`ballots`). |
| **BR-03** | **Election Window** | Akses submit suara hanya diizinkan saat `start_time <= NOW() <= end_time` dan `is_active = TRUE`. |
| **BR-04** | **Quorum Results** | Hasil suara dilarang dibuka publik/admin tanpa memasukkan `x-kpu-secret-key` DAN `x-bawaslu-secret-key`. |
| **BR-05** | **Anti-Timing Attack** | Penulisan suara ke database wajib melalui antrean asinkron dengan penambahan *randomized jitter delay* (100–500 ms). |

---

## 4. Batasan Teknis & Non-Functional Requirements (NFR)

1. **Throughput & Skalabilitas:**
   - Mampu melayani **3.000–5.000 request serentak** pada jam sibuk.
   - Response time endpoint submit suara $\le 500\text{ ms}$ pada 95th persentil (p95).
2. **Availability & Zero Data Loss:**
   - Ketersediaan sistem $99.9\%$ selama masa pemilihan aktif.
   - Seluruh transaksi perubahan status DPT menggunakan transaksi ACID PostgreSQL dengan *conditional lock*.
3. **Kompatibilitas:**
   - Responsif pada layar ponsel (*mobile-first*, ukuran layar 360px ke atas) hingga desktop (4K).

---

## 5. User Stories & Kriteria Penerimaan (Acceptance Criteria)

### A. Sudut Pandang Pemilih (Mahasiswa)

#### US-01: Login SSO & Validasi Hak Suara
> *Sebagai seorang mahasiswa kampus,*  
> *Saya ingin masuk ke portal Pemira menggunakan akun email resmi kampus saya,*  
> *Agar identitas dan hak pilih saya terverifikasi secara sah dan instan tanpa perlu mendaftar manual.*

**Kriteria Penerimaan (Gherkin Format):**
```gherkin
Scenario: Login Mahasiswa Terdaftar di DPT
  Given Mahasiswa membuka halaman login portal Pemira
  When Mahasiswa mengautentikasi akun Google dengan domain "@mahasiswa.ac.id"
  And Email tersebut terdaftar pada tabel DPT aktif
  Then Sistem mengembalikan JWT Access Token (berlaku 30 menit)
  And Sistem menyimpan sesi aktif di Redis
  And Mahasiswa diarahkan ke halaman Bilik Suara (/voting)

Scenario: Mahasiswa Tidak Terdaftar di DPT
  Given Mahasiswa mengautentikasi akun Google kampus
  When Email tidak ditemukan dalam data DPT aktif
  Then Sistem menolak akses dengan kode HTTP 403 (NOT_IN_DPT)
  And Menampilkan pesan: "Email Anda tidak terdaftar dalam DPT Pemira tahun ini"

Scenario: Sesi Ganda di Dua Perangkat
  Given Mahasiswa telah login di Browser Laptop
  When Mahasiswa melakukan login dengan akun yang sama di Browser HP
  Then Sesi di Browser HP menjadi aktif
  And Sesi di Browser Laptop otomatis kedaluwarsa saat melakukan request berikutnya
```

#### US-02: Memberikan Suara di Bilik Suara Digital
> *Sebagai pemilih yang berhak,*  
> *Saya ingin melihat visi-misi paslon dan memilih calon pimpinan secara digital,*  
> *Agar suara saya tersalurkan dengan rahasia, cepat, dan tanpa risiko coblos ganda.*

**Kriteria Penerimaan:**
```gherkin
Scenario: Pemilih Berhasil Menyalurkan Hak Suara
  Given Pemilih memiliki token autentikasi valid dan status "has_voted = FALSE"
  And Waktu saat ini berada di dalam jam pemilihan resmi (Election Window)
  When Pemilih memilih 1 paslon untuk setiap kategori jabatan
  And Pemilih menyelesaikan verifikasi anti-bot Cloudflare Turnstile
  And Pemilih menekan tombol "Konfirmasi & Kirim Suara"
  Then Sistem mengunci status pemilih menggunakan Redis SETNX
  And Sistem mengupdate status pemilih menjadi "has_voted = TRUE"
  And Sistem memasukkan pilihan ke antrean anonim BullMQ tanpa identitas pemilih
  Then Sistem merespons dengan HTTP 202 Accepted dan token tanda terima HMAC
  And Halaman otomatis berpindah ke Bukti Tanda Terima (/receipt)

Scenario: Upaya Coblos Ganda (Double Voting Race Condition)
  Given Pemilih membuka 2 tab browser secara bersamaan
  When Pemilih mengklik tombol submit suara di kedua tab dalam detik yang sama
  Then Request pertama berhasil diproses
  And Request kedua langsung ditolak dengan HTTP 409 Conflict
  And Hanya tepat 1 surat suara yang masuk ke kotak suara digital
```

#### US-03: Menyimpan Bukti Tanda Terima Kriptografis
> *Sebagai pemilih yang telah selesai mencoblos,*  
> *Saya ingin memperoleh token tanda terima digital,*  
> *Agar saya memiliki bukti otentik keikutsertaan tanpa mengekspos pilihan paslon saya.*

**Kriteria Penerimaan:**
```gherkin
Scenario: Penerimaan Bukti Tanda Terima Digital
  Given Pemilih telah berhasil submit suara
  When Halaman Bukti Tanda Terima (/receipt) ditampilkan
  Then Muncul kode receipt berformat "VOTE-RCPT-XXXX..."
  And Terdapat tombol "Salin Kode" dan "Simpan/Cetak Tanda Terima"
  And Halaman sama sekali TIDAK menampilkan paslon yang dipilih
```

---

### B. Sudut Pandang Panitia Pemilihan (KPU & Bawaslu)

#### US-04: Mengunggah & Memonitor Partisipasi DPT
> *Sebagai Panitia KPU,*  
> *Saya ingin mengunggah DPT massal dan melihat mahasiswa yang belum mencoblos,*  
> *Agar panitia dapat memantau tingkat partisipasi dan mengirim reminder.*

**Kriteria Penerimaan:**
```gherkin
Scenario: Bulk Import DPT Massal
  Given Panitia KPU mengakses endpoint POST /api/admin/users/bulk-import
  When Panitia mengirimkan array daftar email kampus mahasiswa
  Then Sistem otomatis mem-parsing Nama, Jurusan, dan Angkatan dari tiap email
  And Sistem menyimpan pemilih baru ke tabel "voters" dengan status "has_voted = FALSE"
  And Mengembalikan jumlah pemilih yang berhasil diimpor

Scenario: Memantau Pemilih yang Belum Memilih
  Given Panitia mengakses endpoint GET /api/admin/users/not-voted
  When Request dijalankan pada masa pemilihan aktif
  Then Sistem mengembalikan daftar mahasiswa dengan "has_voted = FALSE"
  And Menampilkan total pemilih yang belum menggunakan hak suara
```

#### US-05: Membuka Brankas Rekapitulasi Suara (Dual-Control Quorum)
> *Sebagai Komisioner KPU dan Pengawas Bawaslu,*  
> *Kami ingin membuka hasil suara secara bersamaan menggunakan kunci rahasia setelah pemilu usai,*  
> *Agar tidak ada kecurigaan manipulasi data dan hasil pemilu dijamin adil.*

**Kriteria Penerimaan:**
```gherkin
Scenario: Upaya Membuka Hasil Saat Pemilu Masih Aktif
  Given Waktu saat ini masih sebelum "end_time" pemilihan
  When Panitia memasukkan Kunci KPU dan Kunci Bawaslu yang valid
  Then Sistem menolak akses dengan HTTP 403 (ELECTION_STILL_ACTIVE)
  And Menampilkan pesan sisa waktu pemilihan yang masih berjalan

Scenario: Pembukaan Hasil Resmi Pasca-Pemilihan
  Given Waktu pemilihan telah resmi berakhir (NOW() > end_time)
  When KPU mengirimkan header "x-kpu-secret-key" yang valid
  And Bawaslu mengirimkan header "x-bawaslu-secret-key" yang valid
  Then Sistem membuka rekapitulasi suara dari tabel "ballots"
  And Sistem menampilkan total suara per paslon serta verifikasi total partisipasi DPT
```
