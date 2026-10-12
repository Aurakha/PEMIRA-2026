const fs = require('fs');
const path = require('path');

/**
 * Generator 8.000 Data Pemilih Tetap (DPT) Mock untuk Load Testing
 */
function generateDptSql() {
  const electionId = '11111111-1111-1111-1111-111111111111';
  const faculties = [
    'Sekolah Teknik Elektro dan Informatika',
    'Fakultas Ekonomi dan Bisnis',
    'Fakultas Kedokteran',
    'Fakultas Hukum',
    'Fakultas Ilmu Sosial dan Ilmu Politik',
    'Fakultas Psikologi',
    'Fakultas Matematika dan IPA',
  ];

  let sql = `-- AUTO-GENERATED 8.000 DPT VOTERS SEED FOR STRESS TESTING\n`;
  sql += `INSERT INTO voters (id, election_id, nim, email, full_name, faculty, study_program, has_voted) VALUES\n`;

  const values = [];
  for (let i = 1; i <= 8000; i++) {
    const nim = `13523${String(i).padStart(4, '0')}`;
    const email = `pemilih${i}@mahasiswa.ac.id`;
    const fullName = `Mahasiswa Pemira ${i}`;
    const faculty = faculties[i % faculties.length];
    const studyProgram = 'Program Studi ' + (i % 15 + 1);

    values.push(
      `  (gen_random_uuid(), '${electionId}', '${nim}', '${email}', '${fullName}', '${faculty}', '${studyProgram}', FALSE)`
    );
  }

  sql += values.join(',\n') + `\nON CONFLICT (election_id, email) DO NOTHING;\n`;

  const outputPath = path.join(__dirname, 'seed_8000_voters.sql');
  fs.writeFileSync(outputPath, sql, 'utf8');
  console.log(`[GENERATOR] Sukses membuat 8.000 data DPT mock di: ${outputPath}`);
}

generateDptSql();
