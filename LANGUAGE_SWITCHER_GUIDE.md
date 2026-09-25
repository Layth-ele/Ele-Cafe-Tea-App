# 🌐 Language Switcher Implementation Guide

## ✅ What Was Added

A complete **English/Arabic language switcher** in the public navbar that:
- Toggles between English (EN) and Arabic (AR)
- Persists language preference in localStorage
- Automatically sets RTL (right-to-left) for Arabic
- Includes a visible language toggle button in the navbar
- Provides a translation helper function throughout the app

---

## 🎯 Where to Find It

The **Language Toggle** button is now in the **navbar**, right after the theme toggle:

```
[☀️ Theme]  [🌐 EN]  [🛒 Cart]  [Login]
             ↑
         Click here to toggle language!
```

**Features:**
- Globe icon (🌐) with current language badge
- Badge shows "EN" or "AR" 
- Click to toggle between languages
- Gold badge color (matches your luxury theme)

---

## 📁 Files Created

### 1. `/src/contexts/LanguageContext.tsx`
The language state management context that:
- Manages current language (EN/AR)
- Persists to localStorage
- Sets document direction (RTL/LTR)
- Provides translation helper function

### 2. `/src/app/components/LanguageToggle.tsx`
The navbar button component that:
- Shows Languages icon
- Displays current language badge
- Toggles on click

### 3. Modified Files:
- `/src/app/App.tsx` - Added LanguageProvider wrapper
- `/src/app/components/Navbar.tsx` - Added LanguageToggle button
- `/src/app/pages/HomePage.tsx` - Example of using translations

---

## 🔧 How to Use Language System

### Basic Usage

Import and use the `useLanguage` hook:

```tsx
import { useLanguage } from '../../contexts/LanguageContext';

function MyComponent() {
  const { t, language } = useLanguage();
  
  return (
    <div>
      <h1>{t('Hello', 'مرحبا')}</h1>
      <p>Current language: {language}</p>
    </div>
  );
}
```

### Translation Helper Function

The `t()` function takes English and Arabic text:

```tsx
const { t } = useLanguage();

// Simple text
<h1>{t('Welcome', 'أهلا بك')}</h1>

// In buttons
<Button>{t('Add to Cart', 'أضف إلى السلة')}</Button>

// In paragraphs
<p>{t(
  'Discover the finest teas from around the world',
  'اكتشف أجود أنواع الشاي من جميع أنحاء العالم'
)}</p>
```

### Advanced Usage

#### Check Current Language
```tsx
const { language } = useLanguage();

if (language === 'ar') {
  // Show Arabic-specific content
}
```

#### Programmatically Set Language
```tsx
const { setLanguage } = useLanguage();

// Set to Arabic
setLanguage('ar');

// Set to English
setLanguage('en');
```

#### Toggle Language
```tsx
const { toggleLanguage } = useLanguage();

<button onClick={toggleLanguage}>
  Switch Language
</button>
```

---

## 🎨 RTL (Right-to-Left) Support

When Arabic is selected:
- `document.documentElement.dir = "rtl"` is automatically set
- Layout automatically flips for RTL
- Text alignment adjusts automatically

### RTL-Aware Styling

Tailwind classes work automatically:
```tsx
// This will flip in RTL mode
<div className="ml-4">  {/* Becomes margin-right in RTL */}
  Content
</div>
```

For manual RTL handling:
```tsx
const { language } = useLanguage();

<div className={language === 'ar' ? 'text-right' : 'text-left'}>
  Content
</div>
```

---

## 📝 Example: Translating a Component

### Before (English only):
```tsx
export function ProductCard({ product }) {
  return (
    <Card>
      <h3>Featured Product</h3>
      <p>{product.name}</p>
      <Button>Add to Cart</Button>
    </Card>
  );
}
```

### After (Bilingual):
```tsx
import { useLanguage } from '../../contexts/LanguageContext';

export function ProductCard({ product }) {
  const { t, language } = useLanguage();
  
  return (
    <Card>
      <h3>{t('Featured Product', 'منتج مميز')}</h3>
      <p>{language === 'ar' ? product.nameAr : product.name}</p>
      <Button>{t('Add to Cart', 'أضف إلى السلة')}</Button>
    </Card>
  );
}
```

---

## 🗂️ Product Data Structure

Your products should have both English and Arabic fields:

```typescript
interface Product {
  id: string;
  name: string;        // English name
  nameAr: string;      // Arabic name
  description: string; // English description
  descriptionAr: string; // Arabic description
  price: number;
  category: string;
  categoryAr: string;
  // ... other fields
}
```

Then use:
```tsx
const { language } = useLanguage();

<h3>{language === 'ar' ? product.nameAr : product.name}</h3>
<p>{language === 'ar' ? product.descriptionAr : product.description}</p>
```

---

## 🌟 Common Translations

Here are some common phrases you'll need:

| English | Arabic |
|---------|--------|
| Home | الرئيسية |
| Products | المنتجات |
| Cart | السلة |
| Checkout | الدفع |
| Login | تسجيل الدخول |
| Logout | تسجيل الخروج |
| My Orders | طلباتي |
| Add to Cart | أضف إلى السلة |
| Buy Now | اشتر الآن |
| Price | السعر |
| Description | الوصف |
| Category | الفئة |
| Search | بحث |
| Filter | تصفية |
| Sort | ترتيب |
| Total | المجموع |
| Subtotal | المجموع الفرعي |
| Shipping | الشحن |
| Payment | الدفع |
| Order Confirmed | تم تأكيد الطلب |
| Thank you | شكراً لك |

---

## 🎯 Quick Implementation Checklist

To add translations to a page:

- [ ] Import `useLanguage` hook
- [ ] Destructure `t` and `language`
- [ ] Wrap all text with `t(englishText, arabicText)`
- [ ] For product data, use conditional: `language === 'ar' ? arabicField : englishField`
- [ ] Test by clicking the language toggle in navbar

---

## 🚀 Next Steps

### Priority Pages to Translate:
1. ✅ Navbar (navigation links)
2. ⏳ HomePage (hero, features, products)
3. ⏳ ProductsPage (filters, product cards)
4. ⏳ CartPage (cart items, totals)
5. ⏳ CheckoutPage (form labels, payment)
6. ⏳ Admin pages (if needed for Arabic admins)

### Recommended Approach:
1. Start with static text using `t()` helper
2. Add Arabic fields to product mock data
3. Update product displays to use conditional rendering
4. Test RTL layout on each page
5. Adjust spacing/alignment as needed for RTL

---

## 💡 Tips

1. **Keep it Simple**: Start by translating just the main headings and buttons
2. **Use Consistent Terms**: Pick one translation for "Cart" and stick with it
3. **Test Both Languages**: Always toggle to check both EN and AR
4. **RTL Spacing**: Some margins might need adjustment in RTL mode
5. **Icons**: Most icons work well in both directions, but arrows (→) might need flipping

---

## 🎨 Customization

### Change the Toggle Button Style

Edit `/src/app/components/LanguageToggle.tsx`:

```tsx
// Show full text instead of badge
<Button onClick={toggleLanguage}>
  <Languages className="mr-2 h-4 w-4" />
  {language === 'en' ? 'عربي' : 'English'}
</Button>
```

### Add a Dropdown Menu

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon">
      <Languages className="h-5 w-5" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem onClick={() => setLanguage('en')}>
      English
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => setLanguage('ar')}>
      العربية
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

## 🐛 Troubleshooting

### Language not persisting?
- Check browser localStorage: `localStorage.getItem('tea-cafe-language')`
- Clear cache and hard refresh

### RTL not working?
- Check: `document.documentElement.dir` in browser console
- Should be "rtl" when Arabic is selected

### Toggle not visible?
- Look in navbar after theme toggle (sun/moon icon)
- Should show globe icon with "EN" or "AR" badge

### Badge not showing?
- Check if lucide-react Icons are loading
- Verify LanguageToggle component is imported in Navbar

---

## 📚 Resources

- **Google Translate**: For quick translations
- **DeepL**: More accurate translations
- **RTL Guidelines**: https://rtlstyling.com/
- **Arabic Typography**: Consider using specific Arabic fonts for better readability

---

## ✅ Summary

You now have a **complete bilingual system** with:
- ✅ Language toggle in navbar (🌐 EN/AR)
- ✅ Translation helper function `t(en, ar)`
- ✅ Automatic RTL support for Arabic
- ✅ localStorage persistence
- ✅ Easy-to-use hook: `useLanguage()`

**Try it now**: Click the globe icon (🌐) in the navbar to toggle between English and Arabic!
