-- ==============================================================================
-- TRADEIQ DATABASE SCHEMA (PostgreSQL / Supabase)
-- With Row Level Security (RLS) & Proper Policies
-- ==============================================================================

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USER SETTINGS
CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    theme TEXT DEFAULT 'dark',
    default_risk_percent NUMERIC(5, 2) DEFAULT 1.00,
    starting_balance NUMERIC(15, 2) DEFAULT 10000.00,
    current_balance NUMERIC(15, 2) DEFAULT 10000.00,
    preferred_currency TEXT DEFAULT 'USD',
    ai_provider TEXT DEFAULT 'gemini',
    custom_api_key TEXT,
    notifications_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. UPLOADED CHARTS
CREATE TABLE IF NOT EXISTS public.uploaded_charts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size INT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. ANALYSIS HISTORY
CREATE TABLE IF NOT EXISTS public.analysis_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    chart_image_url TEXT,
    chart_id UUID REFERENCES public.uploaded_charts(id) ON DELETE SET NULL,
    market_direction TEXT NOT NULL CHECK (market_direction IN ('Bullish', 'Bearish', 'Neutral')),
    scenario_type TEXT NOT NULL CHECK (scenario_type IN ('Buy Setup', 'Sell Setup', 'No Setup')),
    entry_zone JSONB NOT NULL, -- { min: number, max: number, optimal: number }
    stop_loss NUMERIC(18, 6) NOT NULL,
    take_profit_1 NUMERIC(18, 6) NOT NULL,
    take_profit_2 NUMERIC(18, 6),
    take_profit_3 NUMERIC(18, 6),
    risk_reward_ratio NUMERIC(6, 2) NOT NULL,
    confidence_score INT NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
    confidence_explanation TEXT NOT NULL,
    market_structure TEXT NOT NULL,
    support_levels JSONB DEFAULT '[]'::jsonb,
    resistance_levels JSONB DEFAULT '[]'::jsonb,
    liquidity_analysis TEXT NOT NULL,
    trend_analysis TEXT NOT NULL,
    technical_indicators JSONB DEFAULT '{}'::jsonb,
    invalidation_criteria TEXT NOT NULL,
    analysis_reasons JSONB DEFAULT '[]'::jsonb,
    raw_ai_response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. PAPER TRADING POSITIONS
CREATE TABLE IF NOT EXISTS public.paper_trading_positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('LONG', 'SHORT')),
    entry_price NUMERIC(18, 6) NOT NULL,
    quantity NUMERIC(18, 6) NOT NULL,
    position_size_usd NUMERIC(18, 2) NOT NULL,
    stop_loss NUMERIC(18, 6),
    take_profit NUMERIC(18, 6),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'CANCELLED')),
    exit_price NUMERIC(18, 6),
    realized_pnl NUMERIC(18, 2) DEFAULT 0.00,
    realized_pnl_percent NUMERIC(8, 2) DEFAULT 0.00,
    notes TEXT,
    associated_analysis_id UUID REFERENCES public.analysis_history(id) ON DELETE SET NULL,
    opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE
);

-- 5. PAPER TRADING TRANSACTIONS (JOURNAL & LEDGER)
CREATE TABLE IF NOT EXISTS public.paper_trading_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    position_id UUID REFERENCES public.paper_trading_positions(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('DEPOSIT', 'RESET', 'OPEN_POSITION', 'CLOSE_POSITION', 'SL_HIT', 'TP_HIT')),
    amount NUMERIC(18, 2) NOT NULL,
    balance_after NUMERIC(18, 2) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. WATCHLISTS
CREATE TABLE IF NOT EXISTS public.watchlists (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL DEFAULT 'Main Watchlist',
    symbols JSONB NOT NULL DEFAULT '["BTC/USDT", "ETH/USDT", "SOL/USDT", "XAU/USD", "EUR/USD", "GBP/USD", "NAS100", "US30"]'::jsonb,
    is_default BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS on all tables
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_trading_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_trading_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;

-- 1. user_settings policies
CREATE POLICY "Users can view their own settings"
    ON public.user_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings"
    ON public.user_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings"
    ON public.user_settings FOR UPDATE
    USING (auth.uid() = user_id);

-- 2. uploaded_charts policies
CREATE POLICY "Users can view their own uploaded charts"
    ON public.uploaded_charts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can upload their own charts"
    ON public.uploaded_charts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own uploaded charts"
    ON public.uploaded_charts FOR DELETE
    USING (auth.uid() = user_id);

-- 3. analysis_history policies
CREATE POLICY "Users can view their own analysis history"
    ON public.analysis_history FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own analysis records"
    ON public.analysis_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own analysis records"
    ON public.analysis_history FOR DELETE
    USING (auth.uid() = user_id);

-- 4. paper_trading_positions policies
CREATE POLICY "Users can view their own positions"
    ON public.paper_trading_positions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own positions"
    ON public.paper_trading_positions FOR ALL
    USING (auth.uid() = user_id);

-- 5. paper_trading_transactions policies
CREATE POLICY "Users can view their own transactions"
    ON public.paper_trading_transactions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions"
    ON public.paper_trading_transactions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 6. watchlists policies
CREATE POLICY "Users can view their own watchlists"
    ON public.watchlists FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own watchlists"
    ON public.watchlists FOR ALL
    USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_analysis_user_created ON public.analysis_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_positions_user_status ON public.paper_trading_positions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_uploaded_charts_user ON public.uploaded_charts(user_id);
