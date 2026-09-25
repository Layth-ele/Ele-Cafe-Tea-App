# Admin Dashboard Guide

## Accessing the Admin Dashboard

The admin dashboard is accessible at `/admin` and is protected by authentication.

### Admin Credentials (Demo Mode)

**Email:** `admin@teacafe.com`  
**Password:** Any password (create account first)

When you sign up or log in with `admin@teacafe.com`, you'll automatically have admin privileges.

## Admin Features

### 1. **Overview Dashboard** (`/admin`)
- Total revenue statistics
- Order count and trends
- Product inventory overview
- Average order value metrics
- Recent orders list
- Low stock alerts

### 2. **Product Management** (`/admin/products`)
- **Add Products:** Create new tea products with full details
  - Product name (English & Arabic)
  - Description (English & Arabic)
  - Price, stock, category
  - Image URL
  - Featured status
- **Edit Products:** Update existing product information
- **Delete Products:** Remove products from catalog
- **Search & Filter:** Find products quickly
- **Stock Monitoring:** Visual alerts for low stock items

### 3. **Order Management** (`/admin/orders`)
- **View All Orders:** Complete order list with details
- **Filter Orders:** By status (pending, preparing, ready, delivered, cancelled)
- **Search Orders:** By order ID or customer name
- **Update Status:** Change order status with dropdown
- **Order Details:** View complete order information including:
  - Order items with images
  - Shipping address
  - Payment method
  - Order timeline
  - Customer notes

## Admin Navigation

The admin link appears in:
- Desktop navigation bar (with shield icon)
- User dropdown menu
- Mobile menu

Non-admin users cannot access `/admin` routes and will be redirected to the homepage.

## Production Deployment Notes

### Security Setup

In production, replace the email-based admin check with proper role management:

1. **Use Firebase Custom Claims:**
```javascript
// Set admin claim (Firebase Admin SDK - server-side only)
admin.auth().setCustomUserClaims(uid, { admin: true });

// Check in AuthContext
const tokenResult = await user.getIdTokenResult();
const isAdmin = tokenResult.claims.admin === true;
```

2. **Store User Roles in Firestore:**
```javascript
// In AuthContext
const userDoc = await getDoc(doc(db, 'users', user.uid));
const isAdmin = userDoc.data()?.isAdmin || false;
```

3. **Add Security Rules:**
```javascript
// Firestore rules
match /products/{productId} {
  allow read: if true;
  allow write: if request.auth.token.admin == true;
}

match /orders/{orderId} {
  allow read: if request.auth.uid == resource.data.userId 
    || request.auth.token.admin == true;
  allow write: if request.auth.token.admin == true;
}
```

### Firebase Integration

Currently using mock data. To integrate with Firebase:

1. **Products:** Replace local state with Firestore operations
2. **Orders:** Fetch from Firestore, update status in real-time
3. **Images:** Use Firebase Storage for product uploads
4. **Analytics:** Calculate stats from Firestore aggregations

## Feature Roadmap

Future enhancements for the admin panel:
- [ ] Bulk product import/export
- [ ] Advanced analytics charts
- [ ] Customer management
- [ ] Discount/coupon management
- [ ] Email notifications for orders
- [ ] Product review moderation
- [ ] Sales reports (daily, weekly, monthly)
- [ ] Inventory alerts and reordering
