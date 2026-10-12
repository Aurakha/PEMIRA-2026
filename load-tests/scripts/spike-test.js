import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ====================================================================
// SKENARIO LOAD TESTING: PEMIRA CONCURRENCY SPIKE (3.000 - 5.000 VU)
// ====================================================================

// Kustom Metrik
export const voteSuccessRate = new Rate('vote_success_rate');
export const voteSubmissionDuration = new Trend('vote_submission_duration');
export const doubleVoteRejections = new Counter('double_vote_rejections');

export const options = {
  scenarios: {
    // Skenario Lonjakan Puncak Pembukaan Bilik Suara
    voting_rush: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 2000 }, // Ramp-up: 0 ke 2.000 VU dalam 1 menit
        { duration: '3m', target: 5000 }, // Peak Sustained: 5.000 VU serentak selama 3 menit
        { duration: '1m', target: 0 },    // Ramp-down kembali ke 0
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // SLA Metrik Keberhasilan
    http_req_failed: ['rate<0.001'],               // Error rate < 0.1%
    http_req_duration: ['p(95)<450', 'p(99)<800'], // 95% request selesai < 450ms
    vote_success_rate: ['rate>0.99'],              // Keberhasilan submit vote > 99%
  },
};

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:80/api';

export default function () {
  // Setiap VU merepresentasikan 1 mahasiswa unik dari pool 8.000 pemilih
  const voterIndex = ((__VU * 100) + __ITER) % 8000 + 1;
  const mockEmail = `pemilih${voterIndex}@mahasiswa.ac.id`;

  // ---------------------------------------------------------------
  // FASE 1: Autentikasi SSO & Single Session Check
  // ---------------------------------------------------------------
  const loginPayload = JSON.stringify({
    idToken: `mock-token:${mockEmail}`,
  });

  const loginRes = http.post(`${BASE_URL}/auth/login-sso`, loginPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  const loginOk = check(loginRes, {
    'login status 200': (r) => r.status === 200,
    'jwt token received': (r) => r.json('token') !== undefined,
  });

  if (!loginOk) {
    sleep(1);
    return;
  }

  const token = loginRes.json('token');
  const voterData = loginRes.json('voter');

  // Jika pemilih ini sudah tercatat mencoblos, lewati
  if (voterData && voterData.hasVoted) {
    sleep(1);
    return;
  }

  // ---------------------------------------------------------------
  // FASE 2: Ambil Daftar Kandidat (Uji In-Memory Redis Cache)
  // ---------------------------------------------------------------
  const candRes = http.get(`${BASE_URL}/vote/candidates`);
  check(candRes, {
    'get candidates status 200': (r) => r.status === 200,
    'categories exist': (r) => r.json('categories') && r.json('categories').length > 0,
  });

  // Waktu pikir pemilih (Think time acak 1 - 3 detik)
  sleep(Math.random() * 2 + 1);

  // ---------------------------------------------------------------
  // FASE 3: Transaksi Submit Suara (Atomic Lock & Queue Processing)
  // ---------------------------------------------------------------
  const votePayload = JSON.stringify({
    turnstileToken: 'mock-turnstile-token-dev',
    votes: [
      {
        categoryId: '22222222-2222-2222-2222-222222222221',
        candidateId: Math.random() > 0.5 
          ? '33333333-3333-3333-3333-333333333331' 
          : '33333333-3333-3333-3333-333333333332',
      },
    ],
  });

  const submitStart = Date.now();
  const submitRes = http.post(`${BASE_URL}/vote/submit`, votePayload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  voteSubmissionDuration.add(Date.now() - submitStart);

  const isAccepted = submitRes.status === 202;
  voteSuccessRate.add(isAccepted ? 1 : 0);

  check(submitRes, {
    'vote status 202 accepted': (r) => r.status === 202,
    'receipt token returned': (r) => r.json('receiptToken') !== undefined,
  });

  // ---------------------------------------------------------------
  // FASE 4: Simulasi Percobaan Coblos Ganda (Double-Voting Attack)
  // Menguji ketangguhan Redis SETNX & SQL Atomic Constraint
  // ---------------------------------------------------------------
  if (Math.random() < 0.05) { // 5% user mencoba submit dua kali
    const maliciousRetry = http.post(`${BASE_URL}/vote/submit`, votePayload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    const isBlocked = maliciousRetry.status === 409;
    if (isBlocked) {
      doubleVoteRejections.add(1);
    }

    check(maliciousRetry, {
      'double vote strictly blocked (status 409)': (r) => r.status === 409,
    });
  }

  sleep(1);
}
