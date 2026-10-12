import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authService } from './auth.service';
import { electionService } from '../election/election.service';

interface SsoLoginBody {
  idToken: string;
}

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * Endpoint Login SSO (Google Workspace OAuth 2.0)
   * 1. Validasi token ke Google
   * 2. Validasi whitelist domain kampus
   * 3. Pencocokan DPT
   * 4. Single Session Enforcement via Redis
   * 5. Generate JWT Access Token
   */
  fastify.post('/login-sso', async (req: FastifyRequest<{ Body: SsoLoginBody }>, reply: FastifyReply) => {
    const { idToken } = req.body || {};

    if (!idToken) {
      return reply.status(400).send({
        error: 'BAD_REQUEST',
        message: 'Google ID Token wajib disertakan.',
      });
    }

    try {
      // 1. Verifikasi Google ID Token
      const googleUser = await authService.verifyGoogleToken(idToken);

      // 2. Validasi Whitelist Domain Kampus
      if (!authService.isAllowedDomain(googleUser.email)) {
        return reply.status(403).send({
          error: 'DOMAIN_FORBIDDEN',
          message: `Email '${googleUser.email}' tidak memenuhi ketentuan domain kampus (@mahasiswa.ac.id / @campus.ac.id).`,
        });
      }

      // 3. Pencocokan ke Database DPT (voters)
      const voter = await authService.findVoterInDpt(googleUser.email);
      if (!voter) {
        return reply.status(403).send({
          error: 'NOT_IN_DPT',
          message: `Email '${googleUser.email}' tidak terdaftar dalam Daftar Pemilih Tetap (DPT) Pemira tahun ini.`,
        });
      }

      // 4. Single Session Enforcement (Invalidasi sesi lama di perangkat lain)
      const ip = (req.headers['x-forwarded-for'] as string) || req.ip;
      const userAgent = req.headers['user-agent'] || 'Unknown';
      const sessionId = await authService.enforceSingleSession(voter.id, ip, userAgent);

      // 5. Terbitkan JWT Access Token dengan klaim sessionId
      const token = fastify.jwt.sign(
        {
          voterId: voter.id,
          nim: voter.nim,
          email: voter.email,
          fullName: voter.full_name,
          electionId: voter.election_id,
          sessionId,
        },
        { expiresIn: '30m' }
      );

      const election = await electionService.getActiveElection();

      return reply.send({
        success: true,
        token,
        voter: {
          id: voter.id,
          nim: voter.nim,
          fullName: voter.full_name,
          email: voter.email,
          faculty: voter.faculty,
          studyProgram: voter.study_program,
          hasVoted: voter.has_voted,
          votedAt: voter.voted_at,
          receiptHash: voter.receipt_hash,
        },
        election,
      });
    } catch (err: any) {
      return reply.status(401).send({
        error: 'AUTH_FAILED',
        message: err.message,
      });
    }
  });

  /**
   * Endpoint Informasi Profil Pemilih Saat Ini & Status Hak Suara
   */
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    const voter = await authService.findVoterInDpt(user.email);
    if (!voter) {
      return reply.status(404).send({ error: 'NOT_FOUND', message: 'Data pemilih tidak ditemukan.' });
    }

    const election = await electionService.getActiveElection();

    return reply.send({
      voter: {
        id: voter.id,
        nim: voter.nim,
        fullName: voter.full_name,
        email: voter.email,
        faculty: voter.faculty,
        studyProgram: voter.study_program,
        hasVoted: voter.has_voted,
        votedAt: voter.voted_at,
        receiptHash: voter.receipt_hash,
      },
      election,
    });
  });

  /**
   * Endpoint Logout (Terminasi sesi di Redis)
   */
  fastify.post('/logout', { preHandler: [fastify.authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    await authService.terminateSession(user.voterId);
    return reply.send({ success: true, message: 'Sesi berhasil diakhiri.' });
  });
}
