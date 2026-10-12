'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, CheckCircle2, Copy, Check, LogOut, Printer, Lock } from 'lucide-react';

export default function ReceiptPage() {
  const router = useRouter();
  const [voter, setVoter] = useState<any>(null);
  const [receiptToken, setReceiptToken] = useState<string>('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const storedVoter = localStorage.getItem('pemira_voter');
    const storedReceipt = localStorage.getItem('pemira_receipt');

    if (!storedVoter) {
      router.push('/');
      return;
    }

    const parsedVoter = JSON.parse(storedVoter);
    setVoter(parsedVoter);
    setReceiptToken(storedReceipt || parsedVoter.receiptHash || 'VOTE-RCPT-SAMPLE-HASH-2026');
  }, [router]);

  const handleCopy = () => {
    if (receiptToken) {
      navigator.clipboard.writeText(receiptToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-4 md:p-8">
      {/* Header */}
      <header className="max-w-2xl mx-auto w-full flex items-center justify-between pb-4 border-b border-white/10">
        <div className="flex items-center space-x-2 text-sm font-bold">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span>KOMISI PEMILIHAN UMUM MAHASISWA</span>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg transition"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Keluar</span>
        </button>
      </header>

      {/* Receipt Card */}
      <main className="max-w-xl mx-auto w-full my-8">
        <div className="bg-gradient-to-b from-slate-900 to-slate-900/90 border border-emerald-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          {/* Accent Glow */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-emerald-500/20 border border-emerald-500/40 rounded-3xl flex items-center justify-center mx-auto mb-3 text-emerald-400">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Suara Anda Sah Masuk!</h1>
            <p className="text-xs text-slate-300 mt-1">
              Terima kasih telah menggunakan hak pilih secara Luber Jurdil pada Pemira Kampus 2026.
            </p>
          </div>

          {/* Voter Info */}
          {voter && (
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-2 text-xs mb-6">
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">Nama Pemilih:</span>
                <span className="font-semibold text-white">{voter.fullName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">NIM:</span>
                <span className="font-semibold text-white">{voter.nim}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">Fakultas:</span>
                <span className="font-semibold text-white">{voter.faculty || '-'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Status Hak Suara:</span>
                <span className="font-bold text-emerald-400 flex items-center space-x-1">
                  <span>TERCATAT</span>
                </span>
              </div>
            </div>
          )}

          {/* Cryptographic Receipt Hash */}
          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-4 text-center mb-6">
            <span className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider block mb-1">
              Cryptographic Voting Receipt Token
            </span>
            <div className="font-mono text-xs sm:text-sm text-emerald-200 bg-black/40 px-3 py-2.5 rounded-xl border border-emerald-500/20 break-all select-all flex items-center justify-between">
              <span>{receiptToken}</span>
              <button
                onClick={handleCopy}
                className="ml-2 p-1.5 hover:bg-white/10 rounded-lg text-emerald-300 transition flex-shrink-0"
                title="Salin Token"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2 flex items-center justify-center space-x-1">
              <Lock className="w-3 h-3 text-slate-400" />
              <span>Token ini adalah bukti matematis keikutsertaan tanpa membongkar paslon pilihan Anda.</span>
            </p>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={() => window.print()}
              className="flex-1 py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center justify-center space-x-2 transition"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Bukti</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-600/30"
            >
              Selesai & Keluar
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-500 py-2">
        Sistem ini mengimplementasikan Zero Linkability Cryptographic Architecture &bull; Pemira 2026
      </footer>
    </div>
  );
}
