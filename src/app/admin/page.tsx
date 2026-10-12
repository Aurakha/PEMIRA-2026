'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShieldCheck, KeyRound, Lock, AlertTriangle, BarChart3, Users, CheckCircle2, ArrowLeft, RefreshCw } from 'lucide-react';

interface TallyResult {
  category: string;
  candidateNumber: number;
  candidateName: string;
  votes: number;
}

interface TallyResponse {
  success: boolean;
  election: {
    id: string;
    title: string;
    finalizedAt: string;
  };
  participation: {
    totalDpt: number;
    totalVoted: number;
    turnoutPercentage: string;
  };
  results: TallyResult[];
}

export default function AdminTallyPage() {
  const [kpuKey, setKpuKey] = useState('kpu-master-secret-2026');
  const [bawasluKey, setBawasluKey] = useState('bawaslu-audit-secret-2026');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TallyResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFetchTally = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      const res = await fetch(`${apiUrl}/admin/tally-results`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-kpu-secret-key': kpuKey,
          'x-bawaslu-secret-key': bawasluKey,
        },
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.message || 'Gagal membuka brankas rekapitulasi suara.');
      }

      setData(json);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
      <header className="max-w-5xl mx-auto flex items-center justify-between pb-6 border-b border-white/10">
        <div className="flex items-center space-x-3">
          <Link href="/" className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition">
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </Link>
          <div>
            <h1 className="text-lg font-bold flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
              <span>Panel Saksi & Rekapitulasi Terkarantina</span>
            </h1>
            <p className="text-xs text-slate-400">Dual-Control Quorum Security System (KPU & Bawaslu)</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto my-8">
        {!data ? (
          <div className="max-w-md mx-auto bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-14 h-14 mx-auto mb-3 bg-indigo-500/20 border border-indigo-400/30 rounded-2xl flex items-center justify-center">
                <Lock className="w-7 h-7 text-indigo-400" />
              </div>
              <h2 className="text-xl font-bold">Buka Brankas Suara</h2>
              <p className="text-xs text-slate-400 mt-1">
                Rekapitulasi terkunci secara kriptografis dan membutuhkan 2 kunci otorisasi sah.
              </p>
            </div>

            {errorMsg && (
              <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start space-x-3 text-xs text-rose-300">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-400 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleFetchTally} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center space-x-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-blue-400" />
                  <span>Kunci Master KPU</span>
                </label>
                <input
                  type="password"
                  value={kpuKey}
                  onChange={(e) => setKpuKey(e.target.value)}
                  placeholder="Masukkan KPU Secret Key"
                  required
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center space-x-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-purple-400" />
                  <span>Kunci Audit Bawaslu</span>
                </label>
                <input
                  type="password"
                  value={bawasluKey}
                  onChange={(e) => setBawasluKey(e.target.value)}
                  placeholder="Masukkan Bawaslu Secret Key"
                  required
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl font-semibold text-sm transition shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Membuka Brankas...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Otorisasi & Buka Hasil</span>
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900 border border-white/10 rounded-2xl p-5">
                <div className="text-xs text-slate-400 flex items-center space-x-2 mb-1">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span>Total Pemilih Tetap (DPT)</span>
                </div>
                <div className="text-2xl font-bold">{data.participation.totalDpt.toLocaleString()}</div>
              </div>

              <div className="bg-slate-900 border border-white/10 rounded-2xl p-5">
                <div className="text-xs text-slate-400 flex items-center space-x-2 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Hak Suara Terpakai</span>
                </div>
                <div className="text-2xl font-bold text-emerald-400">{data.participation.totalVoted.toLocaleString()}</div>
              </div>

              <div className="bg-slate-900 border border-white/10 rounded-2xl p-5">
                <div className="text-xs text-slate-400 flex items-center space-x-2 mb-1">
                  <BarChart3 className="w-4 h-4 text-purple-400" />
                  <span>Tingkat Partisipasi</span>
                </div>
                <div className="text-2xl font-bold text-purple-400">{data.participation.turnoutPercentage}</div>
              </div>
            </div>

            {/* Results cards */}
            <div className="bg-slate-900 border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center space-x-2">
                <BarChart3 className="w-5 h-5 text-indigo-400" />
                <span>Hasil Perolehan Suara Terbuka</span>
              </h3>

              <div className="space-y-4">
                {data.results.map((r, idx) => (
                  <div key={idx} className="bg-slate-950/80 border border-white/5 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-xs text-indigo-400 font-semibold uppercase">{r.category}</span>
                      <h4 className="font-bold text-base mt-0.5">
                        No. {r.candidateNumber} - {r.candidateName}
                      </h4>
                    </div>
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <span className="text-xs text-slate-400">Total Suara</span>
                        <div className="text-xl font-bold text-emerald-400">{r.votes.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setData(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-semibold text-slate-300 transition"
              >
                Kunci Kembali Brankas
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
