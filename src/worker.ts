import { startBallotWorker } from './modules/vote/vote.worker';

console.log('====================================================');
console.log('   PEMIRA BALLOT INGESTION WORKER (ANONYMOUS BOX)   ');
console.log('====================================================');

const worker = startBallotWorker();

process.on('SIGTERM', async () => {
  console.log('[WORKER] SIGTERM received. Closing worker gracefully...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[WORKER] SIGINT received. Closing worker gracefully...');
  await worker.close();
  process.exit(0);
});
