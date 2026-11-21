# TRADEIQ — Sun'iy Intellekt Asosidagi Professional Savdo Grafigi Tahlil Platformasi

![TRADEIQ Platform](https://img.shields.io/badge/TRADE-IQ-00F0A8?style=for-the-badge&logoColor=black)
![React 18](https://img.shields.io/badge/React-18-blue?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge)
![TradingView](https://img.shields.io/badge/Lightweight--Charts-TradingView-emerald?style=for-the-badge)
![Supabase](https://img.shields.io/badge/Supabase-Ready-green?style=for-the-badge)
![Gemini AI](https://img.shields.io/badge/Gemini%20AI-Multimodal-purple?style=for-the-badge)

**TRADEIQ** — zamonaviy, institutsional darajadagi AI savdo grafigi tahlili va simulyatsiya platformasi. Treyderlarga grafik skrinshotlarini yuklash yoki jonli bozor ma'lumotlarini kuzatish, ko'p taymfreymli bozor strukturasini o'rganish, likvidlik zonalari va texnik indikatorlarni tahlil qilish hamda xavf-xatarsiz virtual savdo (paper trading) muhitida o'z strategiyalarini sinab ko'rish imkonini beradi.

---

## 🌟 Asosiy Imkoniyatlar

### 1. 🧠 AI Grafik Tahlilchisi (Multimodal Vision & Kvant Sintezi)
- **Skrinshotlarni yuklash**: TradingView, MetaTrader yoki birjalardan olingan **PNG, JPG, WEBP** formatidagi grafik rasmlarini yuklash.
- **Qo'llab-quvvatlanadigan taymfreymlar**: `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1D`, `1W`.
- **Institutsional Bozor Strukturasi Tahlili**:
  - Higher Highs (HH) / Higher Lows (HL) va Lower Highs (LH) / Lower Lows (LL)
  - Bozor tuzilmasi buzilishi (BOS) va Xarakter o'zgarishi (CHOCH)
  - Dinamik va gorizontal Qo'llab-quvvatlash / Qarshilik zonalari
  - Likvidlik bo'shliqlari (FVG) va treyderlarning stop-loss to'plamlari (liquidity pools)
  - Shamlar anatomiyasi va ATR asosidagi haqiqiy volatillik
- **Haqiqiy Tahlil Qoidasi**: Ko'rinmagan yoki hisoblanmagan indikatorlar asossiz ko'rsatilmaydi.
- **Asosli Ishonch Balli (Confidence Score)**: Faqat texnik omillar mosligi asosida baholanadi (0-100%).
- **Ssenariy Yo'q (No Setup) Rejimi**: Bozor noaniq yoki ma'lumot yetarli bo'lmaganda soxta signal bermaydi.
- **Bir zumda Virtual Savdoga o'tkazish**: Tahlil natijasidagi kirish, SL va TP darajalarini bitta tugma orqali Paper Tradingga yuklash.

---

### 2. 📊 Interaktiv Shamli Grafik (TradingView Lightweight Charts)
- TradingView'ning yuqori tezlikdagi HTML5 Canvas dvigateli.
- Texnik qatlamlar:
  - **EMA 20** (Moviy)
  - **EMA 50** (Sariq)
  - **EMA 200** (Binafsharang)
  - **Hajm (Volume) gistogrammasi**
- **AI Ssenariy Chiziqlari**: Faol ssenariy bo'yicha Kirish darajasi, Stop Loss (Qizil) va Take Profit (Yashil) chiziqlarini grafikda ko'rsatish.
- **AI bilan Skanerlash**: Joriy grafikdagi shamlarni bir zumda AI Tahlilchiga yuborish.

---

### 3. 📋 Bozor Kuzatuv Ro'yxati (Market Watchlist)
- Eng ommabop global aktivlar:
  - **Kripto**: `BTC/USDT`, `ETH/USDT`, `SOL/USDT`
  - **Xomashyo**: `XAU/USD` (Oltin Spot)
  - **Forex**: `EUR/USD`, `GBP/USD`
  - **Indekslar**: `NAS100` (Nasdaq 100), `US30` (Dow Jones 30)
- Jonli narxlar, 24 soatlik o'zgarish foizi, 24s maksimum/minimum, volatillik ko'rsatkichi va trend holati.

---

### 4. 💼 Virtual Savdo (Paper Trading) va Savdo Jurnali
- **Virtual Balans**: Boshlang'ich $10,000 virtual depozit (o'zgartirish va qayta tiklash imkoniyati bilan).
- **Bitimlar Ochish**: LONG va SHORT buyurtmalar, lot hajmi, SL va TP.
- **Jonli Norealizatsiya PnL**: Bozor narxlari o'zgarishi bilan real vaqtda yangilanadigan foyda/zarar.
- **Statistika**: G'alaba darajasi (Win Rate %), amalga oshirilgan PnL, Risk/Mukofot nisbati.
- **Tranzaksiyalar Jurnali**: Bitimlar ochilishi, yopilishi va balans o'zgarishi qayd etiladigan to'liq buxgalteriya daftari.

---

### 5. 🗄️ Tahlillar Tarixi
- Oldingi barcha tahlillar, kiritilgan rasmlar, kirish zonalari va sabablar arxivi.
- Qidiruv va ssenariy bo'yicha filtrlar (`Xarid`, `Sotish`, `Ssenariy Yo'q`).
- Batafsil ko'rish oynasi (Modal drawer) va Paper Tradingga o'tkazish.

---

### 6. 🌐 Global Bozor Sessiyalari va Volatillik Radari
- Asosiy jahon birja sessiyalarining real vaqt rejimidagi holati:
  - **London Sessiyasi** (08:00 - 16:30 UTC)
  - **Nyu-York Sessiyasi** (13:00 - 21:00 UTC)
  - **Tokio Sessiyasi** (00:00 - 09:00 UTC)
  - **Sidney Sessiyasi** (22:00 - 07:00 UTC)
- Bozor volatilligi darajasi (Barqaror / Yuqori).

---

## 🛠️ Ishlatilgan Texnologiyalar

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Framer Motion
- **Grafik Dvigateli**: TradingView Lightweight Charts (`lightweight-charts`)
- **Backend API**: Node.js, Express, Multer (xotirada xavfsiz saqlash), TypeScript (`tsx`)
- **AI Dvigateli**: Google Generative AI (`@google/generative-ai` - Gemini 1.5 Flash/Pro multimodal ko'rish) + O'rnatilgan Kvant Texnik Vision dvigateli
- **Baza va Xotira**: Supabase (PostgreSQL, Row Level Security RLS) + Mahalliy xotira (LocalStorage)

---

## 🚀 Loyihani Ishga Tushirish

### 1. Talablar
- **Node.js** v18+ (Node v24 da sinovdan o'tgan)
- **npm** v10+

### 2. O'rnatish
Loyiha papkasida kutubxonalarni o'rnating:
```bash
npm install
```

### 3. Sozlash (Ixtiyoriy)
`.env.example` faylini `.env` deb nusxalang:
```bash
PORT=3001
# Ixtiyoriy: Gemini API kaliti
# GEMINI_API_KEY=your_gemini_api_key

# Ixtiyoriy: Supabase konfiguratsiyasi
# VITE_SUPABASE_URL=https://your-project.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key
```
*(Eslatma: Gemini API kalitini dastur ichidagi **Sozlamalar** sahifasidan ham bevosita kiritishingiz mumkin!)*

### 4. Dasturni Ishga Tushirish
Backend server va Frontend mijozni bir vaqtda ishga tushirish:
```bash
npm run dev
```
- **Frontend Dastur**: `http://localhost:5173`
- **Backend Server API**: `http://localhost:3001`

### 5. Production Qurish (Build)
```bash
npm run build
```

---

## 🗄️ Supabase Ma'lumotlar Bazasi Sxemasi

To'liq SQL sxemasi va Row Level Security (RLS) qoidalari `supabase_schema.sql` faylida keltirilgan:
1. [Supabase Dashboard](https://supabase.com) sahifasini oching.
2. **SQL Editor** bo'limiga o'ting.
3. `supabase_schema.sql` fayli ichidagi kodni qo'yib, **Run** tugmasini bosing.
4. Barcha jadvallar (`user_settings`, `uploaded_charts`, `analysis_history`, `paper_trading_positions`, `paper_trading_transactions`, `watchlists`) va foydalanuvchilar ma'lumotlarini izolyatsiya qiluvchi RLS siyosatlari avtomatik tarzda yaratiladi.

---

## ⚠️ Ta'limiy Ogohlantirish

**TRADEIQ faqat ta'limiy va simulyatsiya maqsadlariga mo'ljallangan platformadir.**
- Taqdim etilgan barcha AI tahlillari, simulyatsiya qilingan kirish, Stop Loss va Take Profit darajalari faraziy hisoblanadi va **hech qanday moliyaviy, investitsiya yoki brokerlik maslahati hisoblanmaydi**.
- TRADEIQ haqiqiy pul bilan savdo qilmaydi va real brokerlarga ulanmaydi.
- O'tmishdagi natijalar yoki faraziy ssenariylar kelajakdagi daromadni kafolatlamaydi.
