# Tea Cafe System Architecture

## 🏗️ Complete System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TEA CAFE E-COMMERCE APP                      │
│                    (React + TypeScript + Tailwind)                  │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
                ▼                ▼                ▼
        ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
        │   Frontend   │ │   Contexts   │ │   Services   │
        │  Components  │ │  (State Mgmt)│ │   (APIs)     │
        └──────────────┘ └──────────────┘ └──────────────┘
```

## 🎨 Frontend Architecture

### Component Hierarchy

```
App.tsx (Root)
├── ThemeProvider (Luxury Dark/Light)
├── AuthProvider (Firebase Auth)
└── CartProvider (Shopping Cart State)
    │
    ├── Navbar (Header + Theme Toggle)
    │
    ├── Public Routes
    │   ├── HomePage
    │   ├── ProductsPage
    │   ├── CartPage
    │   ├── CheckoutPage
    │   ├── GiftsPage
    │   ├── LoginPage
    │   └── SignupPage
    │
    └── Protected Routes
        └── Admin (requireAdmin: true)
            ├── AdminLayout
            │   ├── AdminOverview (Analytics)
            │   ├── AdminProducts (CRUD + Auto-Translate)
            │   └── AdminOrders (Order Management)
```

## 🎯 Key Features by Phase

### ✅ Phase 1 (Completed)
```
┌─────────────────────────────────────────┐
│ Core Functionality                      │
├─────────────────────────────────────────┤
│ • User Authentication (Firebase)        │
│ • Product Catalog with Categories       │
│ • Shopping Cart                         │
│ • Checkout Flow                         │
│ • Order Management                      │
│ • Gift Builder                          │
│ • Responsive Design                     │
│ • shadcn/ui Components                  │
└─────────────────────────────────────────┘
```

### ✅ Phase 2 (In Progress)
```
┌─────────────────────────────────────────┐
│ Advanced Features                       │
├─────────────────────────────────────────┤
│ ✅ Admin Dashboard                      │
│ ✅ CRUD Product Management              │
│ ✅ Order Status Management              │
│ ✅ Analytics & Overview                 │
│ ✅ Luxury Theme System (Dark/Light)     │
│ ✅ Auto-Translation (EN → AR)           │
│ 🔄 Firebase Firestore Integration       │
│ 🔄 Multi-Language i18n (EN/AR)          │
│ 🔄 Payment Processing (Stripe/PayPal)   │
└─────────────────────────────────────────┘
```

## 🎨 Luxury Theme System

### Theme Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Theme System                           │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  /src/styles/tokens.css                                 │
│  ├── [data-theme="light"]                               │
│  │   ├── --bg: #faf8f5 (Cream)                         │
│  │   ├── --text: #2b2825 (Dark Graphite)               │
│  │   └── --accent: #c5a572 (Warm Gold)                 │
│  │                                                      │
│  └── [data-theme="dark"]                                │
│      ├── --bg: #1a1816 (Deep Charcoal)                 │
│      ├── --text: #f5f3f0 (Off-white)                   │
│      └── --accent: #c5a572 (Same Gold)                 │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  ThemeContext                                           │
│  └── useTheme() → { theme, setTheme, toggleTheme }     │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  ThemeToggle Component                                  │
│  └── Navbar + Admin Header                             │
└──────────────────────────────────────────────────────────┘
```

### Token Usage Pattern

```typescript
// ✅ CORRECT: Use semantic tokens
<div className="bg-background text-foreground">
<Card className="bg-card border-border">
<Button className="bg-primary text-primary-foreground">

// ❌ WRONG: Hardcoded colors
<div className="bg-white text-black">
<Card className="bg-gray-900">
```

## 🌐 Auto-Translation System

### Translation Flow

```
┌─────────────────────────────────────────────────────────┐
│ Step 1: Admin Inputs English Text                      │
├─────────────────────────────────────────────────────────┤
│ • Product Name: "Jasmine Green Tea"                    │
│ • Description: "Delicate green tea..."                 │
└─────────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│ Step 2: Click "Translate" Button                       │
├─────────────────────────────────────────────────────────┤
│ • handleAutoTranslate() called                         │
│ • Validation: Check inputs exist                       │
│ • Check API key configured                             │
└─────────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│ Step 3: Call Google Cloud Translation API              │
├─────────────────────────────────────────────────────────┤
│ translateMultipleToArabic([name, description])         │
│                                                         │
│ POST https://translation.googleapis.com/...            │
│ {                                                       │
│   "q": ["Jasmine Green Tea", "Delicate..."],          │
│   "source": "en",                                      │
│   "target": "ar",                                      │
│   "format": "text"                                     │
│ }                                                       │
└─────────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│ Step 4: Receive Translation Response                   │
├─────────────────────────────────────────────────────────┤
│ {                                                       │
│   "translations": [                                     │
│     { "translatedText": "شاي أخضر بالياسمين" },        │
│     { "translatedText": "شاي أخضر رقيق..." }           │
│   ]                                                     │
│ }                                                       │
└─────────────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│ Step 5: Update Form State                              │
├─────────────────────────────────────────────────────────┤
│ setFormData({                                          │
│   ...formData,                                         │
│   nameAr: translations[0],                             │
│   descriptionAr: translations[1]                       │
│ })                                                      │
│                                                         │
│ toast.success("Translation completed!")                │
└─────────────────────────────────────────────────────────┘
```

### API Cost Structure

```
┌─────────────────────────────────────────┐
│   Google Cloud Translation Pricing      │
├─────────────────────────────────────────┤
│                                         │
│  FREE TIER                              │
│  ├── 500,000 characters/month           │
│  └── No credit card until exceeded      │
│                                         │
│  PAID TIER                              │
│  └── $20 per 1,000,000 characters       │
│                                         │
├─────────────────────────────────────────┤
│   Typical Usage                         │
├─────────────────────────────────────────┤
│                                         │
│  Small: 50 products/month               │
│  • ~5,000 chars → FREE ✅              │
│                                         │
│  Medium: 500 products/month             │
│  • ~50,000 chars → FREE ✅             │
│                                         │
│  Large: 10,000 products/month           │
│  • ~1M chars → ~$10/month 💰           │
└─────────────────────────────────────────┘
```

## 🔐 Security Architecture

### Authentication Flow

```
┌─────────────────────────────────────────┐
│         Firebase Authentication         │
├─────────────────────────────────────────┤
│                                         │
│  Login/Signup                           │
│  ├── Email/Password                     │
│  └── Firebase Auth SDK                  │
│                                         │
│  Protected Routes                       │
│  ├── ProtectedRoute component           │
│  └── Checks: currentUser exists         │
│                                         │
│  Admin Routes                           │
│  ├── ProtectedRoute (requireAdmin)      │
│  └── Checks: user.email === admin@...   │
└─────────────────────────────────────────┘
```

### API Key Management

```
Development:
├── .env (local file, gitignored)
│   └── VITE_GOOGLE_TRANSLATE_API_KEY=dev_key
│
Production:
├── Option 1: Environment Variables
│   └── Hosting platform dashboard (Vercel/Netlify)
│
├── Option 2: API Key Restrictions
│   └── Google Cloud Console → Restrict to domain
│
└── Option 3: Backend Proxy (Most Secure)
    └── Firebase Cloud Functions
```

## 📊 Data Flow

### Product Management Flow

```
┌──────────────┐
│    Admin     │
│  Dashboard   │
└──────┬───────┘
       │
       │ Add/Edit Product
       ▼
┌──────────────┐
│ AdminProducts│ ──────┐
│  Component   │       │
└──────────────┘       │
                       │ (Optional)
                       │ Auto-Translate
                       ▼
              ┌─────────────────┐
              │ Google Translate│
              │      API        │
              └─────────────────┘
                       │
                       │ Arabic Text
                       ▼
              ┌─────────────────┐
              │  Form Data      │
              │  (EN + AR)      │
              └─────────────────┘
                       │
                       │ Save
                       ▼
              ┌─────────────────┐
              │   Firestore     │ (Phase 2)
              │   Database      │
              └─────────────────┘
                       │
                       │ Sync
                       ▼
              ┌─────────────────┐
              │ Frontend State  │
              │  (mockProducts) │
              └─────────────────┘
                       │
                       │ Display
                       ▼
              ┌─────────────────┐
              │  ProductsPage   │
              │  (Public View)  │
              └─────────────────┘
```

## 🌍 Multi-Language Support (Phase 2 - Coming)

### i18n Architecture (Planned)

```
┌─────────────────────────────────────────┐
│         Language System                 │
├─────────────────────────────────────────┤
│                                         │
│  Supported Languages                    │
│  ├── English (en) - Default             │
│  └── Arabic (ar)                        │
│                                         │
│  Implementation                         │
│  ├── react-i18next                      │
│  ├── /src/locales/en.json               │
│  ├── /src/locales/ar.json               │
│  └── LanguageToggle component           │
│                                         │
│  Data Structure                         │
│  └── Products                           │
│      ├── name (English)                 │
│      ├── nameAr (Arabic)                │
│      ├── description (English)          │
│      └── descriptionAr (Arabic)         │
└─────────────────────────────────────────┘
```

## 💳 Payment Integration (Phase 2 - Coming)

### Payment Flow (Planned)

```
Checkout Page
     │
     │ Select Payment Method
     ├─────────────┬─────────────┐
     ▼             ▼             ▼
┌─────────┐ ┌──────────┐ ┌──────────┐
│  Stripe │ │  PayPal  │ │   Cash   │
└─────────┘ └──────────┘ └──────────┘
     │             │             │
     │ Process     │ Process     │ Save Order
     ▼             ▼             ▼
┌─────────────────────────────────┐
│       Order Confirmation        │
└─────────────────────────────────┘
```

## 📁 File Structure

```
tea-cafe/
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Navbar.tsx
│   │   │   ├── ThemeToggle.tsx
│   │   │   ├── ProtectedRoute.tsx
│   │   │   └── ui/ (shadcn components)
│   │   └── pages/
│   │       ├── HomePage.tsx
│   │       ├── ProductsPage.tsx
│   │       ├── CartPage.tsx
│   │       ├── CheckoutPage.tsx
│   │       ├── GiftsPage.tsx
│   │       ├── LoginPage.tsx
│   │       ├── SignupPage.tsx
│   │       ├── OrdersPage.tsx
│   │       └── admin/
│   │           ├── AdminLayout.tsx
│   │           ├── AdminOverview.tsx
│   │           ├── AdminProducts.tsx ✨ (Auto-Translate)
│   │           └── AdminOrders.tsx
│   │
│   ├── contexts/
│   │   ├── AuthContext.tsx
│   │   ├── CartContext.tsx
│   │   └── ThemeContext.tsx ✨
│   │
│   ├── lib/
│   │   ├── firebase.ts
│   │   ├── theme.ts ✨
│   │   └── translation.ts ✨ (Google Translate API)
│   │
│   ├── styles/
│   │   ├── index.css
│   │   ├── fonts.css
│   │   ├── tailwind.css
│   │   ├── tokens.css ✨ (Luxury theme tokens)
│   │   └── theme.css ✨ (shadcn integration)
│   │
│   ├── data/
│   │   └── mockProducts.ts
│   │
│   └── types/
│       └── index.ts
│
├── Documentation/
│   ├── THEME_SYSTEM.md ✨
│   ├── THEME_QUICK_REFERENCE.md ✨
│   ├── TRANSLATION_SETUP.md ✨
│   ├── ADMIN_QUICK_START.md ✨
│   ├── AUTO_TRANSLATION_IMPLEMENTATION.md ✨
│   └── SYSTEM_ARCHITECTURE.md ✨ (This file)
│
├── .env.example ✨
└── package.json
```

## 🚀 Deployment Architecture (Production)

```
┌─────────────────────────────────────────────────────────┐
│                    Production Stack                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Frontend Hosting                                       │
│  ├── Vercel / Netlify / Firebase Hosting               │
│  └── CDN for static assets                             │
│                                                         │
│  Backend Services                                       │
│  ├── Firebase Authentication (User auth)                │
│  ├── Firebase Firestore (Database)                     │
│  ├── Firebase Storage (Product images)                 │
│  └── Firebase Functions (Optional: API proxy)          │
│                                                         │
│  External APIs                                          │
│  ├── Google Cloud Translation                          │
│  ├── Stripe API (Payments)                             │
│  └── PayPal API (Payments)                             │
│                                                         │
│  Environment Variables                                  │
│  ├── VITE_GOOGLE_TRANSLATE_API_KEY                     │
│  ├── VITE_FIREBASE_* (Firebase config)                 │
│  ├── VITE_STRIPE_PUBLISHABLE_KEY                       │
│  └── VITE_PAYPAL_CLIENT_ID                             │
└─────────────────────────────────────────────────────────┘
```

## ✅ Current Implementation Status

### ✅ Completed (Production-Ready)
```
✅ Luxury Theme System
   ├── Dark/Light themes
   ├── Semantic token system
   ├── ThemeToggle component
   ├── localStorage persistence
   └── Smooth transitions

✅ Auto-Translation
   ├── Google Cloud Translation API integration
   ├── Batch translation (efficient)
   ├── Admin UI with translate button
   ├── Error handling
   └── Cost-effective implementation

✅ Admin Dashboard
   ├── Overview analytics
   ├── Product CRUD
   ├── Order management
   ├── Admin-only routes
   └── Search & filters

✅ Core E-commerce
   ├── Product catalog
   ├── Shopping cart
   ├── Checkout flow
   ├── User authentication
   └── Responsive design
```

### 🔄 In Progress (Phase 2)
```
🔄 Firebase Firestore Integration
   └── Replace mockProducts with real database

🔄 Multi-Language i18n
   └── English/Arabic UI translations

🔄 Payment Processing
   └── Stripe & PayPal integration
```

## 📈 Next Steps

1. **Connect Firebase Firestore**
   - Replace mock data with Firestore
   - Implement real-time listeners
   - Add data validation

2. **Implement i18n**
   - Install react-i18next
   - Create translation files
   - Add language toggle UI

3. **Add Payment Processing**
   - Integrate Stripe SDK
   - Add PayPal buttons
   - Implement payment webhooks

---

**System is production-ready** for theme system and auto-translation! 🎉

The architecture is clean, scalable, and ready for Phase 2 completion.
