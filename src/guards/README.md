# 🔐 Ele Cafe Authentication Guards

This folder contains the authentication and authorization system for the Ele Cafe app.

## Three-Layer Security Architecture

### Layer 1: Client-Side Guard (`useAuthGuard` hook)
**File:** `useAuthGuard.ts`  
**Purpose:** Prevent guests from triggering protected actions in the UI  
**Can be bypassed?** ⚠️ Yes (JavaScript can be disabled)

**Usage Example:**
```tsx
import { useAuthGuard } from '@/guards/useAuthGuard';

function TeaProfilePage() {
  const { requireAuth } = useAuthGuard();

  const handleRate = (stars: number) => {
    requireAuth(async () => {
      // This only runs if user is authenticated
      await addReview(teaId, { rating: stars });
    });
  };

  const handlePurchase = () => {
    requireAuth(() => {
      navigate('/checkout');
    });
  };

  return (
    <>
      <StarRating onRate={handleRate} />
      <PurchaseButton onClick={handlePurchase} />
    </>
  );
}
```

---

### Layer 2: Route Protection (`ProtectedRoute` component)
**File:** `../components/ProtectedRoute.tsx`  
**Purpose:** Block unauthenticated users from accessing entire pages  
**Can be bypassed?** ⚠️ Partially (relies on client-side check)

**Usage Example:**
```tsx
<Route 
  path="/orders" 
  element={
    <ProtectedRoute>
      <OrdersPage />
    </ProtectedRoute>
  } 
/>
```

**Protected Routes:**
- `/orders` - User's order history
- `/checkout` - Checkout process
- `/account` - User account settings
- `/admin/*` - Admin dashboard (requires `isAdmin` flag)

---

### Layer 3: Firestore Security Rules
**File:** `firestore.rules`  
**Purpose:** Final enforcement at the database level  
**Can be bypassed?** ✅ **No** - Server-side enforcement

**Deploy to Firebase:**
```bash
firebase deploy --only firestore:rules
```

**What it protects:**
- `/products/{id}/reviews` - Only authenticated users can create reviews
- `/orders/{id}` - Users can only read their own orders
- `/users/{id}` - Users can only access their own profile
- `/gifts/{id}` - Users can only manage their own gifts
- All admin operations require `role: 'admin'` custom claim

---

## Security Best Practices

### ✅ DO:
- Always use `requireAuth()` before ANY protected action (ratings, purchases, cart operations)
- Wrap protected pages with `<ProtectedRoute>`
- Deploy Firestore rules to production
- Set admin custom claims via Firebase Admin SDK

### ❌ DON'T:
- Trust client-side checks alone
- Skip Firestore rules thinking UI protection is enough
- Store sensitive data client-side
- Allow unauthenticated writes in Firestore rules

---

## Setting Admin Role

### Option 1: Firebase Admin SDK Script

Create a Node.js script outside your React app:

```javascript
// scripts/setAdminClaim.js
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccountKey.json'))
});

async function setAdminRole(email) {
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, { role: 'admin' });
  console.log(`✅ Admin role granted to: ${email}`);
  console.log('⚠️  User must sign out and sign back in.');
}

setAdminRole('admin@elecafe.ca');
```

**Run:** `node scripts/setAdminClaim.js`

### Option 2: Cloud Function

```typescript
// functions/src/index.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export const makeAdmin = functions.https.onCall(async (data, context) => {
  // Only existing admins can promote others
  if (context.auth?.token.role !== 'admin') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins can promote users'
    );
  }

  await admin.auth().setCustomUserClaims(data.userId, { role: 'admin' });
  return { success: true };
});
```

### Option 3: Firebase Console (Manual)

1. Go to Firebase Console → Authentication → Users
2. Click on user → "Set custom claims"
3. Add: `{"role": "admin"}`
4. User must sign out/in for changes to take effect

### Using Admin Role in Your App:

```tsx
const { currentUser, isAdmin } = useAuth();

if (isAdmin) {
  // Show admin features
}
```

**Important:** The user MUST sign out and sign back in after the custom claim is set for it to appear in their token.

---

## What Each Layer Blocks

| Layer | Blocks | Bypassable? |
|-------|--------|-------------|
| 1 - `useAuthGuard` | Guest clicking Rate/Purchase → redirects to login | ⚠️ Yes (JS disabled) |
| 2 - `ProtectedRoute` | Direct URL access to /orders, /checkout | ⚠️ Partially (client check) |
| 3 - Firestore Rules | Any unauthenticated database write | ✅ No (server-side) |

**Layer 3 is the only truly secure layer.** Layers 1 & 2 improve UX but can be bypassed in the browser. Always enforce permissions in Firestore Rules.

---

## Migration Checklist

- [ ] Deploy `firestore.rules` to Firebase Console
- [ ] Update `LoginPage` to handle `?returnUrl` query parameter
- [ ] Replace all protected actions with `requireAuth()` wrapper
- [ ] Test guest access to protected routes
- [ ] Verify Firestore rules in Firebase Console Simulator
- [ ] Set up admin custom claims for admin users
