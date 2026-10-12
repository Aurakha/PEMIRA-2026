'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Vote, Check, AlertCircle, LogOut, Info } from 'lucide-react';
import { TurnstileWidget } from '@/components/TurnstileWidget';

interface Candidate {
  id: string;
  candidate_number: number;
  chairman_name: string;
  vice_chairman_name: string | null;
  vision: string;
  mission: string;
  photo_url: string;
}

interface Category {
  id: string;
  name: string;
  max_selection: number;
  candidates: Candidate[];
}

export default function VotingBoothPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedVotes, setSelectedVotes] = useState<{ [categoryId: string]: string }>({});
  const [voter, setVoter] = useState<any>(null);
  const [turnstileToken, setTurnstileToken] = useState<string>('mock-turnstile-token-dev');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('pemira_token');
    const storedVoter = localStorage.getItem('pemira_voter');

    if (!token || !storedVoter) {
      router.push('/');
      return;
    }

    const parsedVoter = JSON.parse(storedVoter);
    setVoter(parsedVoter);

    if (parsedVoter.hasVoted) {
      router.push('/receipt');
      return;
    }

    fetchCandidates();
  }, [router]);

  const fetchCandidates = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      const res = await fetch(`${apiUrl}/vote/candidates`);
      const data = await res.json();
      if (res.ok && data.categories) {
        setCategories(data.categories);
      }
    } catch (err) {
      console.error('Failed to fetch candidates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCandidate = (categoryId: string, candidateId: string) => {
    setSelectedVotes((prev) => ({
      ...prev,
      [categoryId]: candidateId,
    }));
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push('/');
  };

  const handleSubmitVote = async () => {
    setSubmitting(true);
    setErrorMsg(null);

    const token = localStorage.getItem('pemira_token');
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

    const votesPayload = Object.entries(selectedVotes).map(([categoryId, candidateId]) => ({
      categoryId,
      candidateId,
    }));

    try {
      const res = await fetch(`${apiUrl}/vote/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          votes: votesPayload,
          turnstileToken,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Gagal menyimpan suara.');
      }

      // Update voter status di local storage
      const updatedVoter = { ...voter, hasVoted: true, receiptHash: data.receiptToken };
      localStorage.setItem('pemira_voter', JSON.stringify(updatedVoter));
      localStorage.setItem('pemira_receipt', data.receiptToken);

      // Arahkan ke halaman bukti tanda terima
      router.push('/receipt');
    } catch (err: any) {
      setErrorMsg(err.message);
      setConfirmModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const allCategoriesSelected =
    categories.length > 0 && categories.every((cat) => !!selectedVotes[cat.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-sm text-slate-400">Menyiapkan bilik suara digital terenkripsi...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Navbar Bilik Suara */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-white/10 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600/30 rounded-lg border border-blue-500/40">
              <Vote className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="font-bold text-sm sm:text-base leading-none">Bilik Suara Digital Pemira</h1>
              <span className="text-[11px] text-slate-400">Sesi Terenkripsi End-to-End</span>
            </div>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            {voter && (
              <div className="hidden sm:block text-right">
                <p className="font-semibold text-white">{voter.fullName}</p>
                <p className="text-slate-400">NIM: {voter.nim}</p>
              </div>
            )}
            <button
              onClick={handleLogout}
              className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition"
              title="Keluar Sesi"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto w-full px-4 py-6 flex-1">
        {/* Banner Kerahasiaan */}
        <div className="mb-6 p-4 rounded-2xl bg-blue-950/40 border border-blue-800/40 text-xs text-blue-200 flex items-start space-x-3">
          <ShieldCheck className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block text-blue-100">Jaminan Kerahasiaan Suara (Zero Linkability):</span>
            Pilihan paslon Anda tidak dikaitkan dengan identitas pemilih di database. Kotak suara digital diproses secara terpisah dan anonim.
          </div>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-950/40 border border-red-800/50 rounded-2xl text-xs text-red-200 flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Loop Tiap Kategori Pemilihan */}
        {categories.map((category) => (
          <section key={category.id} className="mb-10">
            <div className="border-b border-white/10 pb-3 mb-6">
              <h2 className="text-xl font-bold tracking-tight text-white">{category.name}</h2>
              <p className="text-xs text-slate-400 mt-1">Pilih 1 (satu) pasangan calon di bawah ini:</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {category.candidates.map((cand) => {
                const isSelected = selectedVotes[category.id] === cand.id;

                return (
                  <div
                    key={cand.id}
                    onClick={() => handleSelectCandidate(category.id, cand.id)}
                    className={`relative cursor-pointer rounded-3xl p-6 transition duration-200 border ${
                      isSelected
                        ? 'bg-blue-900/20 border-blue-500 shadow-xl shadow-blue-500/10 ring-2 ring-blue-500/30'
                        : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/[0.07]'
                    }`}
                  >
                    {/* Badge Nomor Urut */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center font-bold text-lg text-white shadow-md">
                        {cand.candidate_number}
                      </div>

                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center border transition ${
                          isSelected
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'border-white/20 bg-white/5 text-transparent'
                        }`}
                      >
                        <Check className="w-4 h-4 stroke-[3]" />
                      </div>
                    </div>

                    <h3 className="text-lg font-bold text-white leading-snug">{cand.chairman_name}</h3>
                    {cand.vice_chairman_name && (
                      <p className="text-sm text-slate-300 font-medium mt-0.5">& {cand.vice_chairman_name}</p>
                    )}

                    <div className="mt-4 pt-4 border-t border-white/10 space-y-2 text-xs text-slate-300">
                      <div>
                        <span className="font-semibold text-slate-200">Visi:</span>
                        <p className="mt-0.5 text-slate-400 italic">"{cand.vision}"</p>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-200">Misi Utama:</span>
                        <p className="mt-0.5 text-slate-400 whitespace-pre-line">{cand.mission}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {/* Submission Action Bar */}
        <div className="mt-8 pt-6 border-t border-white/10 flex flex-col items-center">
          <TurnstileWidget onVerify={(token) => setTurnstileToken(token)} />

          <button
            type="button"
            disabled={!allCategoriesSelected || submitting}
            onClick={() => setConfirmModalOpen(true)}
            className="w-full max-w-md py-4 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-2xl text-sm shadow-xl shadow-blue-600/25 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {allCategoriesSelected ? 'Konfirmasi & Masukkan Suara' : 'Lengkapi Pilihan Calon Terlebih Dahulu'}
          </button>
        </div>
      </main>

      {/* Confirmation Modal */}
      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 border border-white/20 rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl">
            <div className="w-12 h-12 bg-blue-500/20 border border-blue-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-400">
              <Info className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Kunci Pilihan Suara Anda?</h3>
            <p className="text-xs text-slate-300 mt-2">
              Sesuai asas Luber Jurdil, surat suara yang dimasukkan ke kotak suara digital bersifat final dan tidak dapat diubah kembali.
            </p>

            <div className="mt-6 flex space-x-3">
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                className="flex-1 py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold transition"
              >
                Kembali
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmitVote}
                className="flex-1 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-lg shadow-blue-600/30"
              >
                {submitting ? 'Memproses...' : 'Ya, Kirim Suara'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
