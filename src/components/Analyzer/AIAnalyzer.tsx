import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Brain,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldAlert,
  Target,
  ChevronDown,
  ChevronUp,
  Info,
  FileImage,
  RefreshCw,
  PlusCircle,
  Copy,
  Check,
  Trash2,
  HelpCircle,
  Paperclip,
  ArrowUp,
  MessageCircle,
  Wallet,
  DollarSign,
  Calculator,
  Percent,
} from 'lucide-react';
import { AnalysisResult, CandleData, Timeframe } from '../../types';
import { saveAnalysisResult, getUserSettings, saveUserSettings } from '../../lib/supabase';
import { formatAssetPrice } from '../../lib/formatPrice';
import { runDirectAIAnalysis, runDirectAIChat } from '../../services/aiDirectClient';
import { TRADING_STRATEGIES } from '../../strategies';

interface AIAnalyzerProps {
  initialSymbol?: string;
  initialTimeframe?: Timeframe;
  initialCandles?: CandleData[];
  onOpenPaperTrade?: (setup: AnalysisResult) => void;
  onAnalysisSaved?: (item: AnalysisResult) => void;
}

interface ChatMessage {
  role: 'user' | 'ai';
  text?: string;
  imageUrl?: string;
  fileName?: string;
  isTyping?: boolean;
}

const ACTIVE_ANALYSIS_STORAGE_KEY = 'tradeiq_active_analysis_session';

// High-resolution image compressor: keeps full detail, never downscales below 1600px on long side
const compressImageForStorage = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const longSide = Math.max(width, height);

        // Never downscale below 1600px on long side!
        // Only clamp if image is massive (e.g. > 2400px), down to 2200px so it remains >= 1600px.
        const TARGET_MAX_LONG = 2200;
        if (longSide > TARGET_MAX_LONG) {
          if (width >= height) {
            height = Math.round((height * TARGET_MAX_LONG) / width);
            width = TARGET_MAX_LONG;
          } else {
            width = Math.round((width * TARGET_MAX_LONG) / height);
            height = TARGET_MAX_LONG;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.92));
        } else {
          resolve(e.target?.result as string);
        }
      };
      img.onerror = () => resolve(e.target?.result as string);
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
};

function dataURLtoFile(dataurl: string, filename: string): File {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

export const AIAnalyzer: React.FC<AIAnalyzerProps> = ({
  initialSymbol = 'BTC/USDT',
  initialTimeframe = '1h',
  initialCandles,
  onOpenPaperTrade,
  onAnalysisSaved,
}) => {
  const [symbol, setSymbol] = useState<string>(initialSymbol);
  const [timeframe, setTimeframe] = useState<Timeframe>(initialTimeframe);
  const [notes, setNotes] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisStep, setAnalysisStep] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Expandable sections state
  const [expandConfluence, setExpandConfluence] = useState<boolean>(true);
  const [expandInvalidation, setExpandInvalidation] = useState<boolean>(true);
  const [expandLimitations, setExpandLimitations] = useState<boolean>(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);

  // User balance & risk management state
  const [userBalance, setUserBalance] = useState<number>(1000);
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const [customRR, setCustomRR] = useState<number>(2.0);
  const [balanceSavedNotice, setBalanceSavedNotice] = useState<boolean>(false);

  // User's own active trade on market state (optional)
  const [myActivePosition, setMyActivePosition] = useState<'NONE' | 'BUY' | 'SELL'>('NONE');
  const [myEntryPrice, setMyEntryPrice] = useState<string>('');

  // Multi-Strategy & Auto Mode state (Avto is default and main mode)
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>('auto');
  const [showManualStrategies, setShowManualStrategies] = useState<boolean>(false);
  const [showAllStrategiesList, setShowAllStrategiesList] = useState<boolean>(false);

  // Helper to persist session updates to localStorage
  const persistSession = (updates: Partial<{
    previewUrl: string | null;
    fileName: string;
    symbol: string;
    timeframe: Timeframe;
    notes: string;
    analysisResult: AnalysisResult | null;
    chatMessages: ChatMessage[];
  }>) => {
    try {
      const savedRaw = localStorage.getItem(ACTIVE_ANALYSIS_STORAGE_KEY);
      const prev = savedRaw ? JSON.parse(savedRaw) : {};
      const merged = { ...prev, ...updates };
      localStorage.setItem(ACTIVE_ANALYSIS_STORAGE_KEY, JSON.stringify(merged));
    } catch (e) {
      console.warn('Failed to save active analysis session to localStorage:', e);
    }
  };

  // Restore active analysis session from localStorage on mount
  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem(ACTIVE_ANALYSIS_STORAGE_KEY);
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        if (saved.previewUrl) {
          setPreviewUrl(saved.previewUrl);
          try {
            const reconstructedFile = dataURLtoFile(saved.previewUrl, saved.fileName || 'active-chart.jpg');
            setSelectedFile(reconstructedFile);
          } catch (_) {}
        }
        if (saved.symbol) setSymbol(saved.symbol);
        if (saved.timeframe) setTimeframe(saved.timeframe);
        if (saved.notes) setNotes(saved.notes);
        if (saved.analysisResult) setAnalysisResult(saved.analysisResult);
        if (saved.chatMessages && Array.isArray(saved.chatMessages)) {
          setChatMessages(saved.chatMessages);
        }
      }
    } catch (e) {
      console.warn('Failed to restore active analysis from localStorage:', e);
    }
  }, []);

  // Load user balance and default risk on mount
  useEffect(() => {
    getUserSettings().then((s) => {
      if (s.currentBalance && s.currentBalance > 0) setUserBalance(s.currentBalance);
      if (s.defaultRiskPercent && s.defaultRiskPercent > 0) setRiskPercent(s.defaultRiskPercent);
    });
  }, []);

  const handleUpdateBalance = async (newVal: number) => {
    const val = Math.max(1, newVal);
    setUserBalance(val);
    await saveUserSettings({ currentBalance: val });
    setBalanceSavedNotice(true);
    setTimeout(() => setBalanceSavedNotice(false), 2000);
  };

  const handleUpdateRisk = async (newRisk: number) => {
    const val = Math.max(0.1, newRisk);
    setRiskPercent(val);
    await saveUserSettings({ defaultRiskPercent: val });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatAttachRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const symbolsList = [
    'BTC/USDT',
    'ETH/USDT',
    'SOL/USDT',
    'XAU/USD',
    'EUR/USD',
    'GBP/USD',
    'NAS100',
    'US30',
  ];
  const timeframesList: Timeframe[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1D', '1W'];

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const getCustomApiKey = (): string => {
    try {
      const userSettings = localStorage.getItem('tradeiq_user_settings');
      if (userSettings) {
        const parsed = JSON.parse(userSettings);
        return parsed.openaiApiKey || parsed.geminiApiKey || '';
      }
    } catch (_) {}
    return '';
  };

  const applyFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg("Faqat PNG, JPG yoki WEBP formatidagi rasm yuklang.");
      return;
    }
    setSelectedFile(file);
    setErrorMsg(null);
    try {
      const compressedDataUrl = await compressImageForStorage(file);
      setPreviewUrl(compressedDataUrl);
      persistSession({
        previewUrl: compressedDataUrl,
        fileName: file.name,
        analysisResult: null,
        chatMessages: [],
        symbol,
        timeframe,
        notes,
      });
    } catch {
      const objUrl = URL.createObjectURL(file);
      setPreviewUrl(objUrl);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) applyFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) applyFile(file);
  };

  const handleRemoveImage = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedFile(null);
    setPreviewUrl(null);
    setAnalysisResult(null);
    setChatMessages([]);
    setErrorMsg(null);
    try {
      localStorage.removeItem(ACTIVE_ANALYSIS_STORAGE_KEY);
    } catch (_) {}
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const triggerAnalysis = async () => {
    let fileToUpload = selectedFile;
    if (!fileToUpload && previewUrl && previewUrl.startsWith('data:')) {
      try {
        fileToUpload = dataURLtoFile(previewUrl, 'active-chart.jpg');
        setSelectedFile(fileToUpload);
      } catch (_) {}
    }

    if (!fileToUpload) {
      setErrorMsg("Iltimos, avval tahlil qilish uchun grafik skrinshotini yuklang.");
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg(null);
    setChatMessages([]);
    setAnalysisResult(null);

    setAnalysisStep("Grafik o'qilmoqda");
    const timer1 = setTimeout(() => setAnalysisStep("Strategiyalar tekshirilmoqda"), 1200);
    const timer2 = setTimeout(() => setAnalysisStep("Natija tasdiqlanmoqda"), 3200);

    try {
      let result: AnalysisResult | null = null;
      const customApiKey = getCustomApiKey();

      // Combine user notes with active position info if specified
      let effectiveNotes = notes.trim();
      if (myActivePosition !== 'NONE') {
        const posText = `[FOYDALANUVCHINING OCHIQ BITIMI BOR: ${myActivePosition}${myEntryPrice ? ` @ $${myEntryPrice}` : ''}. Iltimos, grafik tahlili asosida ushbu ochilgan bitimim bo'yicha aniq harakat rejasini (Ushlab turish / Stop-loss surish / Foydani olish / Zararni qisqartirish) AYNAN BAHOLANG!]`;
        effectiveNotes = effectiveNotes ? `${effectiveNotes} ${posText}` : posText;
      }

      // 1. Try Backend API first (/api/analyze-chart)
      try {
        const formData = new FormData();
        formData.append('symbol', symbol);
        formData.append('timeframe', timeframe);
        formData.append('strategyId', selectedStrategyId);
        if (effectiveNotes) formData.append('notes', effectiveNotes);
        formData.append('chart', fileToUpload);
        if (initialCandles && initialCandles.length > 0) {
          formData.append('candles', JSON.stringify(initialCandles));
        }

        const headers: Record<string, string> = {};
        if (customApiKey) {
          headers['x-gemini-key'] = customApiKey;
          headers['x-openai-key'] = customApiKey;
        }

        const res = await fetch('/api/analyze-chart', {
          method: 'POST',
          headers,
          body: formData,
        });

        if (res.ok) {
          const text = await res.text();
          const json = JSON.parse(text);
          if (json.success && json.data) {
            result = {
              id: `analysis-${Date.now()}`,
              ...json.data,
              chartImageUrl: previewUrl || undefined,
              createdAt: new Date().toISOString(),
            };
          }
        }
      } catch (backendErr) {
        console.warn('Backend API unavailable, falling back to direct AI client:', backendErr);
      }

      // 2. Direct Client-side AI fallback (guaranteed to work on Vercel without fetch failed errors)
      if (!result) {
        if (!previewUrl) {
          throw new Error("Grafik skrinshoti topilmadi. Qaytadan yuklang.");
        }
        result = await runDirectAIAnalysis(previewUrl, symbol, timeframe, effectiveNotes, customApiKey, selectedStrategyId);
      }

      // Sync detected symbol and timeframe if available
      if (result.symbol && result.symbol !== 'Grafik') {
        setSymbol(result.symbol);
      }
      if (result.timeframe) {
        setTimeframe(result.timeframe as Timeframe);
      }

      setAnalysisResult(result);
      await saveAnalysisResult(result);
      if (onAnalysisSaved) onAnalysisSaved(result);

      // Initialize chat with screenshot thumbnail + AI signal summary
      const signalLabel =
        result.signal === 'BUY'
          ? 'BUY'
          : result.signal === 'SELL'
          ? 'SELL'
          : 'KUTING';

      const initialChat: ChatMessage[] = [
        {
          role: 'user',
          imageUrl: previewUrl || undefined,
          fileName: fileToUpload?.name || 'chart.jpg',
        },
        {
          role: 'ai',
          text: signalLabel,
        },
      ];

      setChatMessages(initialChat);

      persistSession({
        analysisResult: result,
        symbol: result.symbol || symbol,
        timeframe: (result.timeframe as Timeframe) || timeframe,
        notes,
        chatMessages: initialChat,
      });

      setTimeout(() => {
        document.getElementById('analysis-results-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    } catch (err: any) {
      console.error('Analysis error:', err);
      setAnalysisResult(null);
      setErrorMsg(err.message || 'AI tahlil dvigatelida xatolik yuz berdi.');
    } finally {
      setIsAnalyzing(false);
      setAnalysisStep('');
    }
  };

  const handleChatSend = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    const question = chatInput.trim();
    setChatInput('');

    setChatMessages((prev) => [...prev, { role: 'user', text: question }]);
    setChatMessages((prev) => [...prev, { role: 'ai', isTyping: true }]);
    setIsChatLoading(true);

    let answer = '';

    try {
      const formData = new FormData();
      formData.append('question', question);
      if (analysisResult) formData.append('analysisContext', JSON.stringify(analysisResult));
      if (selectedFile) formData.append('chart', selectedFile);

      const customApiKey = getCustomApiKey();
      const headers: Record<string, string> = {};
      if (customApiKey) {
        headers['x-gemini-key'] = customApiKey;
        headers['x-openai-key'] = customApiKey;
      }

      const res = await fetch('/api/chat-followup', { method: 'POST', headers, body: formData });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.answer) {
          answer = json.answer;
        }
      }
    } catch {
      // Fallback to direct client AI chat
    }

    if (!answer) {
      try {
        const customApiKey = getCustomApiKey();
        answer = await runDirectAIChat(question, analysisResult, customApiKey);
      } catch (err: any) {
        answer = err.message || "Xatolik yuz berdi. Qayta urinib ko'ring.";
      }
    }

    setChatMessages((prev) =>
      prev.map((m, i) => (i === prev.length - 1 ? { role: 'ai', text: answer } : m))
    );
    setIsChatLoading(false);
  };

  const handleChatAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      // New screenshot — reset everything and start fresh analysis
      setAnalysisResult(null);
      setChatMessages([]);
      applyFile(file);
      if (chatAttachRef.current) chatAttachRef.current.value = '';
    }
  };

  // Asset-aware price formatter

  const copySetupToClipboard = () => {
    if (!analysisResult) return;
    const isWait = analysisResult.signal === 'WAIT' || analysisResult.scenarioType === 'No Setup';
    const text = isWait
      ? `TRADEIQ tahlili — ${analysisResult.symbol} (${analysisResult.timeframe}):
Signali: KUTING (WAIT)
Kutilayotgan daraja: ${analysisResult.waitFor || 'Qulayroq kirish darajasi'}
Sabab: ${analysisResult.chartContext}
Ishonch: ${analysisResult.confidenceScore}%`
      : `TRADEIQ tahlili — ${analysisResult.symbol} (${analysisResult.timeframe}):
Yo'nalish: ${analysisResult.marketDirection} | Setup: ${analysisResult.scenarioType}
Kirish: ${formatAssetPrice(analysisResult.entryZone.optimal, analysisResult.symbol)}
Stop Loss: ${formatAssetPrice(analysisResult.stopLoss, analysisResult.symbol)}
Take Profit 1: ${formatAssetPrice(analysisResult.takeProfit1, analysisResult.symbol)}
Take Profit 2: ${formatAssetPrice(analysisResult.takeProfit2, analysisResult.symbol)}
Risk/Reward: 1:${analysisResult.riskRewardRatio}
Ishonch: ${analysisResult.confidenceScore}%
Bekor bo'lish: ${analysisResult.invalidationCriteria}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Dynamic Money Management metrics
  const entryPrice = analysisResult?.entryZone?.optimal || 0;
  const originalSL = analysisResult?.stopLoss || 0;
  const isBuy = analysisResult?.marketDirection === 'Bullish' || analysisResult?.signal === 'BUY';
  const slDistance = entryPrice > 0 ? Math.abs(entryPrice - originalSL) : 0;
  const riskAmountUsd = userBalance * (riskPercent / 100);
  const positionSizeUsd = slDistance > 0 && entryPrice > 0
    ? (riskAmountUsd / (slDistance / entryPrice))
    : (userBalance * 0.1);
  const positionQuantity = entryPrice > 0 ? (positionSizeUsd / entryPrice) : 0;
  const calculatedTargetTP = slDistance > 0
    ? (isBuy ? entryPrice + (slDistance * customRR) : entryPrice - (slDistance * customRR))
    : (analysisResult?.takeProfit1 || 0);
  const profitAtTargetTP = riskAmountUsd * customRR;
  const lossAtSL = riskAmountUsd;

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6 pb-16">
      {/* 1. Page Title & Short Description */}
      <div className="text-center sm:text-left space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center justify-center sm:justify-start gap-2.5">
          <Brain className="w-7 h-7 text-emerald-400" />
          <span>AI Grafik Tahlilchisi</span>
        </h1>
        <p className="text-sm text-slate-400">
          Har qanday grafik skrinshotini yuklang — AI institutsional darajadagi texnik tuzilma auditi va ta'limiy simulyatsiya stsenariylarini yaratadi.
        </p>
      </div>

      {/* 2. Large Centered Chart Image Upload Container */}
      <div className="w-full">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => !previewUrl && fileInputRef.current?.click()}
          className={`relative w-full rounded-2xl border-2 transition-all overflow-hidden ${
            previewUrl
              ? 'border-[#1E293B] bg-[#0A0E17]'
              : 'border-dashed border-[#1E293B] hover:border-emerald-500/50 bg-[#0A0E17]/80 hover:bg-[#0E1524]/60 cursor-pointer min-h-[360px] sm:min-h-[420px] flex flex-col items-center justify-center p-8'
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/png, image/jpeg, image/webp"
            className="hidden"
          />

          {previewUrl ? (
            /* Uploaded Image Preview Mode */
            <div className="relative w-full flex flex-col items-center justify-center bg-black/40 p-3 sm:p-4">
              <div className="relative w-full flex items-center justify-center max-h-[560px] overflow-hidden rounded-xl border border-[#1E293B] bg-black">
                <img
                  src={previewUrl}
                  alt="Yuklangan grafik"
                  className="w-full max-h-[560px] object-contain select-none"
                />
              </div>

              {/* Action Toolbar on Top-Right */}
              <div className="absolute top-6 right-6 flex items-center gap-2 bg-[#090D15]/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#1E293B] shadow-xl">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs font-mono text-slate-300 hover:text-emerald-400 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Rasmni almashtir</span>
                </button>
                <span className="text-slate-600">|</span>
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="flex items-center gap-1.5 text-xs font-mono text-rose-400 hover:text-rose-300 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>O'chirish</span>
                </button>
              </div>

              {/* Status Badge */}
              <div className="absolute bottom-6 left-6 flex items-center gap-2 bg-[#090D15]/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-[#1E293B] text-[11px] font-mono text-emerald-400">
                <FileImage className="w-3.5 h-3.5" />
                <span>{selectedFile?.name || 'Grafik skrinshoti tayyor'}</span>
              </div>
            </div>
          ) : (
            /* Empty Upload Prompt */
            <div className="text-center space-y-3.5 py-6">
              <div className="w-16 h-16 rounded-2xl bg-[#121927] border border-[#202D44] mx-auto flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/10">
                <Upload className="w-7 h-7" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white tracking-wide">
                  Grafikni yuklang
                </h3>
                <p className="text-xs text-slate-400">
                  Grafik skrinshotingizni bu yerga tashlang yoki ko'rish uchun bosing
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 pt-1">
                <span className="text-[10px] font-mono px-2.5 py-1 rounded-md bg-[#131A28] text-slate-400 border border-[#1E293B]">
                  PNG
                </span>
                <span className="text-[10px] font-mono px-2.5 py-1 rounded-md bg-[#131A28] text-slate-400 border border-[#1E293B]">
                  JPG
                </span>
                <span className="text-[10px] font-mono px-2.5 py-1 rounded-md bg-[#131A28] text-slate-400 border border-[#1E293B]">
                  WEBP
                </span>
                <span className="text-[10px] text-slate-500 font-mono ml-1">15MB gacha</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Compact Horizontal Analysis Settings Row & Analyze Button */}
      <div className="p-3 sm:p-4 rounded-xl bg-[#0B0F19] border border-[#1B2436] shadow-xl space-y-3">
        {/* Mode Selector Row (Avto is default and main mode) */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-[#182335] text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">Tahlil rejimi:</span>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 fill-current" />
              <span>Avto (Barcha 7 ta strategiya tekshiriladi)</span>
            </span>
            {selectedStrategyId !== 'auto' && (
              <span className="text-[11px] text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                Qo'lda majburlangan: {TRADING_STRATEGIES.find((s) => s.id === selectedStrategyId)?.uzbekName}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowManualStrategies(!showManualStrategies)}
            className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors py-1 px-2 rounded hover:bg-[#131A28]"
          >
            <span>Qo'lda tanlash</span>
            {showManualStrategies ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Collapsed Manual Strategy Chips (hidden by default) */}
        {showManualStrategies && (
          <div className="p-3 rounded-lg bg-[#0E1522] border border-[#1E293B] space-y-2">
            <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
              <span>Aniq bitta strategiyani majburlash (yoki Avto rejimda qoldiring):</span>
              {selectedStrategyId !== 'auto' && (
                <button
                  type="button"
                  onClick={() => setSelectedStrategyId('auto')}
                  className="text-emerald-400 hover:underline text-[10px]"
                >
                  Avto rejimga qaytarish
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedStrategyId('auto')}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                  selectedStrategyId === 'auto'
                    ? 'bg-emerald-500 text-[#07090E] shadow-sm'
                    : 'bg-[#121927] text-slate-400 hover:text-white border border-[#202D44]'
                }`}
              >
                ⚡ Avto (Tavsiya etiladi)
              </button>
              {TRADING_STRATEGIES.map((strat) => (
                <button
                  key={strat.id}
                  type="button"
                  onClick={() => setSelectedStrategyId(strat.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all ${
                    selectedStrategyId === strat.id
                      ? 'bg-sky-500 text-white font-bold shadow-sm'
                      : 'bg-[#121927] text-slate-400 hover:text-white border border-[#202D44]'
                  }`}
                >
                  {strat.uzbekName}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          {/* Symbol Selector */}
          <div className="flex items-center gap-2 bg-[#0E1522] border border-[#1E293B] rounded-lg px-3 py-2 shrink-0">
            <span className="text-[11px] font-mono text-slate-400 uppercase">Symbol:</span>
            <select
              value={symbol}
              onChange={(e) => {
                setSymbol(e.target.value);
                persistSession({ symbol: e.target.value });
              }}
              className="bg-transparent text-white font-mono font-bold text-xs focus:outline-none cursor-pointer"
            >
              {symbolsList.map((s) => (
                <option key={s} value={s} className="bg-[#0E1522] text-white">
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Timeframe Selector */}
          <div className="flex items-center gap-2 bg-[#0E1522] border border-[#1E293B] rounded-lg px-3 py-2 shrink-0">
            <span className="text-[11px] font-mono text-slate-400 uppercase">TF:</span>
            <select
              value={timeframe}
              onChange={(e) => {
                const newTf = e.target.value as Timeframe;
                setTimeframe(newTf);
                persistSession({ timeframe: newTf });
              }}
              className="bg-transparent text-emerald-400 font-mono font-bold text-xs focus:outline-none cursor-pointer"
            >
              {timeframesList.map((tf) => (
                <option key={tf} value={tf} className="bg-[#0E1522] text-white">
                  {tf}
                </option>
              ))}
            </select>
          </div>

          {/* Optional Notes Input */}
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                persistSession({ notes: e.target.value });
              }}
              placeholder="Ixtiyoriy izoh (masalan, 4h talab zonasi, RSI divergensiyasi)..."
              className="w-full bg-[#0E1522] border border-[#1E293B] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Prominent Analyze Chart Button */}
          <button
            onClick={triggerAnalysis}
            disabled={isAnalyzing}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shrink-0 ${
              isAnalyzing
                ? 'bg-[#151E2E] text-slate-400 cursor-not-allowed'
                : 'bg-emerald-500 hover:bg-emerald-400 text-[#07090E] shadow-emerald-500/20 active:scale-[0.98]'
            }`}
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                <span>Tahlil qilinmoqda...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 fill-current" />
                <span>Grafikni tahlil qilish</span>
              </>
            )}
          </button>
        </div>

        {/* User's Existing Active Position Row (Optional) */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1 text-xs font-mono">
          <span className="text-[11px] text-slate-400">Ochiq bitimingiz bormi:</span>
          <div className="flex items-center gap-1 bg-[#0E1522] border border-[#1E293B] rounded-lg p-0.5">
            {(['NONE', 'BUY', 'SELL'] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => setMyActivePosition(side)}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                  myActivePosition === side
                    ? side === 'BUY'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : side === 'SELL'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                      : 'bg-slate-700 text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {side === 'NONE' ? "Yo'q" : side === 'BUY' ? '🟢 BUY ochganman' : '🔴 SELL ochganman'}
              </button>
            ))}
          </div>

          {myActivePosition !== 'NONE' && (
            <div className="flex items-center gap-1.5 bg-[#0E1522] border border-[#1E293B] rounded-lg px-2.5 py-1">
              <span className="text-[11px] text-slate-400">Kirish narxi:</span>
              <span className="text-slate-500 text-xs">$</span>
              <input
                type="number"
                placeholder="masalan, 60500"
                value={myEntryPrice}
                onChange={(e) => setMyEntryPrice(e.target.value)}
                className="w-28 bg-transparent text-emerald-400 font-bold text-xs focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Quick User Balance & Risk Setting */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-[#182335] text-xs font-mono">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-slate-300">
              <Wallet className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[11px] text-slate-400">Balans:</span>
            </div>
            <div className="flex items-center bg-[#090D16] border border-[#1E293B] rounded-lg px-2 py-1 text-white font-bold text-xs">
              <span className="text-slate-500 mr-1">$</span>
              <input
                type="number"
                min="1"
                value={userBalance}
                onChange={(e) => handleUpdateBalance(parseFloat(e.target.value) || 0)}
                className="w-24 bg-transparent text-sky-400 font-bold focus:outline-none"
              />
            </div>
            <div className="hidden sm:flex items-center gap-1">
              {[500, 1000, 5000, 10000].map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => handleUpdateBalance(b)}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                    userBalance === b
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 font-bold'
                      : 'bg-[#0E1524] text-slate-400 hover:text-white border border-[#1A2538]'
                  }`}
                >
                  ${b >= 1000 ? `${b / 1000}k` : b}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[11px]">Xavf (Risk):</span>
            <div className="flex items-center gap-1">
              {[0.5, 1.0, 2.0, 3.0].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => handleUpdateRisk(r)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                    riskPercent === r
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                      : 'bg-[#0E1524] text-slate-400 hover:text-white border border-[#1A2538]'
                  }`}
                >
                  {r}%
                </button>
              ))}
            </div>
            <span className="text-slate-500 text-[10px]">(${riskAmountUsd.toFixed(1)})</span>
          </div>
        </div>

        {/* Live Circular Multi-stage Processing Indicator */}
        {isAnalyzing && (
          <div className="p-6 rounded-2xl bg-[#090D15] border border-emerald-500/30 flex flex-col items-center justify-center space-y-4 shadow-2xl">
            <div className="relative w-32 h-32 flex items-center justify-center">
              {/* Outer static ring */}
              <svg className="w-full h-full text-emerald-500/20" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="6" />
              </svg>
              {/* Spinning animated arc */}
              <svg className="absolute inset-0 w-full h-full -rotate-90 animate-[spin_2s_linear_infinite]" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke="#00F0A8"
                  strokeWidth="6"
                  strokeDasharray="180"
                  strokeDashoffset="60"
                  strokeLinecap="round"
                />
              </svg>
              {/* Center progress info */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2">
                <Brain className="w-6 h-6 text-emerald-400 animate-pulse mb-1" />
                <span className="text-[10px] font-mono font-bold text-white uppercase tracking-wider">
                  {analysisStep}
                </span>
              </div>
            </div>

            <div className="text-center space-y-1 font-mono">
              <div className="text-sm font-bold text-emerald-400 flex items-center justify-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>{analysisStep}</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Barcha strategiyalar sinovdan o'tkazilmoqda va narx shkalasi mustaqil auditor tomonidan tekshirilmoqda
              </p>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {errorMsg && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* 4. AI Analysis Results Directly Below */}
      {analysisResult && (
        <div id="analysis-results-section" className="space-y-5 pt-2">
          {/* Header Card: Symbol, Scenario, Confidence Score & Action CTA */}
          <div className="p-6 rounded-2xl bg-[#090D15] border border-[#1B2436] space-y-5 shadow-2xl relative overflow-hidden">
            <div
              className={`absolute -top-32 -right-32 w-80 h-80 rounded-full blur-3xl pointer-events-none opacity-20 ${
                analysisResult.marketDirection === 'Bullish'
                  ? 'bg-emerald-500'
                  : analysisResult.marketDirection === 'Bearish'
                  ? 'bg-rose-500'
                  : 'bg-amber-500'
              }`}
            />

            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1B2436] pb-4">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xl font-extrabold text-white">
                  {analysisResult.symbol}
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#131A28] text-slate-300 border border-[#202C40]">
                  {analysisResult.timeframe}
                </span>

                {/* Scenario Pill */}
                <div
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    analysisResult.signal === 'BUY' || (analysisResult.marketDirection === 'Bullish' && analysisResult.signal !== 'WAIT')
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : analysisResult.signal === 'SELL' || (analysisResult.marketDirection === 'Bearish' && analysisResult.signal !== 'WAIT')
                      ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {analysisResult.signal === 'BUY' ? (
                    <TrendingUp className="w-3.5 h-3.5" />
                  ) : analysisResult.signal === 'SELL' ? (
                    <TrendingDown className="w-3.5 h-3.5" />
                  ) : (
                    <Minus className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {analysisResult.signal === 'BUY'
                      ? 'BUY Ssenariy'
                      : analysisResult.signal === 'SELL'
                      ? 'SELL Ssenariy'
                      : 'KUTISH / PULLBACK REJA'}
                  </span>
                </div>
              </div>

              {/* Confidence Score Pill & Actions */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-[#0E1522] border border-[#1E293B] px-3 py-1.5 rounded-lg">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">Ishonch</div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-12 bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          analysisResult.confidenceScore > 75
                            ? 'bg-emerald-400'
                            : analysisResult.confidenceScore > 55
                            ? 'bg-amber-400'
                            : 'bg-rose-400'
                        }`}
                        style={{ width: `${analysisResult.confidenceScore}%` }}
                      />
                    </div>
                    <span className="font-mono font-bold text-xs text-white">
                      {analysisResult.confidenceScore}%
                    </span>
                  </div>
                </div>

                <button
                  onClick={copySetupToClipboard}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#121927] hover:bg-[#1A2336] text-slate-300 border border-[#202D44] text-xs font-mono transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Nusxalandi' : 'Nusxa olish'}</span>
                </button>

                {onOpenPaperTrade && (
                  <button
                    onClick={() => onOpenPaperTrade(analysisResult)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#07090E] font-bold text-xs tracking-wide shadow-sm shadow-emerald-500/20 transition-all"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Virtual savdo</span>
                  </button>
                )}
              </div>
            </div>

            {/* Context Summary */}
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              {analysisResult.chartContext}
            </p>

            {/* AI Chart Read Verification Bar */}
            {analysisResult.chartReadData && (
              <div className="p-3.5 rounded-xl bg-[#090D15] border border-[#1E293B] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-center gap-2 text-slate-400 font-bold">
                  <FileImage className="w-4 h-4 text-sky-400" />
                  <span>Grafikdan o'qilgan aniq parametrlar:</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-slate-300 text-[11px]">
                  <span>Aktiv: <strong className="text-white">{analysisResult.chartReadData.symbol}</strong></span>
                  <span>TF: <strong className="text-white">{analysisResult.chartReadData.timeframe}</strong></span>
                  {analysisResult.chartReadData.lastVisiblePrice > 0 && (
                    <span>So'nggi narx: <strong className="text-emerald-400">${analysisResult.chartReadData.lastVisiblePrice}</strong></span>
                  )}
                  {analysisResult.chartReadData.visiblePriceRange?.min > 0 && (
                    <span>Shkala: <strong className="text-sky-400">${analysisResult.chartReadData.visiblePriceRange.min} - ${analysisResult.chartReadData.visiblePriceRange.max}</strong></span>
                  )}
                  <span>Trend: <strong className="text-amber-400">{analysisResult.chartReadData.trendDirection}</strong></span>
                  {analysisResult.entryType && (
                    <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/30 font-bold">
                      {analysisResult.entryType}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Chosen Strategy Details Card */}
            {analysisResult.chosenStrategy && (
              <div className="p-4 rounded-xl bg-[#0E1522] border border-[#1E293B] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B] pb-2.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-mono text-slate-400 uppercase">Tanlangan strategiya:</span>
                    <span className="font-mono text-sm font-bold text-emerald-400">
                      {analysisResult.chosenStrategy.strategyName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-slate-400">Moslik balli:</span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {analysisResult.chosenStrategy.score} / 100
                    </span>
                  </div>
                </div>

                {/* Strategy Checklist with Green Check / Red Minus */}
                <div className="space-y-2">
                  <span className="text-[11px] font-mono text-slate-400 uppercase block font-bold">
                    Strategiya tekshiruv shartlari (Checklist):
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                    {analysisResult.chosenStrategy.conditionsMet?.map((cond, i) => (
                      <div
                        key={`met-${i}`}
                        className="flex items-start gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                      >
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">{cond}</span>
                      </div>
                    ))}
                    {analysisResult.chosenStrategy.conditionsNotMet?.map((cond, i) => (
                      <div
                        key={`not-${i}`}
                        className="flex items-start gap-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300"
                      >
                        <Minus className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <span className="leading-snug">{cond}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Collapsed Other Strategies Evaluated List */}
            {analysisResult.allStrategyScores && analysisResult.allStrategyScores.length > 0 && (
              <div className="border border-[#1B2538] rounded-xl overflow-hidden bg-[#0A0E17]">
                <button
                  type="button"
                  onClick={() => setShowAllStrategiesList(!showAllStrategiesList)}
                  className="w-full px-4 py-3 flex items-center justify-between text-xs font-mono font-bold text-slate-300 hover:text-white hover:bg-[#0E1522] transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-emerald-400" />
                    <span>Boshqa strategiyalar baholash ro'yxati ({analysisResult.allStrategyScores.length} ta tekshirildi)</span>
                  </span>
                  {showAllStrategiesList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showAllStrategiesList && (
                  <div className="p-4 border-t border-[#1B2538] space-y-2">
                    <p className="text-[11px] font-mono text-slate-400 pb-1">
                      Nima sababdan boshqa strategiyalar tanlanmaganini ko'rish:
                    </p>
                    {analysisResult.allStrategyScores.map((strat) => (
                      <div
                        key={strat.strategyId}
                        className={`p-3 rounded-lg border flex flex-wrap items-center justify-between gap-3 text-xs font-mono transition-colors ${
                          strat.strategyId === analysisResult.chosenStrategy?.strategyId
                            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                            : 'bg-[#0E1522] border-[#1E293B] text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="font-bold text-white">{strat.strategyName}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              strat.direction === 'BUY'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : strat.direction === 'SELL'
                                ? 'bg-rose-500/20 text-rose-400'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {strat.direction.toUpperCase()}
                          </span>
                          {strat.avoidApplies && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-500/20 text-rose-400 border border-rose-500/40">
                              Cheklov bor
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400 text-[11px] max-w-md truncate">{strat.reason}</span>
                          <span
                            className={`px-2.5 py-0.5 rounded font-bold text-xs ${
                              strat.score >= 70
                                ? 'text-emerald-400 bg-emerald-500/15'
                                : strat.score >= 50
                                ? 'text-amber-400 bg-amber-500/15'
                                : 'text-slate-500 bg-slate-800'
                            }`}
                          >
                            {strat.score} ball
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Independent Auditor Verification Banner (Step 4) */}
            {analysisResult.verification && analysisResult.verification.problems && analysisResult.verification.problems.length > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <div className="space-y-1">
                  <strong className="block text-amber-200">Mustaqil Auditor Tekshiruvi:</strong>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-300">
                    {analysisResult.verification.problems.map((prob, i) => (
                      <li key={i}>{prob}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Active Open Trade Advice Box (if user has open position on chart or input) */}
            {analysisResult.activeTradeAdvice && analysisResult.activeTradeAdvice.detected && (
              <div
                className={`p-4 rounded-xl border space-y-2.5 transition-all ${
                  analysisResult.activeTradeAdvice.action === 'CLOSE_EARLY'
                    ? 'bg-rose-500/10 border-rose-500/40 text-rose-200'
                    : analysisResult.activeTradeAdvice.action === 'MOVE_SL_BREAKEVEN'
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                    : analysisResult.activeTradeAdvice.action === 'TAKE_PROFIT'
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                    : 'bg-sky-500/10 border-sky-500/40 text-sky-200'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldAlert
                      className={`w-4 h-4 shrink-0 ${
                        analysisResult.activeTradeAdvice.action === 'CLOSE_EARLY'
                          ? 'text-rose-400'
                          : analysisResult.activeTradeAdvice.action === 'MOVE_SL_BREAKEVEN'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    />
                    <span className="font-mono text-xs font-bold tracking-wide uppercase">
                      Sizning Ochiq Bitimingiz: {analysisResult.activeTradeAdvice.side}
                    </span>
                    {analysisResult.activeTradeAdvice.entryPrice && (
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-black/40 border border-white/10 font-bold">
                        Kirish: ${analysisResult.activeTradeAdvice.entryPrice}
                      </span>
                    )}
                    {analysisResult.activeTradeAdvice.status && (
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-white/10 opacity-80">
                        {analysisResult.activeTradeAdvice.status}
                      </span>
                    )}
                  </div>

                  <span className="px-2.5 py-1 rounded text-[11px] font-mono font-bold uppercase tracking-wider bg-black/60 border border-current shadow-sm">
                    {analysisResult.activeTradeAdvice.action === 'CLOSE_EARLY'
                      ? '⚠️ ZARARNI QISQARTIRIB CHIQISH TAVSIYA ETILADI'
                      : analysisResult.activeTradeAdvice.action === 'MOVE_SL_BREAKEVEN'
                      ? '🛡️ STOP-LOSSNI KIRISHGA (BREAKEVEN) SURING'
                      : analysisResult.activeTradeAdvice.action === 'TAKE_PROFIT'
                      ? '🎯 FOYDANI QAYD QILING (TAKE PROFIT)'
                      : '✊ POZITSIYANI USHLAB TURING (HOLD)'}
                  </span>
                </div>

                <p className="text-xs font-sans leading-relaxed text-slate-100 bg-black/20 p-2.5 rounded-lg border border-white/5">
                  {analysisResult.activeTradeAdvice.advice}
                </p>
              </div>
            )}

            {/* Simulated Setup Parameters (Hypothetical & Educational) */}
            <div className="p-4 rounded-xl bg-[#0D131F] border border-[#1E293B] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-mono uppercase tracking-wider text-slate-200 font-bold">
                    Gipotetik Simulyatsiya Stsenariyi
                  </span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                  FAQAT TA'LIMIY SIMULYATSIYA
                </span>
              </div>

              {/* If WAIT, show helpful strategy note above the levels */}
              {analysisResult.signal === 'WAIT' && analysisResult.waitFor && (
                <div className="p-3 rounded-lg bg-[#121927] border border-amber-500/30 flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold uppercase text-[10px] tracking-wider">
                      KUTISH REJASI
                    </span>
                    <span className="text-slate-200">{analysisResult.waitFor}</span>
                  </div>
                </div>
              )}

              {/* 4 Level Boxes ALWAYS rendered with asset-aware decimals */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
                <div className="p-3 rounded-lg bg-[#121A2A] border border-[#1E2A3E]">
                  <div className="text-[10px] text-slate-400 uppercase">Kirish zonasi</div>
                  <div className="text-sm font-bold text-sky-400 mt-0.5">
                    {formatAssetPrice(analysisResult.entryZone.optimal, analysisResult.symbol)}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">
                    {formatAssetPrice(analysisResult.entryZone.min, analysisResult.symbol)} - {formatAssetPrice(analysisResult.entryZone.max, analysisResult.symbol)}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#121A2A] border border-[#1E2A3E]">
                  <div className="text-[10px] text-slate-400 uppercase flex items-center justify-between">
                    <span>Stop Loss (SL)</span>
                    <span className="text-rose-400 font-bold">-{riskPercent}%</span>
                  </div>
                  <div className="text-sm font-bold text-rose-400 mt-0.5">
                    {formatAssetPrice(analysisResult.stopLoss, analysisResult.symbol)}
                  </div>
                  <div className="text-[10px] text-rose-400/90 font-bold">
                    -${riskAmountUsd.toFixed(2)}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#121A2A] border border-[#1E2A3E]">
                  <div className="text-[10px] text-slate-400 uppercase flex items-center justify-between">
                    <span>Take Profit (TP)</span>
                    <span className="text-emerald-400 font-bold">+{(riskPercent * customRR).toFixed(1)}%</span>
                  </div>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">
                    {formatAssetPrice(calculatedTargetTP, analysisResult.symbol)}
                  </div>
                  <div className="text-[10px] text-emerald-400/90 font-bold">
                    +${profitAtTargetTP.toFixed(2)}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-[#121A2A] border border-[#1E2A3E]">
                  <div className="text-[10px] text-slate-400 uppercase">Risk : Reward</div>
                  <div className="text-sm font-bold text-emerald-400 mt-0.5">
                    1 : {customRR}
                  </div>
                  <div className="text-[10px] font-semibold text-emerald-400">
                    Balansga mos ✓
                  </div>
                </div>
              </div>

              {/* Money Management & Position Sizing Calculator */}
              <div className="p-4 rounded-xl bg-[#090E17] border border-[#223049] space-y-3 font-mono">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#1A2538]">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs uppercase tracking-wider text-white font-bold">
                      Balans & Risk Kalkulyatori
                    </span>
                  </div>
                  {balanceSavedNotice && (
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">
                      Balans saqlandi ✓
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400">
                    Balansingizga moslashtirilgan TP / SL
                  </span>
                </div>

                {/* Balance & Risk Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Balance Input & Quick Select */}
                  <div className="space-y-1.5 p-2.5 rounded-lg bg-[#0E1524] border border-[#182338]">
                    <div className="flex items-center justify-between text-[11px] text-slate-300">
                      <span>Sizning Balansingiz:</span>
                      <span className="text-sky-400 font-bold">${userBalance.toLocaleString()}</span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-400 font-bold">$</span>
                      <input
                        type="number"
                        min="1"
                        value={userBalance}
                        onChange={(e) => handleUpdateBalance(parseFloat(e.target.value) || 0)}
                        className="w-full pl-7 pr-3 py-1.5 bg-[#070B12] border border-[#202E46] rounded-lg text-white font-bold focus:outline-none focus:border-sky-500 text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      {[500, 1000, 5000, 10000, 25000].map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => handleUpdateBalance(b)}
                          className={`flex-1 py-1 rounded text-[10px] transition-colors ${
                            userBalance === b
                              ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 font-bold'
                              : 'bg-[#131D30] text-slate-400 hover:text-white border border-[#1F2C44]'
                          }`}
                        >
                          ${b >= 1000 ? `${b / 1000}k` : b}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Risk % Selector */}
                  <div className="space-y-1.5 p-2.5 rounded-lg bg-[#0E1524] border border-[#182338]">
                    <div className="flex items-center justify-between text-[11px] text-slate-300">
                      <span>Bitimdagi Xavf (Risk %):</span>
                      <span className="text-rose-400 font-bold">
                        ${riskAmountUsd.toFixed(2)} ({riskPercent}%)
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[0.5, 1.0, 2.0, 3.0].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => handleUpdateRisk(r)}
                          className={`flex-1 py-1.5 rounded text-xs transition-colors font-bold ${
                            riskPercent === r
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                              : 'bg-[#131D30] text-slate-400 hover:text-white border border-[#1F2C44]'
                          }`}
                        >
                          {r}%
                        </button>
                      ))}
                    </div>
                    <div className="text-[10px] text-slate-400 pt-0.5">
                      Stop Loss urilsa yo'qotish: <strong className="text-rose-400">-${riskAmountUsd.toFixed(2)}</strong> (balansning {riskPercent}%i)
                    </div>
                  </div>
                </div>

                {/* Target R:R (Take Profit Multiplier) */}
                <div className="p-2.5 rounded-lg bg-[#0E1524] border border-[#182338]">
                  <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1.5">
                    <span>Take Profit Maqsadi (Risk : Reward):</span>
                    <span className="text-emerald-400 font-bold">1 : {customRR} (Daromad: +${profitAtTargetTP.toFixed(2)})</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[1.5, 2.0, 2.5, 3.0, 4.0].map((ratio) => (
                      <button
                        key={ratio}
                        type="button"
                        onClick={() => setCustomRR(ratio)}
                        className={`py-1.5 rounded text-[11px] font-bold transition-all ${
                          customRR === ratio
                            ? 'bg-emerald-500 text-[#07090E] shadow-sm shadow-emerald-500/30'
                            : 'bg-[#131D30] text-slate-300 hover:bg-[#1A2740] border border-[#1F2C44]'
                        }`}
                      >
                        1:{ratio}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Computed Trade Metrics Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                  {/* Suggested Position Size */}
                  <div className="p-3 rounded-lg bg-[#0E1524] border border-[#1E2B42]">
                    <div className="text-[10px] text-slate-400 uppercase">Tavsiya etilgan Hajm</div>
                    <div className="text-base font-bold text-sky-400 mt-0.5">
                      ${positionSizeUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      ≈ {positionQuantity.toFixed(4)} {analysisResult.symbol.split('/')[0]}
                    </div>
                  </div>

                  {/* Stop Loss Outcome */}
                  <div className="p-3 rounded-lg bg-[#0E1524] border border-rose-500/30">
                    <div className="text-[10px] text-slate-400 uppercase flex items-center justify-between">
                      <span>Stop Loss (SL)</span>
                      <span className="text-rose-400 font-bold">-{riskPercent}%</span>
                    </div>
                    <div className="text-base font-bold text-rose-400 mt-0.5">
                      -${riskAmountUsd.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Qoladigan balans: ${(userBalance - riskAmountUsd).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </div>
                  </div>

                  {/* Take Profit Outcome */}
                  <div className="p-3 rounded-lg bg-[#0E1524] border border-emerald-500/30">
                    <div className="text-[10px] text-slate-400 uppercase flex items-center justify-between">
                      <span>Take Profit (TP)</span>
                      <span className="text-emerald-400 font-bold">+{(riskPercent * customRR).toFixed(1)}%</span>
                    </div>
                    <div className="text-base font-bold text-emerald-400 mt-0.5">
                      +${profitAtTargetTP.toFixed(2)}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Yangi balans: ${(userBalance + profitAtTargetTP).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>

                {/* Direct Action: Open in Virtual Trade with Computed Values */}
                {onOpenPaperTrade && (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenPaperTrade({
                        ...analysisResult,
                        stopLoss: originalSL,
                        takeProfit1: Number(calculatedTargetTP.toFixed(5)),
                        riskRewardRatio: customRR,
                        customPositionSize: Number(positionSizeUsd.toFixed(2)),
                        customRiskAmount: Number(riskAmountUsd.toFixed(2)),
                        customExpectedProfit: Number(profitAtTargetTP.toFixed(2)),
                        customExpectedLoss: Number(lossAtSL.toFixed(2)),
                      })
                    }
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-[#07090E] font-bold text-xs tracking-wide shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Ushbu Balans va TP/SL bilan Virtual Savdo Ochish</span>
                  </button>
                )}
              </div>

              {/* Confidence and Invalidation Line under the levels */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2.5 border-t border-[#1E293B] text-[11px] font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Ishonch:</span>
                  <span className="text-emerald-400 font-bold">{analysisResult.confidenceScore}%</span>
                </div>
                {analysisResult.invalidationCriteria && (
                  <div className="text-slate-300">
                    <span className="text-rose-400 font-semibold">Bekor bo'lish (Invalidation): </span>
                    <span className="text-slate-400">{analysisResult.invalidationCriteria}</span>
                  </div>
                )}
              </div>

              {/* Small Muted Note */}
              <div className="text-[11px] text-slate-500 font-mono pt-1">
                AI skrinshotdan taxmin qiladi. Demo hisobda sinab ko'ring va xavfni 1% dan oshirmang.
              </div>
            </div>

            {/* Core Technical Pillars Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {/* Market Structure */}
              <div className="p-3.5 rounded-xl bg-[#0E1522] border border-[#1B2538] space-y-1.5">
                <div className="font-mono text-[10px] text-slate-400 uppercase flex items-center justify-between">
                  <span>Bozor Strukturasi</span>
                  <span className="text-emerald-400 font-bold">BOS / CHOCH</span>
                </div>
                <div className="text-slate-200 font-medium leading-relaxed">
                  {analysisResult.marketStructure}
                </div>
              </div>

              {/* Trend Direction */}
              <div className="p-3.5 rounded-xl bg-[#0E1522] border border-[#1B2538] space-y-1.5">
                <div className="font-mono text-[10px] text-slate-400 uppercase flex items-center justify-between">
                  <span>Trend Yo'nalishi & Rejimi</span>
                  <span className="text-sky-400 font-bold">{analysisResult.marketDirection}</span>
                </div>
                <div className="text-slate-200 font-medium leading-relaxed">
                  {analysisResult.trendAnalysis}
                </div>
              </div>

              {/* Support & Resistance */}
              <div className="p-3.5 rounded-xl bg-[#0E1522] border border-[#1B2538] space-y-1.5">
                <div className="font-mono text-[10px] text-slate-400 uppercase">Qo'llab-quvvatlash & Qarshilik Zonalari</div>
                <div className="space-y-1 font-mono text-[11px]">
                  <div className="text-emerald-400">
                    <span className="text-slate-500 mr-1.5">Qo'llab-quvvatlash:</span>
                    {analysisResult.supportLevels.length > 0
                      ? analysisResult.supportLevels.map((s) => formatAssetPrice(s, analysisResult.symbol)).join(', ')
                      : 'Aniqlanmadi'}
                  </div>
                  <div className="text-rose-400">
                    <span className="text-slate-500 mr-1.5">Qarshilik:</span>
                    {analysisResult.resistanceLevels.length > 0
                      ? analysisResult.resistanceLevels.map((r) => formatAssetPrice(r, analysisResult.symbol)).join(', ')
                      : 'Aniqlanmadi'}
                  </div>
                </div>
              </div>

              {/* Liquidity Observations */}
              <div className="p-3.5 rounded-xl bg-[#0E1522] border border-[#1B2538] space-y-1.5">
                <div className="font-mono text-[10px] text-slate-400 uppercase">Likvidlik Kuzatuvlari</div>
                <div className="text-slate-200 font-medium leading-relaxed">
                  {analysisResult.liquidityAnalysis}
                </div>
              </div>
            </div>

            {/* Technical Indicators Bar */}
            <div className="p-3.5 rounded-xl bg-[#0E1522] border border-[#1B2538] space-y-2">
              <div className="font-mono text-[10px] text-slate-400 uppercase flex items-center justify-between">
                <span>Tasdiqlangan Texnik Indikatorlar</span>
                <span className="text-slate-500 text-[10px]">Soxta indikatorlar yo'q</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-mono">
                <div className="bg-[#121A2A] p-2 rounded-lg border border-[#1D283A]">
                  <span className="text-slate-500 block text-[10px]">RSI (14)</span>
                  <span className="text-slate-200 font-semibold">
                    {analysisResult.technicalIndicators.rsi?.calculated
                      ? `${analysisResult.technicalIndicators.rsi.value} • ${analysisResult.technicalIndicators.rsi.signal}`
                      : 'Ma\'lumotda yo\'q / hisoblanmagan'}
                  </span>
                </div>
                <div className="bg-[#121A2A] p-2 rounded-lg border border-[#1D283A]">
                  <span className="text-slate-500 block text-[10px]">MACD (12, 26, 9)</span>
                  <span className="text-slate-200 font-semibold">
                    {analysisResult.technicalIndicators.macd?.calculated
                      ? `${analysisResult.technicalIndicators.macd.trend}`
                      : 'Ma\'lumotda yo\'q / hisoblanmagan'}
                  </span>
                </div>
                <div className="bg-[#121A2A] p-2 rounded-lg border border-[#1D283A]">
                  <span className="text-slate-500 block text-[10px]">Ko'chuvchi o'rtachalar</span>
                  <span className="text-slate-200 font-semibold">
                    {analysisResult.technicalIndicators.emas?.calculated
                      ? `${analysisResult.technicalIndicators.emas.alignment}`
                      : 'EMAlar hisoblanmagan'}
                  </span>
                </div>
              </div>
            </div>

            {/* Expandable Section 1: Confluence Rationale */}
            <div className="border border-[#1B2538] rounded-xl overflow-hidden bg-[#0A0E17]">
              <button
                type="button"
                onClick={() => setExpandConfluence(!expandConfluence)}
                className="w-full flex items-center justify-between p-3.5 text-left text-xs font-mono font-bold text-slate-300 hover:text-white transition-colors"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>KONFLUENS ASOSLARI ({analysisResult.analysisReasons.length} OMIL)</span>
                </div>
                {expandConfluence ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {expandConfluence && (
                <div className="px-4 pb-4 space-y-2 border-t border-[#172233] pt-3">
                  {analysisResult.analysisReasons.map((reason, idx) => (
                    <div
                      key={idx}
                      className="text-xs text-slate-300 flex items-start gap-2.5 bg-[#0E1522] p-2.5 rounded-lg border border-[#1B2538]"
                    >
                      <span className="text-emerald-400 font-mono font-bold mt-0.5">{idx + 1}.</span>
                      <span className="leading-relaxed">{reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Expandable Section 2: Scenario Invalidation Criteria */}
            <div className="border border-rose-500/20 rounded-xl overflow-hidden bg-rose-500/5">
              <button
                type="button"
                onClick={() => setExpandInvalidation(!expandInvalidation)}
                className="w-full flex items-center justify-between p-3.5 text-left text-xs font-mono font-bold text-rose-400 hover:text-rose-300 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4" />
                  <span>STSENARIY BEKOR BO'LISH CHEGARALARI</span>
                </div>
                {expandInvalidation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {expandInvalidation && (
                <div className="px-4 pb-4 border-t border-rose-500/20 pt-3">
                  <p className="text-xs text-rose-200/90 leading-relaxed">
                    {analysisResult.invalidationCriteria}
                  </p>
                </div>
              )}
            </div>

            {/* Expandable Section 3: Uncertainty & Limitations */}
            <div className="border border-[#1B2538] rounded-xl overflow-hidden bg-[#0A0E17]">
              <button
                type="button"
                onClick={() => setExpandLimitations(!expandLimitations)}
                className="w-full flex items-center justify-between p-3.5 text-left text-xs font-mono font-bold text-slate-400 hover:text-slate-200 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-amber-400" />
                  <span>ISHONCH BAHOLASH METODOLOGIYASI & NOANIQLIK</span>
                </div>
                {expandLimitations ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {expandLimitations && (
                <div className="px-4 pb-4 space-y-2 border-t border-[#172233] pt-3 text-xs font-mono text-slate-400 leading-relaxed">
                  <p>
                    <strong className="text-slate-300">Baholash metodologiyasi:</strong>{' '}
                    {analysisResult.confidenceExplanation}
                  </p>
                  <p>
                    <strong className="text-slate-300">Cheklovlar:</strong> Bozor sharoitlari, geosiyosiy shoklar va likvidlik bo'shliqlari texnik naqshlarni bekor qilishi mumkin. Ishonch ballari texnik muvofiqlik sifatini ko'rsatadi, moliyaviy daromad ehtimolini emas.
                  </p>
                </div>
              )}
            </div>

            {/* Regulatory Disclaimer */}
            <div className="text-[11px] text-slate-500 font-mono border-t border-[#1B2436] pt-3.5 leading-relaxed">
              ⚠️ ESLATMA: Barcha AI tahlillari, bozor strukturasi aniqlashlari va simulyatsiya stsenariylari faqat tadqiqot va sinov uchun ta'limiy simulyatsiyadir. TRADEIQ shaxsiy moliyaviy, investitsion yoki brokerlik maslahatlarini bermaydi.
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════
              FOLLOW-UP CHAT SECTION
          ════════════════════════════════════════════════════════════ */}
          <div className="max-w-[780px] mx-auto mt-12 space-y-4">
            {/* Chat Header */}
            <div className="flex items-center gap-2 pb-1">
              <MessageCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider">
                AI bilan suhbat
              </span>
              <span className="text-[10px] font-mono text-slate-500 ml-1">
                — bu grafik haqida savol bering
              </span>
            </div>

            {/* Message List */}
            <div className="space-y-6">
              {chatMessages.map((msg, i) =>
                msg.role === 'user' ? (
                  /* ── USER BUBBLE ── */
                  <div key={i} className="flex justify-end">
                    <div
                      className="max-w-[300px] bg-[#1a2321] border border-[#2b3835] p-3"
                      style={{ borderRadius: '22px 22px 6px 22px' }}
                    >
                      {msg.imageUrl && (
                        <img
                          src={msg.imageUrl}
                          alt="yuklangan grafik"
                          className="w-full rounded-xl object-contain mb-1.5"
                          style={{ maxWidth: 276 }}
                        />
                      )}
                      {msg.text && (
                        <p className="text-xs text-slate-200 font-mono leading-relaxed">{msg.text}</p>
                      )}
                      {msg.fileName && (
                        <p className="text-[11px] text-slate-500 mt-1 truncate">{msg.fileName}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  /* ── AI BUBBLE ── */
                  <div key={i} className="flex justify-start">
                    <div
                      className="max-w-[600px] bg-[#121918] border border-[#2b3835] p-6"
                      style={{ borderRadius: '22px 22px 22px 6px' }}
                    >
                      {msg.isTyping ? (
                        <span className="text-slate-400 font-mono text-sm animate-pulse">...</span>
                      ) : i === 1 && analysisResult ? (
                        /* Second message: BUY / SELL / KUTING + level boxes or WAIT note */
                        <div className="space-y-3">
                          <div
                            className={`text-2xl font-extrabold tracking-widest ${
                              analysisResult.marketDirection === 'Bullish' && analysisResult.signal === 'BUY'
                                ? 'text-emerald-400'
                                : analysisResult.marketDirection === 'Bearish' && analysisResult.signal === 'SELL'
                                ? 'text-rose-400'
                                : 'text-amber-400'
                            }`}
                          >
                            {analysisResult.signal === 'BUY'
                              ? 'BUY'
                              : analysisResult.signal === 'SELL'
                              ? 'SELL'
                              : 'KUTING'}
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed font-mono">
                            {analysisResult.chartContext}
                          </p>

                          <div className="grid grid-cols-2 gap-2">
                            {[
                              {
                                label: 'Kirish',
                                value: formatAssetPrice(analysisResult.entryZone.optimal, analysisResult.symbol),
                                color: 'text-sky-400',
                              },
                              {
                                label: 'Stop Loss',
                                value: formatAssetPrice(analysisResult.stopLoss, analysisResult.symbol),
                                color: 'text-rose-400',
                              },
                              {
                                label: 'TP1',
                                value: formatAssetPrice(analysisResult.takeProfit1, analysisResult.symbol),
                                color: 'text-emerald-400',
                              },
                              {
                                label: 'R:R',
                                value: `1:${analysisResult.riskRewardRatio}`,
                                color: 'text-white',
                              },
                            ].map(({ label, value, color }) => (
                              <div
                                key={label}
                                className="bg-[#0d1211] border border-[#2b3835] p-2.5"
                                style={{ borderRadius: 14 }}
                              >
                                <div className="text-[10px] text-slate-500 font-mono">{label}</div>
                                <div className={`text-sm font-bold font-mono ${color}`}>{value}</div>
                              </div>
                            ))}
                          </div>

                          {analysisResult.waitFor && (
                            <div className="bg-[#0d1211] border border-amber-500/30 p-2.5 rounded-[12px] text-xs font-mono">
                              <span className="text-amber-400 font-semibold mr-1">Reja:</span>
                              <span className="text-slate-200">{analysisResult.waitFor}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Later AI messages: plain text */
                        <p
                          className="text-slate-200 leading-[1.7] font-mono"
                          style={{ fontSize: 14 }}
                        >
                          {msg.text}
                        </p>
                      )}
                    </div>
                  </div>
                )
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Composer */}
            <div className="flex items-center gap-2 bg-[#121918] border border-[#2b3835] p-2" style={{ borderRadius: 999 }}>
              {/* Hidden file input for attaching new screenshot */}
              <input
                type="file"
                ref={chatAttachRef}
                accept="image/*"
                className="hidden"
                onChange={handleChatAttach}
              />

              {/* Paperclip / attach button */}
              <button
                type="button"
                onClick={() => chatAttachRef.current?.click()}
                title="Yangi skrinshot yuklash"
                className="w-12 h-12 rounded-full bg-[#1a2321] flex items-center justify-center text-amber-400 shrink-0 hover:bg-[#22312e] transition-colors"
              >
                <Paperclip className="w-5 h-5" />
              </button>

              {/* Text input */}
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSend();
                  }
                }}
                placeholder="Savol yozing yoki yangi skrinshot tashlang"
                className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 font-mono outline-none"
              />

              {/* Send button */}
              <button
                type="button"
                onClick={handleChatSend}
                disabled={isChatLoading || !chatInput.trim()}
                className="w-12 h-12 rounded-full bg-amber-500 hover:bg-amber-400 flex items-center justify-center text-black shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ArrowUp className="w-5 h-5" />
              </button>
            </div>

            <p className="text-[10px] text-slate-600 font-mono text-center pb-2">
              Suhbat tarixi faqat sessiya davomida saqlanadi • Darajalar faqat yangi skrinshot yuklanganda o'zgaradi
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
