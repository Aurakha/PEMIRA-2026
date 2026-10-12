import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../../config/db';
import { electionService } from '../election/election.service';

export async function tallyRoutes(fastify: FastifyInstance) {
  /**
   * Endpoint Perolehan Suara (Quarantined Tally Endpoint)
   * KEAMANAN TINGKAT TINGGI:
   * 1. Sama sekali TIDAK DAPAT DIAKSES selama waktu pemilihan sedang berlangsung.
   * 2. Hanya dapat dibuka setelah jam pemilihan berakhir (end_time) dan status pemilihan ditutup oleh KPU.
   * 3. Wajib menyertakan Quorum Kunci Rahasia Panitia (Dual-Control).
   */
  fastify.post('/tally-results', async (req: FastifyRequest, reply: FastifyReply) => {
    const kpuKey = req.headers['x-kpu-secret-key'] as string;
    const bawasluKey = req.headers['x-bawaslu-secret-key'] as string;

    // Dual-Control Secret Verification
    if (!kpuKey || !bawasluKey || kpuKey !== 'kpu-master-secret-2026' || bawasluKey !== 'bawaslu-audit-secret-2026') {
      return reply.status(401).send({
        error: 'QUORUM_UNAUTHORIZED',
        message: 'Akses hasil pemilu memerlukan otorisasi ganda (KPU & Pengawas Pemira).',
      });
    }

    const election = await electionService.getActiveElection();
    if (!election) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Pemilihan tidak ditemukan.' });
    }

    const now = new Date().getTime();
    const endTime = new Date(election.end_time).getTime();

    // 1. Gating Waktu: Cegah kebocoran hasil sebelum bilik suara tutup
    if (now < endTime && election.is_active) {
      return reply.status(403).send({
        error: 'ELECTION_STILL_ACTIVE',
        message: 'Hasil pemilihan dikarantina secara ketat dan tidak dapat diakses sebelum batas waktu pemilihan berakhir.',
        remainingMinutes: Math.ceil((endTime - now) / 60000),
      });
    }

    // 2. Hitung Rekapitulasi Suara dari Tabel ballots (Tanpa Identitas Pemilih)
    const tallyRows = await query<{
      category_name: string;
      candidate_number: number;
      chairman_name: string;
      vice_chairman_name: string | null;
      total_votes: string;
    }>(
      `SELECT 
          ec.name AS category_name,
          c.candidate_number,
          c.chairman_name,
          c.vice_chairman_name,
          COUNT(b.id) AS total_votes
       FROM election_categories ec
       JOIN candidates c ON c.category_id = ec.id
       LEFT JOIN ballots b ON b.candidate_id = c.id AND b.election_id = ec.election_id
       WHERE ec.election_id = $1
       GROUP BY ec.id, ec.name, ec.display_order, c.id, c.candidate_number, c.chairman_name, c.vice_chairman_name
       ORDER BY ec.display_order ASC, c.candidate_number ASC`,
      [election.id]
    );

    // 3. Verifikasi Konsistensi Partisipasi (DPT has_voted vs Ballots Count)
    const voterStats = await query<{ total_voters: string; total_participated: string }>(
      `SELECT 
          COUNT(id) AS total_voters,
          COUNT(CASE WHEN has_voted = TRUE THEN 1 END) AS total_participated
       FROM voters 
       WHERE election_id = $1`,
      [election.id]
    );

    return reply.send({
      success: true,
      election: {
        id: election.id,
        title: election.title,
        finalizedAt: new Date().toISOString(),
      },
      participation: {
        totalDpt: parseInt(voterStats[0]?.total_voters || '0', 10),
        totalVoted: parseInt(voterStats[0]?.total_participated || '0', 10),
        turnoutPercentage: (
          (parseInt(voterStats[0]?.total_participated || '0', 10) /
            Math.max(1, parseInt(voterStats[0]?.total_voters || '1', 10))) *
          100
        ).toFixed(2) + '%',
      },
      results: tallyRows.map((r) => ({
        category: r.category_name,
        candidateNumber: r.candidate_number,
        candidateName: `${r.chairman_name}${r.vice_chairman_name ? ' & ' + r.vice_chairman_name : ''}`,
        votes: parseInt(r.total_votes, 10),
      })),
    });
  });

  /**
   * Endpoint Audit DPT: Mengambil daftar pemilih yang belum menggunakan hak suara
   * Diadaptasi dari sistem pemira-back-end (/votes/not-voted)
   * Berguna bagi panitia KPU untuk memonitor partisipasi atau mengirimkan reminder
   */
  fastify.get('/users/not-voted', async (req: FastifyRequest, reply: FastifyReply) => {
    const election = await electionService.getActiveElection();
    if (!election) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Pemilihan tidak ditemukan.' });
    }

    const notVotedList = await query<{
      id: string;
      nim: string;
      email: string;
      full_name: string;
      faculty: string | null;
      study_program: string | null;
    }>(
      `SELECT id, nim, email, full_name, faculty, study_program
       FROM voters
       WHERE election_id = $1 AND has_voted = FALSE AND is_active = TRUE
       ORDER BY study_program ASC, nim ASC`,
      [election.id]
    );

    return reply.send({
      success: true,
      electionId: election.id,
      totalNotVoted: notVotedList.length,
      voters: notVotedList,
    });
  });

  /**
   * Endpoint Bulk Import DPT: Mengunggah daftar pemilih secara massal
   * Diadaptasi dari sistem pemira-back-end (/users/create-multiple)
   * Mendukung auto-parsing jurusan & angkatan jika hanya menyertakan email kampus
   */
  fastify.post('/users/bulk-import', async (req: FastifyRequest<{ Body: { emails?: string[]; voters?: any[] } }>, reply: FastifyReply) => {
    const election = await electionService.getActiveElection();
    if (!election) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Pemilihan tidak aktif.' });
    }

    const { emails, voters } = req.body || {};
    let importedCount = 0;

    if (emails && Array.isArray(emails)) {
      for (const email of emails) {
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail) continue;

        // Gunakan auto-parser email dari referensi pemira-back-end
        const parsed = (await import('../auth/auth.service')).parseEmailInfo(cleanEmail);
        const name = parsed?.name || 'Mahasiswa';
        const studyProgram = parsed?.major || 'Umum';
        const nim = cleanEmail.split('@')[0].replace(/\D/g, '') || String(Date.now()).slice(-8);

        await query(
          `INSERT INTO voters (id, election_id, nim, email, full_name, faculty, study_program, has_voted)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, FALSE)
           ON CONFLICT (election_id, email) DO NOTHING`,
          [election.id, nim, cleanEmail, name, studyProgram, studyProgram]
        );
        importedCount++;
      }
    }

    return reply.send({
      success: true,
      message: `Berhasil mengimpor ${importedCount} pemilih ke DPT.`,
      electionId: election.id,
    });
  });
}

