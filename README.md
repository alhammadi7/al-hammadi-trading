# 🏆 Al Hammadi Trading — نظام التداول الاحترافي

نظام تداول احترافي مدعوم بـ Claude AI — يعمل على Vercel مع حماية كاملة لمفتاح API.

---

## 📁 هيكل المشروع

```
al-hammadi-trading/
├── public/
│   └── index.html        ← الواجهة الكاملة
├── api/
│   └── claude.js         ← Serverless proxy (يحمي API Key)
├── vercel.json           ← إعدادات Vercel
├── package.json
└── README.md
```

---

## 🚀 خطوات النشر على Vercel

### 1. ثبّت Vercel CLI
```bash
npm install -g vercel
```

### 2. سجّل دخول
```bash
vercel login
```

### 3. انشر المشروع
```bash
cd al-hammadi-trading
vercel --prod
```

### 4. أضف مفتاح Anthropic API
في لوحة تحكم Vercel:
- اذهب إلى **Settings → Environment Variables**
- أضف متغير جديد:
  - **Name**: `ANTHROPIC_API_KEY`
  - **Value**: مفتاحك من [console.anthropic.com](https://console.anthropic.com)
  - **Environment**: Production + Preview + Development

### 5. أعد النشر
```bash
vercel --prod
```

---

## 🔒 الأمان

- مفتاح API يُخزَّن في Vercel فقط — **لا يظهر أبداً في المتصفح**
- الـ `/api/claude` endpoint يقبل فقط POST requests
- الحد الأقصى لـ `max_tokens` هو 4096 لمنع الاستخدام المفرط

---

## ✨ المميزات

| الصفحة | الوصف |
|--------|-------|
| 📡 Macro Scan | تحليل بيئة السوق + أخبار بالـ AI |
| ✅ Pre-Trade Checklist | 20+ شرط مع Score تلقائي |
| 💰 Risk Calculator | حساب اللوت + TP/SL تلقائي |
| 📸 Chart Analysis | تحليل الشارت بالصور عبر Claude Vision |
| 📓 Trade Journal | تسجيل + رسوم بيانية + تصدير CSV |
| 📊 Weekly Report | تقرير أسبوعي تلقائي بالـ AI |
| 💬 AI Chat | مساعد تداول ذكي دائم |

---

## 🛠 تطوير محلي

```bash
npm install
vercel dev
```

ثم افتح: `http://localhost:3000`

---

© 2025 Al Hammadi Trading — All rights reserved
