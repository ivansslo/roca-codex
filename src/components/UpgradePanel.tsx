import React, { useState } from 'react';
import { Sparkles, Shield, Cpu, Zap, Check, CreditCard, Award, ArrowRight } from 'lucide-react';

interface UpgradePanelProps {
  currentTier: string;
  onUpgradeSuccess: (newTier: string) => void;
}

export function UpgradePanel({ currentTier, onUpgradeSuccess }: UpgradePanelProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    cardName: '',
    cardNumber: '4000 1234 5678 9010',
    cardExpiry: '12/28',
    cardCvc: '123'
  });

  const handleUpgradeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    // Simulate payment process
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      onUpgradeSuccess('PRO');
    }, 1500);
  };

  if (success) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-6 max-w-md mx-auto">
        <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mb-6 border border-emerald-500/30 animate-bounce">
          <Award size={36} />
        </div>
        <h2 className="text-2xl font-bold text-theme-text-primary mb-2">Upgrade Successful!</h2>
        <p className="text-sm text-theme-text-secondary mb-6">
          Congratulations! You have successfully upgraded to **ROC Agent PRO**. Your account features, deeper context window, and model speeds have been unlocked.
        </p>
        <div className="bg-theme-card border border-theme-border rounded-xl p-4 w-full text-left space-y-2 mb-6 font-mono text-xs">
          <div className="flex justify-between">
            <span className="text-theme-text-muted">Plan:</span>
            <span className="text-emerald-400 font-semibold">Pro Professional</span>
          </div>
          <div className="flex justify-between">
            <span className="text-theme-text-muted">Workspace Sync Limit:</span>
            <span className="text-theme-text-primary">Unlimited Apps</span>
          </div>
          <div className="flex justify-between">
            <span className="text-theme-text-muted">Model Priority:</span>
            <span className="text-theme-text-primary">Gemini 2.0 Pro</span>
          </div>
          <div className="flex justify-between">
            <span className="text-theme-text-muted">Billed:</span>
            <span className="text-emerald-400 font-semibold">Rp 0 (Akses Penuh / Free)</span>
          </div>
        </div>
        <button
          onClick={() => setSuccess(false)}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-4 rounded-xl text-sm transition-colors cursor-pointer"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 max-w-5xl mx-auto w-full">
      <div className="border-b border-theme-border pb-5">
        <div className="flex items-center gap-2">
          <Sparkles className="text-indigo-400 animate-pulse" size={24} />
          <h1 className="text-2xl font-bold text-theme-text-primary tracking-tight">Upgrade Workspace Account</h1>
        </div>
        <p className="text-sm text-theme-text-secondary mt-1">
          Scale your robotic orchestrator workflow, expand AI synchronization quotas, and unlock Gemini's premium coding architectures.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Plan Cards */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Free Tier Card */}
            <div className="bg-theme-card border border-theme-border rounded-xl p-5 flex flex-col justify-between opacity-75">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-semibold text-theme-text-secondary uppercase tracking-wider">Starter</span>
                  <span className="text-xs text-theme-text-muted font-mono bg-theme-bg px-2 py-0.5 rounded border border-theme-border">Current</span>
                </div>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl font-extrabold text-theme-text-primary">$0</span>
                  <span className="text-xs text-theme-text-muted font-mono">/ month</span>
                </div>
                <p className="text-xs text-theme-text-secondary mb-5 leading-relaxed">
                  Basic robot control chat assistant. Perfect for single developers testing base schemas and simple scripts.
                </p>
                <ul className="space-y-2.5 text-xs text-theme-text-secondary mb-6">
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-theme-text-muted flex-shrink-0" />
                    <span>Up to 10 queries per hour</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-theme-text-muted flex-shrink-0" />
                    <span>Gemini 1.5 Flash Lite engine</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-theme-text-muted flex-shrink-0" />
                    <span>Sync up to 1 workspace app</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Pro Tier Card */}
            <div className="bg-theme-card border-2 border-indigo-500 rounded-xl p-5 flex flex-col justify-between relative shadow-lg shadow-indigo-500/5">
              <div className="absolute top-0 right-5 -translate-y-1/2 bg-indigo-600 text-white text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full tracking-wider border border-indigo-400">
                Most Popular
              </div>
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-semibold text-indigo-400 uppercase tracking-wider">Professional</span>
                  <span className="text-xs text-indigo-300 font-mono bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">Unlocked</span>
                </div>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl font-extrabold text-theme-text-primary font-mono">Rp 0</span>
                  <span className="text-xs text-theme-text-muted font-mono">/ selamanya (Free Access)</span>
                </div>
                <p className="text-xs text-theme-text-secondary mb-5 leading-relaxed">
                  Advanced robotic ecosystem assistant. Engineered for operational squads running complex UI & navigation nodes.
                </p>
                <ul className="space-y-2.5 text-xs text-theme-text-secondary mb-6">
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-indigo-400 flex-shrink-0" />
                    <span className="font-medium text-theme-text-primary">Unlimited hourly queries</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-indigo-400 flex-shrink-0" />
                    <span>Gemini 2.0 Pro / Ultra access</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-indigo-400 flex-shrink-0" />
                    <span className="font-semibold text-indigo-400">Unlimited App Synchronization</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check size={14} className="text-indigo-400 flex-shrink-0" />
                    <span>Continuous Autonomous Agent Loops</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Premium Capabilities list */}
          <div className="bg-theme-card border border-theme-border rounded-xl p-5">
            <h3 className="font-bold text-theme-text-primary text-sm mb-4 flex items-center gap-2">
              <Cpu size={16} className="text-indigo-400" /> Premium Agent Capabilities
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="flex items-start gap-2.5 p-3 bg-theme-bg/50 rounded-lg border border-theme-border">
                <Shield size={16} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-theme-text-primary mb-0.5">Enterprise Shield</h4>
                  <p className="text-theme-text-secondary leading-relaxed">Isolated sandbox compilation, end-to-end secret storage, and fully audited action executions.</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 p-3 bg-theme-bg/50 rounded-lg border border-theme-border">
                <Zap size={16} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-theme-text-primary mb-0.5">Ultra-Low Latency Pipelines</h4>
                  <p className="text-theme-text-secondary leading-relaxed">Runs on high-priority computing zones yielding 4x faster code review and synchronization loops.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Checkout Simulation Form */}
        <div className="bg-theme-card border border-theme-border rounded-xl p-5 h-fit">
          <h3 className="font-bold text-theme-text-primary text-base mb-1.5 flex items-center gap-2">
            <Sparkles size={18} className="text-indigo-400 animate-pulse" /> Portal Aktivasi Pro
          </h3>
          <p className="text-xs text-theme-text-secondary mb-4">Anda sudah memiliki akses penuh. Aktifkan fitur premium di workspace Anda sekarang.</p>

          <div className="space-y-4">
            <div className="bg-theme-bg/60 p-3.5 rounded-lg border border-theme-border space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-theme-text-muted">Workspace Status:</span>
                <span className="text-emerald-400 font-medium">Ready for Upgrade</span>
              </div>
              <div className="flex justify-between">
                <span className="text-theme-text-muted">Harga Langganan:</span>
                <span className="text-theme-text-primary font-mono font-semibold">Rp 0 (Gratis / Free)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-theme-text-muted">Masa Berlaku:</span>
                <span className="text-indigo-400 font-medium">Selamanya (Lifetime)</span>
              </div>
            </div>

            <div className="pt-3 border-t border-theme-border mt-4 space-y-2">
              <p className="text-[10px] text-theme-text-muted leading-relaxed">
                Menekan tombol di bawah akan mengaktifkan modul sinkronisasi aplikasi tak terbatas, prioritas model Gemini 2.0 Pro, dan peningkatan batas kuota workspace Anda secara instan.
              </p>
            </div>

            <button
              type="button"
              onClick={(e) => handleUpgradeSubmit(e)}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-theme-btn-active text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-all duration-200 cursor-pointer select-none mt-4 shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20"
            >
              {loading ? "Mengaktifkan Akses Pro..." : "Aktifkan Pro Gratis Sekarang"}
              {!loading && <ArrowRight size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
