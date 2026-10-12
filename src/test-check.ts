import { buildServer } from './server';
import { generateVotingReceipt } from './plugins/security';
import { parseEmailInfo } from './modules/auth/auth.service';

async function runBackendVerification() {
  console.log('====================================================');
  console.log('   PEMIRA 2026 - BACKEND AUTOMATED VERIFICATION     ');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`  [PASS] ${testName}`);
    } else {
      console.error(`  [FAIL] ${testName}${detail ? ' -> ' + detail : ''}`);
    }
  }

  // 1. Uji Kriptografi HMAC Receipt
  console.log('1. Pengujian Modul Kriptografi:');
  const sampleVoterId = '44444444-4444-4444-4444-444444444001';
  const sampleElectionId = '11111111-1111-1111-1111-111111111111';
  const receiptToken = generateVotingReceipt(sampleVoterId, sampleElectionId);

  assert(receiptToken.startsWith('VOTE-RCPT-'), 'Token diawali prefix resmi VOTE-RCPT-');
  assert(receiptToken.length >= 32, 'Panjang token HMAC memenuhi standar keamanan (>= 32 karakter)');

  // 2. Uji Auto-Parser Email Kampus (Diadaptasi dari referensi pemira-back-end)
  console.log('\n2. Pengujian Auto-Parser Email Kampus:');
  const sampleEmail = 'muhammad.aurakha.tik23@stu.pnj.ac.id';
  const parsed = parseEmailInfo(sampleEmail);

  assert(parsed !== null, 'Email valid berhasil diparsing');
  assert(parsed?.name.toLowerCase() === 'muhammad aurakha', `Nama diekstrak dengan tepat: '${parsed?.name}'`);
  assert(parsed?.major === 'Teknik Informatika dan Komputer', `Jurusan terdeteksi tepat: '${parsed?.major}'`);
  assert(parsed?.year === 2023, `Tahun angkatan terdeteksi tepat: ${parsed?.year}`);

  // 3. Uji In-Memory Server & Security Guards (Fastify Inject)
  console.log('\n3. Pengujian Endpoint & Security Guard (Fastify In-Memory):');
  const server = buildServer();

  // Test 3.1: Health check
  const healthRes = await server.inject({
    method: 'GET',
    url: '/health',
  });
  assert(healthRes.statusCode === 200, 'GET /health mengembalikan status HTTP 200');
  const healthBody = JSON.parse(healthRes.payload);
  assert(healthBody.status === 'UP', 'Health check status bernilai "UP"');

  // Test 3.2: Endpoint /api/time (Sinkronisasi Waktu)
  const timeRes = await server.inject({
    method: 'GET',
    url: '/api/time',
  });
  assert(timeRes.statusCode === 200, 'GET /api/time mengembalikan status HTTP 200');
  const timeBody = JSON.parse(timeRes.payload);
  assert(timeBody.timezone === 'Asia/Jakarta', 'Timezone server terkonfigurasi "Asia/Jakarta"');

  // Test 3.3: Guard Auth Login (Bad Request jika body kosong)
  const loginRes = await server.inject({
    method: 'POST',
    url: '/api/auth/login-sso',
    payload: {},
  });
  assert(loginRes.statusCode === 400, 'POST /api/auth/login-sso memblokir request kosong dengan HTTP 400');

  // Test 3.4: Guard JWT Bilik Suara (Unauthorized jika tanpa token)
  const voteRes = await server.inject({
    method: 'POST',
    url: '/api/vote/submit',
    payload: {},
  });
  assert(voteRes.statusCode === 401, 'POST /api/vote/submit menolak akses tanpa token JWT dengan HTTP 401');

  // Test 3.5: Guard Quorum Tally (Unauthorized jika tanpa KPU & Bawaslu key)
  const tallyRes = await server.inject({
    method: 'POST',
    url: '/api/admin/tally-results',
    headers: {},
  });
  assert(tallyRes.statusCode === 401, 'POST /api/admin/tally-results menolak akses tanpa Dual-Control Secret dengan HTTP 401');

  console.log('\n====================================================');
  console.log(`HASIL VERIFIKASI: ${passed}/${total} pengujian berhasil lulus.`);
  console.log('====================================================\n');

  if (passed === total) {
    console.log('Semua modul inti, route, dan sistem keamanan backend siap digunakan!\n');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runBackendVerification().catch((err) => {
  console.error('[TEST ERROR]:', err);
  process.exit(1);
});
