import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { voteService } from './vote.service';
import { electionService } from '../election/election.service';
import { authService } from '../auth/auth.service';
import { verifyTurnstileToken } from '../../plugins/security';

const submitVoteSchema = z.object({
  turnstileToken: z.string().optional(),
  votes: z.array(
    z.object({
      categoryId: z.string().uuid(),
      candidateId: z.string().uuid(),
    })
  ).min(1, 'Minimal satu pilihan wajib disertakan'),
});

export async function voteRoutes(fastify: FastifyInstance) {
  /**
   * Endpoint Publik/Pemilih: Mengambil Daftar Kandidat & Paslon
   * Dilayani langsung dari In-Memory Redis Cache (High Throughput)
   */
  fastify.get('/candidates', async (req: FastifyRequest, reply: FastifyReply) => {
    const election = await electionService.getActiveElection();
    if (!election) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Tidak ada pemilihan aktif saat ini.' });
    }

    const categories = await electionService.getCategoriesAndCandidates(election.id);
    return reply.send({ election, categories });
  });

  /**
   * Endpoint Utama: Submit Pilihan Suara
   * Dilindungi oleh:
   * 1. JWT Authentication
   * 2. Single Session Active Check
   * 3. Election Window Guard (Jam Pemilihan)
   * 4. Cloudflare Turnstile Bot Defense
   * 5. Redis Distributed Lock & Queue Worker (Zero Linkability)
   */
  fastify.post('/submit', { preHandler: [fastify.authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;

    // 1. Validasi Single Session: Cegah penggunaan bersamaan di dua perangkat
    const isSessionActive = await authService.validateSession(user.voterId, user.sessionId);
    if (!isSessionActive) {
      return reply.status(401).send({
        error: 'SESSION_TERMINATED',
        message: 'Sesi Anda telah kedaluwarsa atau akun ini telah dibuka pada perangkat lain.',
      });
    }

    // 2. Validasi Batas Waktu Pemilihan (Election Window)
    const election = await electionService.getActiveElection();
    if (!election) {
      return reply.status(403).send({ error: 'FORBIDDEN', message: 'Pemilihan tidak aktif.' });
    }

    const windowCheck = electionService.isWithinVotingWindow(election);
    if (!windowCheck.isValid) {
      return reply.status(403).send({
        error: 'WINDOW_CLOSED',
        message: windowCheck.message,
      });
    }

    // 3. Validasi Body Request via Zod
    const parseResult = submitVoteSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'INVALID_PAYLOAD',
        message: parseResult.error.errors[0]?.message || 'Format data voting tidak valid.',
      });
    }

    const { votes, turnstileToken } = parseResult.data;

    // 4. Perlindungan Bot & Otomasi (Cloudflare Turnstile)
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip;
    const isHuman = await verifyTurnstileToken(turnstileToken || '', ip);
    if (!isHuman) {
      return reply.status(403).send({
        error: 'BOT_DETECTED',
        message: 'Verifikasi bot Cloudflare Turnstile gagal. Silakan coba kembali.',
      });
    }

    // 5. Eksekusi Transaksi Voting (Atomic Update DPT + Queue BullMQ)
    try {
      const result = await voteService.submitVote({
        voterId: user.voterId,
        electionId: election.id,
        votes,
      });

      // Mengembalikan HTTP 202 Accepted (Telah diterima antrean & status DPT terkunci)
      return reply.status(202).send({
        success: true,
        receiptToken: result.receiptToken,
        message: result.message,
      });
    } catch (err: any) {
      if (err.message.includes('DUPLICATE_REQUEST') || err.message.includes('ALREADY_VOTED')) {
        return reply.status(409).send({
          error: 'CONFLICT',
          message: err.message,
        });
      }

      req.log.error(err, '[VOTE SUBMISSION EXCEPTION]');
      return reply.status(500).send({
        error: 'INTERNAL_ERROR',
        message: 'Terjadi kendala sistem pemrosesan suara. Silakan coba kembali dalam beberapa saat.',
      });
    }
  });
}
