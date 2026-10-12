'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, Vote, Lock, AlertCircle, ArrowRight, CheckCircle2, Shield } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [emailInput, setEmailInput] = useState('pemilih1@mahasiswa.ac.id');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSsoLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      const res = await fetch(`${apiUrl}/auth/login-sso`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Menggunakan simulasi token SSO terverifikasi untuk kemudahan pengujian
          idToken: `mock-token:${emailInput}`,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Gagal melakukan autentikasi.');
      }

      // Simpan JWT di localStorage / sessionStorage
      localStorage.setItem('pemira_token', data.token);
      localStorage.setItem('pemira_voter', JSON.stringify(data.voter));
      localStorage.setItem('pemira_election', JSON.stringify(data.election));

      if (data.voter.hasVoted) {
        // Jika sudah memilih, arahkan langsung ke halaman bukti tanda terima (receipt)
        router.push('/receipt');
      } else {
        // Arahkan ke bilik suara
        router.push('/voting');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col justify-between p-4 md:p-8 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white">
      {/* Header Kampus */}
      <header className="max-w-5xl mx-auto w-full flex items-center justify-between py-4 border-b border-white/10">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-blue-600/30 border border-blue-400/30 rounded-xl backdrop-blur-md">
            <Vote className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="font-bold text-lg md:text-xl tracking-tight">PEMIRA KAMPUS 2026</h1>
            <p className="text-xs text-blue-300">Komisi Pemilihan Umum Mahasiswa</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <div className="hidden sm:flex items-center space-x-2 text-xs bg-emerald-500/10 text-emerald-300 px-3 py-1.5 rounded-full border border-emerald-500/30">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Sistem Terverifikasi Luber Jurdil</span>
          </div>
          <Link
            href="/admin"
            className="flex items-center space-x-1 text-xs text-indigo-300 hover:text-indigo-100 bg-indigo-500/20 hover:bg-indigo-500/30 px-3 py-1.5 rounded-full border border-indigo-400/30 transition"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Panel Saksi</span>
          </Link>
        </div>
      </header>

      {/* Hero & Login Card */}
      <div className="max-w-md mx-auto w-full my-8">
        <div className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-3xl p-6 sm:p-8 shadow-2xl">
          <div className="text-center mb-6">
            <div className="inline-flex p-3 bg-indigo-500/20 text-indigo-300 rounded-2xl mb-3 border border-indigo-400/20">
              <Lock className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Portal Bilik Suara Digital</h2>
            <p className="text-sm text-slate-300 mt-1">
              Gunakan akun Google Workspace kampus Anda untuk menggunakan hak suara.
            </p>
          </div>

          {errorMsg && (
            <div className="mb-5 p-3.5 bg-red-500/20 border border-red-500/40 rounded-xl text-red-200 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSsoLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Email Kampus Mahasiswa Terdaftar (DPT)
              </label>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="nama@mahasiswa.ac.id"
                required
                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
              <p className="text-[11px] text-slate-400 mt-1.5">
                Khusus domain resmi: <span className="text-blue-300">@mahasiswa.ac.id</span> atau <span className="text-blue-300">@campus.ac.id</span>
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl text-sm shadow-lg shadow-blue-600/30 transition duration-200 disabled:opacity-50"
            >
              {loading ? (
                <span>Memvalidasi SSO & DPT...</span>
              ) : (
                <>
                  <span>Masuk dengan Google SSO</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo DPT Selection */}
          <div className="mt-6 pt-5 border-t border-white/10 text-xs text-slate-300">
            <span className="font-semibold block mb-2 text-slate-200">Uji Coba Cepat (Akun DPT Seed):</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEmailInput('pemilih1@mahasiswa.ac.id')}
                className="text-left p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] truncate text-blue-200"
              >
                Andi (Informatika)
              </button>
              <button
                type="button"
                onClick={() => setEmailInput('pemilih2@mahasiswa.ac.id')}
                className="text-left p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] truncate text-blue-200"
              >
                Bella (Manajemen)
              </button>
            </div>
          </div>
        </div>

        {/* Security Feature Badges */}
        <div className="mt-6 grid grid-cols-3 gap-2 text-center text-slate-300 text-[11px]">
          <div className="p-3 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
            <span>Zero Linkability</span>
          </div>
          <div className="p-3 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
            <CheckCircle2 className="w-4 h-4 text-blue-400 mx-auto mb-1" />
            <span>Single Session</span>
          </div>
          <div className="p-3 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-sm">
            <CheckCircle2 className="w-4 h-4 text-purple-400 mx-auto mb-1" />
            <span>Anti Coblos Ganda</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-400 py-4">
        &copy; 2026 Badan Pengawas & Komisi Pemilihan Umum Mahasiswa. Seluruh hak cipta dilindungi undang-undang.
      </footer>
    </main>
  );
}
