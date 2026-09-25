# 🌐 Language Features - Quick Reference Card

## 🎯 At a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                    TWO LANGUAGE FEATURES                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1️⃣ LANGUAGE SWITCHER (Public)         [🌐 EN]            │
│     Location: Navbar (top-right)                            │
│     Purpose: Switch entire UI to EN/AR                      │
│     Access: All users                                       │
│                                                             │
│  2️⃣ AUTO-TRANSLATION (Admin)           [🌐 Translate]     │
│     Location: Admin → Products → Add Product                │
│     Purpose: Translate product details EN→AR               │
│     Access: Admin only                                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔍 Quick Finder

### Need to Switch the UI Language?
```
✅ USE: Language Switcher
📍 FIND: Navbar → Top-Right → Globe icon 🌐
🎯 CLICK: Toggle between EN ↔ AR
```

### Need to Translate a Product?
```
✅ USE: Auto-Translation
📍 FIND: Admin Dashboard → Products → Add Product → Gold box at top
🎯 CLICK: "Translate" button after entering English text
```

---

## 💻 Code Quick Reference

### Use Language in Components:
```tsx
import { useLanguage } from '../../contexts/LanguageContext';

function MyComponent() {
  const { t, language, toggleLanguage } = useLanguage();
  
  return (
    <div>
      {/* Translate text */}
      <h1>{t('Hello', 'مرحبا')}</h1>
      
      {/* Check current language */}
      <p>Current: {language}</p>
      
      {/* Conditional content */}
      {language === 'ar' ? <ArabicContent /> : <EnglishContent />}
      
      {/* Manual toggle */}
      <button onClick={toggleLanguage}>Switch</button>
    </div>
  );
}
```

---

## 📱 Visual Locations

### Language Switcher (Navbar):
```
Desktop:
┌──────────────────────────────────────────────────────┐
│ 🍵 Tea Cafe   Home  Products  Gifts   [☀️][🌐][🛒][👤] │
└──────────────────────────────────────────────────────┘
                                             ↑
                                          HERE!

Mobile:
┌─────────────────────────────┐
│ 🍵 Tea Cafe   ☀️ 🌐 🛒 👤 ☰  │
└─────────────────────────────┘
                    ↑
                 HERE!
```

### Auto-Translation (Admin):
```
Admin → Products → Click "+ Add Product"

Dialog Opens:
┌──────────────────────────────────────────┐
│ Add New Product                      [X] │
├──────────────────────────────────────────┤
│ ┌────────────────────────────────────┐   │
│ │ 🌐 Auto-Translate  [Translate]    │ ← HERE!
│ └────────────────────────────────────┘   │
│                                          │
│ Product Name: [_________________]        │
└──────────────────────────────────────────┘
```

---

## 🎨 What You'll See

### Language Switcher States:

**English Mode:**
```
Button: [🌐 EN]
Badge: Gold with "EN" text
Click: Switches to Arabic
```

**Arabic Mode:**
```
Button: [🌐 AR]
Badge: Gold with "AR" text  
Click: Switches to English
Direction: Page becomes RTL
```

---

## ⚡ Common Tasks

### Task: Add Translation to a Page
```tsx
// 1. Import hook
import { useLanguage } from '../../contexts/LanguageContext';

// 2. Use in component
const { t } = useLanguage();

// 3. Wrap text
<h1>{t('English Text', 'النص العربي')}</h1>
```

### Task: Show Product in User's Language
```tsx
const { language } = useLanguage();

<h3>{language === 'ar' ? product.nameAr : product.name}</h3>
```

### Task: Toggle Language Programmatically
```tsx
const { setLanguage, toggleLanguage } = useLanguage();

// Specific language
setLanguage('ar');

// Toggle
toggleLanguage();
```

---

## 🗂️ File Locations

```
Language Context:
├── /src/contexts/LanguageContext.tsx

Language Toggle Component:
├── /src/app/components/LanguageToggle.tsx

Used In:
├── /src/app/App.tsx (Provider wrapper)
├── /src/app/components/Navbar.tsx (Toggle button)
└── /src/app/pages/HomePage.tsx (Example usage)

Documentation:
├── /LANGUAGE_SWITCHER_GUIDE.md (Detailed guide)
├── /LANGUAGE_SWITCHER_SUMMARY.md (Implementation summary)
├── /TWO_LANGUAGE_FEATURES.md (Feature comparison)
├── /LANGUAGE_ICON_LOCATION.md (How to find it)
└── /QUICK_REFERENCE_LANGUAGE.md (This file)
```

---

## 🧪 Quick Test Commands

### Test 1: Find the Icon
```
1. Open: http://localhost:5173
2. Look: Top-right navbar
3. See: 🌐 with "EN" badge
```

### Test 2: Toggle Language
```
1. Click: Globe icon
2. See: Badge changes to "AR"
3. See: Page direction flips to RTL
```

### Test 3: Check Persistence
```
1. Toggle to Arabic
2. Refresh page (F5)
3. Language should still be Arabic
```

### Test 4: Verify in DevTools
```
1. Open: DevTools (F12)
2. Go to: Application → LocalStorage
3. Find: tea-cafe-language
4. Value: "en" or "ar"
```

---

## 📊 Translation Helper Cheat Sheet

### Common UI Elements:

| English | Arabic | Usage |
|---------|--------|-------|
| Home | الرئيسية | `t('Home', 'الرئيسية')` |
| Products | المنتجات | `t('Products', 'المنتجات')` |
| Cart | السلة | `t('Cart', 'السلة')` |
| Checkout | الدفع | `t('Checkout', 'الدفع')` |
| Login | تسجيل الدخول | `t('Login', 'تسجيل الدخول')` |
| Logout | تسجيل الخروج | `t('Logout', 'تسجيل الخروج')` |
| Search | بحث | `t('Search', 'بحث')` |
| Add to Cart | أضف إلى السلة | `t('Add to Cart', 'أضف إلى السلة')` |
| Total | المجموع | `t('Total', 'المجموع')` |
| Price | السعر | `t('Price', 'السعر')` |

---

## 🎯 Troubleshooting Fast Fixes

| Problem | Quick Fix |
|---------|-----------|
| Can't see icon | Hard refresh: `Ctrl+Shift+R` |
| Badge not showing | Check lucide-react installed |
| Language not saving | Check localStorage in DevTools |
| RTL not working | Check `document.dir` in console |
| Toggle not clicking | Check for JavaScript errors in console |

---

## ✅ Quick Verification Checklist

**Is the Language Switcher Working?**

- [ ] Icon visible in navbar (🌐)
- [ ] Badge shows "EN" or "AR"
- [ ] Clicking changes badge text
- [ ] localStorage saves choice
- [ ] `document.dir` changes
- [ ] No console errors

**All checked?** ✅ It's working!

---

## 🚀 Implementation Checklist

**To Make a Page Bilingual:**

- [ ] Import `useLanguage` hook
- [ ] Destructure `t` function
- [ ] Wrap all text with `t(en, ar)`
- [ ] Test in both languages
- [ ] Check RTL layout
- [ ] Verify spacing and alignment

---

## 📞 Quick Help

### "Where is the language icon?"
→ **Top-right navbar, between sun icon and cart**

### "How do I translate text?"
→ **Use `t('English', 'العربية')` helper function**

### "How do I add Arabic to products?"
→ **Add `nameAr` and `descriptionAr` fields to product data**

### "Why isn't RTL working?"
→ **Check if language is actually changing in LanguageContext**

---

## 🎉 You're All Set!

```
✅ Language switcher installed
✅ Visible in navbar (🌐 EN/AR)
✅ Translation system ready
✅ RTL support automatic
✅ localStorage persistence
✅ Full documentation available

👉 Next: Start translating your pages!
```

---

**Quick Access:**
- Read: `/LANGUAGE_SWITCHER_GUIDE.md` for detailed instructions
- Check: `/TWO_LANGUAGE_FEATURES.md` to understand both features
- Reference: This file for quick lookups

**Happy translating! 🌐**
