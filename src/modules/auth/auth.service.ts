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

export interface ParsedEmailInfo {
  name: string;
  major: string;
  year: number;
}

/**
 * Otomatis mengekstrak nama, jurusan, dan tahun angkatan dari format email kampus resmi
 * Contoh: muhammad.aurakha.tik23@stu.pnj.ac.id -> Name: 'Muhammad Aurakha', Major: 'Teknik Informatika dan Komputer', Year: 2023
 * Diadaptasi dari sistem referensi pemira-back-end
 */
export function parseEmailInfo(email: string): ParsedEmailInfo | null {
  const username = email.split('@')[0];
  if (!username) return null;

  const parts = username.split('.');
  if (parts.length < 2) return null;

  const majorWithYear = parts[parts.length - 1];
  const match = majorWithYear.match(/^([a-zA-Z]+)(\d+)$/);
  if (!match) return null;

  const majorCode = match[1].toLowerCase();
  const yearDigits = match[2];
  const year = parseInt(`20${yearDigits}`, 10);

  const majorMap: Record<string, string> = {
    tik: 'Teknik Informatika dan Komputer',
    ak: 'Akuntansi',
    an: 'Administrasi Niaga',
    ts: 'Teknik Sipil',
    tm: 'Teknik Mesin',
    te: 'Teknik Elektro',
    tgp: 'Teknik Grafika dan Penerbitan',
  };

  const major = majorMap[majorCode] || 'Umum';
  const nameParts = parts.slice(0, -1).map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  const name = nameParts.join(' ');

  return { name, major, year };
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
