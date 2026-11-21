import React, { useState, useEffect } from 'react';
import {
  Settings,
  Key,
  Database,
  Shield,
  Save,
  Check,
  AlertCircle,
  Copy,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { UserSettings } from '../../types';
import { getUserSettings, saveUserSettings, isSupabaseConfigured } from '../../lib/supabase';

export const SettingsView: React.FC = () => {
  const [openaiApiKey, setOpenaiApiKey] = useState<string>('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');
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [defaultRiskPercent, setDefaultRiskPercent] = useState<number>(1.0);
  const [startingBalance, setStartingBalance] = useState<number>(10000);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [copiedSchema, setCopiedSchema] = useState<boolean>(false);

  useEffect(() => {
    const load = async () => {
      const s = await getUserSettings();
      if (s.openaiApiKey) setOpenaiApiKey(s.openaiApiKey);
      if (s.geminiApiKey) setGeminiApiKey(s.geminiApiKey);
      if (s.defaultRiskPercent) setDefaultRiskPercent(s.defaultRiskPercent);
      if (s.startingBalance) setStartingBalance(s.startingBalance);
    };
    load();
  }, []);

  const handleSave = async () => {
    const current = await getUserSettings();
    await saveUserSettings({
      ...current,
      openaiApiKey: openaiApiKey.trim() || undefined,
      geminiApiKey: geminiApiKey.trim() || undefined,
      defaultRiskPercent,
      startingBalance,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const copySqlSchema = () => {
    const sqlText = `-- TradeIQ Supabase Schema
-- Run this in your Supabase SQL Editor:
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Tables: user_settings, uploaded_charts, analysis_history, paper_trading_positions, paper_trading_transactions, watchlists
-- See supabase_schema.sql in the project root for full RLS definitions.`;
    navigator.clipboard.writeText(sqlText);
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
          <Settings className="w-6 h-6 text-emerald-400" />
          <span>Platforma Sozlamalari & Integratsiyalar</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Sun'iy intellekt (Gemini) kalitlari, Supabase ma'lumotlar bazasi va risk parametrlarini sozlang.
        </p>
      </div>

      {savedSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>Sozlamalar muvaffaqiyatli saqlandi!</span>
        </div>
      )}

      {/* 1. OpenAI GPT-4o Vision API */}
      <div className="p-6 rounded-xl bg-[#090D15] border border-[#1B2436] space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#1B2436] pb-3">
          <div className="flex items-center gap-2.5">
            <Key className="w-5 h-5 text-emerald-400" />
            <h2 className="font-bold text-sm text-white">OpenAI GPT-4o Multimodal Vision API</h2>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            FAOL / TAVSIYA ETILGAN
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed font-sans">
          Grafik skrinshotlarini yuqori aniqlikda tahlil qilish va follow-up chatda savollarga javob berish uchun OpenAI API kalitingiz.
        </p>

        <div>
          <label className="block text-xs font-mono text-slate-400 mb-1.5">
            OpenAI API Kaliti (sk-...)
          </label>
          <input
            type="password"
            value={openaiApiKey}
            onChange={(e) => setOpenaiApiKey(e.target.value)}
            placeholder="sk-proj-..."
            className="w-full bg-[#0E1522] border border-[#202D44] text-white font-mono text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500 placeholder-slate-600 transition-colors"
          />
          <div className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Brauzerda va backend .env muhitida xavfsiz saqlanadi.</span>
          </div>
        </div>
      </div>

      {/* 2. Google Gemini API */}
      <div className="p-6 rounded-xl bg-[#090D15] border border-[#1B2436] space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#1B2436] pb-3">
          <div className="flex items-center gap-2.5">
            <Key className="w-5 h-5 text-sky-400" />
            <h2 className="font-bold text-sm text-white">Google Gemini Multimodal Vision API (Ixtiyoriy)</h2>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30">
            ZAXIRA / FALLBACK
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed font-sans">
          Ixtiyoriy zaxira: Google Gemini API kalitini kiritishingiz mumkin.
        </p>

        <div>
          <label className="block text-xs font-mono text-slate-400 mb-1.5">
            Gemini API Kaliti (Key)
          </label>
          <input
            type="password"
            value={geminiApiKey}
            onChange={(e) => setGeminiApiKey(e.target.value)}
            placeholder="AIzaSy..."
            className="w-full bg-[#0E1522] border border-[#202D44] text-white font-mono text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500 placeholder-slate-600 transition-colors"
          />
        </div>
      </div>

      {/* 2. Supabase Cloud Database */}
      <div className="p-6 rounded-xl bg-[#090D15] border border-[#1B2436] space-y-4 shadow-xl">
        <div className="flex items-center justify-between border-b border-[#1B2436] pb-3">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-sky-400" />
            <h2 className="font-bold text-sm text-white">Supabase Bulutli Baza & Xotira</h2>
          </div>
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded ${
              isSupabaseConfigured
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
            }`}
          >
            {isSupabaseConfigured ? 'ULANDI' : 'LOKAL XOTIRA REJIMI'}
          </span>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          {isSupabaseConfigured
            ? 'Masofaviy Supabase ma\'lumotlar bazasiga ulangan. Tahlillar va virtual bitimlar Row Level Security (RLS) orqali qurilmalararo sinxronlanadi.'
            : 'Xavfsiz Lokal Xotira (LocalStorage) rejimida ishlamoqda. Barcha yozuvlar va bitimlar brauzeringizda saqlanib qoladi. Bulutli bazani ulash uchun .env fayliga VITE_SUPABASE_URL qo\'shing.'}
        </p>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={copySqlSchema}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#121927] hover:bg-[#1A2336] text-slate-300 border border-[#202D44] text-xs font-mono transition-colors"
          >
            {copiedSchema ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedSchema ? 'SQL Sxema Nusxalandi' : 'Supabase SQL Sxemasidan Nusxa Olish'}</span>
          </button>
        </div>
      </div>

      {/* 3. Risk Management Defaults */}
      <div className="p-6 rounded-xl bg-[#090D15] border border-[#1B2436] space-y-4 shadow-xl">
        <div className="flex items-center gap-2.5 border-b border-[#1B2436] pb-3">
          <Shield className="w-5 h-5 text-amber-400" />
          <h2 className="font-bold text-sm text-white">Risk Boshqaruvi & Simulyatsiya Parametrlari</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1.5">
              Har Bir Bitim Uchun Standart Risk (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="5.0"
              value={defaultRiskPercent}
              onChange={(e) => setDefaultRiskPercent(parseFloat(e.target.value) || 1.0)}
              className="w-full bg-[#0E1522] border border-[#202D44] text-white font-mono text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">Institutsional standart: 1.0% - 2.0%</span>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-400 mb-1.5">
              Boshlang'ich Virtual Depozit ($)
            </label>
            <input
              type="number"
              value={startingBalance}
              onChange={(e) => setStartingBalance(parseFloat(e.target.value) || 10000)}
              className="w-full bg-[#0E1522] border border-[#202D44] text-white font-mono text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:border-emerald-500"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">Virtual savdo uchun boshlang'ich kapital</span>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#07090E] font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
        >
          <Save className="w-4 h-4 fill-current" />
          <span>O'zgarishlarni Saqlash</span>
        </button>
      </div>
    </div>
  );
};
