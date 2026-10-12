import { Queue } from 'bullmq';
import { redisConfig } from '../../config/redis';

export const BALLOT_QUEUE_NAME = 'ballot-ingestion-queue';

export interface BallotJobPayload {
  electionId: string;
  votes: Array<{
    categoryId: string;
    candidateId: string;
  }>;
  enqueuedAt: number;
}

// Inisialisasi antrean penulisan suara BullMQ
export const ballotQueue = new Queue<BallotJobPayload>(BALLOT_QUEUE_NAME, {
  connection: redisConfig,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 1000, // Simpan histori job secukupnya
    removeOnFail: 5000,
  },
});
