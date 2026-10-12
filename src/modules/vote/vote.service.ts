import { dbPool } from '../../config/db';
import { redis } from '../../config/redis';
import { generateVotingReceipt } from '../../plugins/security';
import { ballotQueue, BallotJobPayload } from './vote.queue';

export interface SubmitVoteRequest {
  voterId: string;
  electionId: string;
  votes: Array<{
    categoryId: string;
    candidateId: string;
  }>;
}

export interface SubmitVoteResult {
  success: boolean;
  receiptToken: string;
  message: string;
}

export class VoteService {
  /**
   * Inti Pemrosesan Transaksi Suara:
   * 1. Distributed Lock Redis (SETNX) untuk memotong race condition coblos ganda
   * 2. Atomic Conditional Update di tabel voters (has_voted = TRUE WHERE has_voted = FALSE)
   * 3. Penulisan ke Antrean BullMQ TANPA data identitas pemilih (Zero Linkability)
   * 4. Pengembalian Voting Receipt Token berbasis HMAC
   */
  public async submitVote(req: SubmitVoteRequest): Promise<SubmitVoteResult> {
    const lockKey = `lock:vote:voter:${req.voterId}`;

    // 1. Terapkan Distributed Lock (SETNX) selama 60 detik
    const lockAcquired = await redis.set(lockKey, '1', 'EX', 60, 'NX');
    if (!lockAcquired) {
      throw new Error('DUPLICATE_REQUEST: Permintaan voting sedang diproses atau hak suara telah dipakai.');
    }

    const client = await dbPool.connect();

    try {
      await client.query('BEGIN');

      // 2. Generate bukti tanda terima pemilih (Cryptographic Receipt)
      const receiptToken = generateVotingReceipt(req.voterId, req.electionId);

      // 3. Eksekusi Atomic Conditional Update pada status DPT
      // Jika user sudah mencoblos sebelumnya, WHERE has_voted = FALSE akan menghasilkan 0 baris
      const updateResult = await client.query(
        `UPDATE voters 
         SET has_voted = TRUE, 
             voted_at = NOW(), 
             receipt_hash = $1 
         WHERE id = $2 AND election_id = $3 AND has_voted = FALSE
         RETURNING id`,
        [receiptToken, req.voterId, req.electionId]
      );

      if (updateResult.rowCount === 0) {
        await client.query('ROLLBACK');
        throw new Error('ALREADY_VOTED: Anda tercatat telah menggunakan hak suara Anda sebelumnya.');
      }

      await client.query('COMMIT');

      // 4. Enqueue Surat Suara ke Antrean BullMQ (ANONYMOUS KOTAK SUARA)
      // PERHATIKAN: req.voterId TIDAK DISERTAKAN DALAM JOB PAYLOAD!
      const anonymousPayload: BallotJobPayload = {
        electionId: req.electionId,
        votes: req.votes,
        enqueuedAt: Date.now(),
      };

      await ballotQueue.add('process-ballot', anonymousPayload);

      return {
        success: true,
        receiptToken,
        message: 'Suara Anda telah berhasil masuk ke kotak suara digital.',
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      // Jika terjadi error sistem selain ALREADY_VOTED, lepas lock agar pemilih bisa coba kembali
      if (!err.message.includes('ALREADY_VOTED')) {
        await redis.del(lockKey);
      }
      throw err;
    } finally {
      client.release();
    }
  }
}

export const voteService = new VoteService();
