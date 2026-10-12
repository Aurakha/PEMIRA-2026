import { query } from '../../config/db';
import { redis } from '../../config/redis';

export interface ElectionConfig {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  is_tallied: boolean;
  allowed_domains: string[];
}

export interface Candidate {
  id: string;
  category_id: string;
  candidate_number: number;
  chairman_name: string;
  vice_chairman_name: string | null;
  vision: string | null;
  mission: string | null;
  photo_url: string | null;
  display_order: number;
}

export interface CategoryWithCandidates {
  id: string;
  name: string;
  max_selection: number;
  candidates: Candidate[];
}

export class ElectionService {
  /**
   * Mengambil konfigurasi pemilihan dengan In-Memory Caching di Redis (TTL 60 detik)
   */
  public async getActiveElection(): Promise<ElectionConfig | null> {
    const cacheKey = 'cache:election:active';
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const rows = await query<ElectionConfig>(
      `SELECT id, title, description, start_time, end_time, is_active, is_tallied, allowed_domains
       FROM elections
       WHERE is_active = TRUE
       ORDER BY created_at DESC
       LIMIT 1`
    );

    const election = rows[0] || null;
    if (election) {
      await redis.set(cacheKey, JSON.stringify(election), 'EX', 60);
    }
    return election;
  }

  /**
   * Validasi apakah waktu sekarang berada di dalam rentang waktu voting yang sah
   */
  public isWithinVotingWindow(election: ElectionConfig): { isValid: boolean; message?: string } {
    const now = new Date().getTime();
    const start = new Date(election.start_time).getTime();
    const end = new Date(election.end_time).getTime();

    if (!election.is_active) {
      return { isValid: false, message: 'Pemilihan saat ini dinonaktifkan oleh panitia.' };
    }

    if (now < start) {
      return { isValid: false, message: 'Bilik suara belum dibuka. Silakan tunggu hingga jam pemilihan dimulai.' };
    }

    if (now > end) {
      return { isValid: false, message: 'Waktu pemilihan telah resmi ditutup oleh panitia.' };
    }

    return { isValid: true };
  }

  /**
   * Mengambil daftar kandidat & profil (Di-cache di Redis agar ribuan pemilih membaca dari memori)
   */
  public async getCategoriesAndCandidates(electionId: string): Promise<CategoryWithCandidates[]> {
    const cacheKey = `cache:election:categories:${electionId}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const categories = await query<{ id: string; name: string; max_selection: number }>(
      `SELECT id, name, max_selection 
       FROM election_categories 
       WHERE election_id = $1 
       ORDER BY display_order ASC`,
      [electionId]
    );

    const result: CategoryWithCandidates[] = [];

    for (const cat of categories) {
      const candidates = await query<Candidate>(
        `SELECT id, category_id, candidate_number, chairman_name, vice_chairman_name, vision, mission, photo_url, display_order
         FROM candidates
         WHERE category_id = $1
         ORDER BY candidate_number ASC`,
        [cat.id]
      );

      result.push({
        id: cat.id,
        name: cat.name,
        max_selection: cat.max_selection,
        candidates,
      });
    }

    // Cache selama 300 detik (5 menit) karena profil paslon bersifat statis selama hari pemungutan
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 300);
    return result;
  }
}

export const electionService = new ElectionService();
