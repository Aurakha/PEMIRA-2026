import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import { env } from '../../config/env';
import { query } from '../../config/db';
import { redis } from '../../config/redis';

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

export interface VoterRecord {
  id: string;
  election_id: string;
  nim: string;
  email: string;
  full_name: string;
  faculty: string | null;
  study_program: string | null;
  has_voted: boolean;
  voted_at: string | null;
  receipt_hash: string | null;
  is_active: boolean;
}

export interface SessionInfo {
  sessionId: string;
  voter: VoterRecord;
  token: string;
}

export class AuthService {
  private allowedDomains: string[];

  constructor() {
    this.allowedDomains = env.ALLOWED_EMAIL_DOMAINS.split(',').map((d) => d.trim().toLowerCase());
  }

  /**
   * Validasi ketat domain whitelist email kampus
   */
  public isAllowedDomain(email: string): boolean {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return false;
    return this.allowedDomains.includes(domain);
  }

  /**
   * Verifikasi Google ID Token atau Mock SSO (Development)
   */
  public async verifyGoogleToken(idToken: string): Promise<{ email: string; name: string }> {
    // Dukungan mode simulasi development / testing jika token berformat mock
    if (idToken.startsWith('mock-token:')) {
      const email = idToken.replace('mock-token:', '').trim();
      return { email, name: 'Simulated Student' };
    }

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new Error('ID Token Google tidak valid atau email tidak ditemukan');
      }
      return {
        email: payload.email.toLowerCase(),
        name: payload.name || 'Mahasiswa',
      };
    } catch (err: any) {
      throw new Error(`Verifikasi Google SSO gagal: ${err.message}`);
    }
  }

  /**
   * Pencocokan dengan database Daftar Pemilih Tetap (DPT)
   */
  public async findVoterInDpt(email: string): Promise<VoterRecord | null> {
    const rows = await query<VoterRecord>(
      `SELECT id, election_id, nim, email, full_name, faculty, study_program, has_voted, voted_at, receipt_hash, is_active
       FROM voters
       WHERE LOWER(email) = LOWER($1) AND is_active = TRUE
       LIMIT 1`,
      [email]
    );

    return rows[0] || null;
  }

  /**
   * Single Session Enforcement:
   * Satu akun hanya boleh aktif pada 1 sesi di 1 perangkat.
   * Saat login baru terjadi, sesi lama di-overwrite di Redis.
   */
  public async enforceSingleSession(
    voterId: string,
    ipAddress: string,
    userAgent: string
  ): Promise<string> {
    const sessionId = crypto.randomUUID();
    const sessionKey = `session:voter:${voterId}`;
    const sessionData = JSON.stringify({
      sessionId,
      voterId,
      ipAddress,
      userAgent,
      createdAt: new Date().toISOString(),
    });

    // Simpan di Redis dengan TTL 1800 detik (30 Menit)
    await redis.set(sessionKey, sessionData, 'EX', 1800);

    return sessionId;
  }

  /**
   * Memvalidasi apakah sesi pemilih masih aktif dan cocok dengan Redis
   */
  public async validateSession(voterId: string, sessionId: string): Promise<boolean> {
    const sessionKey = `session:voter:${voterId}`;
    const data = await redis.get(sessionKey);
    if (!data) return false;

    try {
      const parsed = JSON.parse(data);
      return parsed.sessionId === sessionId;
    } catch {
      return false;
    }
  }

  /**
   * Menghapus sesi pemilih saat logout
   */
  public async terminateSession(voterId: string): Promise<void> {
    await redis.del(`session:voter:${voterId}`);
  }
}

export const authService = new AuthService();
