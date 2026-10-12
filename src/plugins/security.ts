import crypto from 'crypto';
import { env } from '../config/env';

/**
 * Validasi token Cloudflare Turnstile ke API Cloudflare
 */
export async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<boolean> {
  if (!env.ENABLE_TURNSTILE) {
    // Mode bypass untuk local development / automated load testing jika dimatikan
    return true;
  }

  if (!token) return false;

  try {
    const formData = new URLSearchParams();
    formData.append('secret', env.CLOUDFLARE_TURNSTILE_SECRET_KEY);
    formData.append('response', token);
    if (remoteIp) formData.append('remoteip', remoteIp);

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
    });

    const data = (await res.json()) as { success: boolean };
    return data.success;
  } catch (err) {
    console.error('[TURNSTILE VERIFY ERROR]:', err);
    return false;
  }
}

/**
 * Membuat Cryptographic Voting Receipt Token (HMAC-SHA256)
 * Membuktikan bahwa suara sah masuk tanpa memuat paslon yang dipilih
 */
export function generateVotingReceipt(voterId: string, electionId: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${voterId}:${electionId}:${nonce}`;
  const hmac = crypto.createHmac('sha256', env.VOTING_SECRET_KEY).update(payload).digest('hex');
  return `VOTE-RCPT-${hmac.substring(0, 32).toUpperCase()}`;
}
