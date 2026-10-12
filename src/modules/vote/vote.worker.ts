import { Worker, Job } from 'bullmq';
import crypto from 'crypto';
import { redisConfig } from '../../config/redis';
import { dbPool } from '../../config/db';
import { BALLOT_QUEUE_NAME, BallotJobPayload } from './vote.queue';

/**
 * Worker Penulisan Surat Suara (Ballot Ingestion Worker)
 * Menerapkan Anti-Timing Correlation Attack:
 * - Mengacak urutan batch suara
 * - Membubuhkan batch_id acak tanpa timestamp presisi tinggi
 * - Memutus kemungkinan pelacakan relasi antara voter_at dan created_at
 */
export function startBallotWorker(): Worker<BallotJobPayload> {
  console.log('[BALLOT WORKER] Starting decoupled ballot consumer...');

  const worker = new Worker<BallotJobPayload>(
    BALLOT_QUEUE_NAME,
    async (job: Job<BallotJobPayload>) => {
      const { electionId, votes } = job.data;
      const batchId = crypto.randomUUID();

      // Berikan jitter delay acak kecil (100ms - 500ms) untuk mengacak mikro-kronologi
      const jitterMs = Math.floor(Math.random() * 400) + 100;
      await new Promise((resolve) => setTimeout(resolve, jitterMs));

      const client = await dbPool.connect();

      try {
        await client.query('BEGIN');

        for (const vote of votes) {
          await client.query(
            `INSERT INTO ballots (id, election_id, category_id, candidate_id, batch_id, created_date)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, CURRENT_DATE)`,
            [electionId, vote.categoryId, vote.candidateId, batchId]
          );
        }

        await client.query('COMMIT');
        return { status: 'COMMITTED', batchId, count: votes.length };
      } catch (err: any) {
        await client.query('ROLLBACK');
        console.error('[BALLOT WORKER ERROR] Failed to commit ballot batch:', err);
        throw err;
      } finally {
        client.release();
      }
    },
    {
      connection: redisConfig,
      concurrency: 20, // Concurrency worker pool untuk menangani beban ribuan antrean
    }
  );

  worker.on('completed', (job) => {
    // Audit anonymized completion
  });

  worker.on('failed', (job, err) => {
    console.error(`[BALLOT WORKER] Job ${job?.id} failed with error:`, err);
  });

  return worker;
}
