# Tea Cafe Schema Structure

This document provides an overview of the comprehensive schema system created for the Tea Cafe e-commerce application.

## 📁 Schema Directory Structure

```
src/schemas/
├── index.ts                  # Central export with common utilities
├── README.md                 # Detailed documentation
├── examples.ts               # Usage examples with Firebase
│
├── Core Business Entities
├── product.schema.ts         # Products, categories, filtering
├── order.schema.ts           # Orders, order items, status tracking
├── user.schema.ts            # User profiles, authentication
├── gift.schema.ts            # Gift builder functionality
├── cart.schema.ts            # Shopping cart management
├── address.schema.ts         # Shipping & saved addresses
│
└── Future Functionality
    ├── category.schema.ts    # Product categorization
    ├── payment.schema.ts     # Payment processing (Stripe, PayPal)
    ├── review.schema.ts      # Product reviews & ratings
    ├── promotion.schema.ts   # Discount codes & promotions
    └── analytics.schema.ts   # Sales & customer analytics
```

---

## 🎯 Core Schemas

### 1. Product Schema (`product.schema.ts`)

**Main Types:**
- `Product` - Full product entity
- `CreateProductInput` - For creating products (admin)
- `UpdateProductInput` - For updating products (admin)
- `ProductFilter` - For search/filtering
- `ProductCategory` - Enum of categories

**Validation:**
- ✅ Price must be positive
- ✅ Stock cannot be negative
- ✅ Image must be valid URL
- ✅ Description min 10 characters
- ✅ Bilingual support (English/Arabic)

**Usage:**
```typescript
import { productSchema, validateProduct } from '@/schemas';

const result = validateProduct(productData);
if (result.success) {
  const product: Product = result.data;
}
```

---

### 2. Order Schema (`order.schema.ts`)

**Main Types:**
- `Order` - Complete order entity
- `OrderItem` - Individual products in order
- `CreateOrderInput` - For creating orders
- `UpdateOrderStatusInput` - For admin status updates
- `OrderStatus` - 'pending' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
- `PaymentMethod` - 'cash' | 'card' | 'wallet'

**Features:**
- ✅ Nested validation for items
- ✅ Shipping address validation
- ✅ Order status workflow
- ✅ Tracking number support
- ✅ Order notes and metadata

---

### 3. User Schema (`user.schema.ts`)

**Main Types:**
- `UserProfile` - User account data
- `AuthCredentials` - Login credentials
- `SignupInput` - Registration data
- `UpdateUserProfileInput` - Profile updates
- `UserRole` - 'user' | 'admin'

**Security:**
- ✅ Email validation
- ✅ Password min 8 characters
- ✅ Admin status protection
- ✅ Phone number validation
- ✅ User preferences (language, theme)

---

### 4. Gift Schema (`gift.schema.ts`)

**Main Types:**
- `Gift` - Gift package entity
- `GiftItem` - Products in gift
- `CreateGiftInput` - For creating gifts
- `WrappingStyle` - 'classic' | 'modern' | 'luxury'

**Features:**
- ✅ Custom message (max 500 chars)
- ✅ Recipient information
- ✅ Delivery date scheduling
- ✅ Gift status tracking

---

### 5. Cart Schema (`cart.schema.ts`)

**Main Types:**
- `Cart` - User shopping cart
- `CartItem` - Individual cart items
- `AddToCartInput` - Adding products
- `UpdateCartItemInput` - Updating quantities

**Features:**
- ✅ Stock limit validation
- ✅ Quantity validation
- ✅ Cart synchronization

---

### 6. Address Schema (`address.schema.ts`)

**Main Types:**
- `Address` - Saved user addresses
- `ShippingAddress` - Order delivery address
- `CreateAddressInput` - Add new address
- `UpdateAddressInput` - Update existing address

**Validation:**
- ✅ Phone number format
- ✅ Required fields (name, city, country)
- ✅ Default address flag
- ✅ Max length constraints

---

## 🚀 Future Schemas

### 7. Payment Schema (`payment.schema.ts`)

**Ready for:**
- Stripe integration
- PayPal integration
- Bank transfers
- Payment status tracking
- Refund management

**Types:**
- `Payment` - Payment transaction
- `CreatePaymentIntentInput` - Initiate payment
- `StripePaymentIntent` - Stripe-specific
- `PaymentStatus` - 'pending' | 'completed' | 'failed' | 'refunded'

---

### 8. Review Schema (`review.schema.ts`)

**Ready for:**
- 5-star rating system
- Review comments
- Image attachments
- Verified purchase badges
- Helpful votes

**Types:**
- `Review` - Product review
- `CreateReviewInput` - Submit review
- `ReviewFilter` - Filter reviews
- `ReviewRating` - 1-5 stars

---

### 9. Promotion Schema (`promotion.schema.ts`)

**Ready for:**
- Discount codes
- Percentage or fixed discounts
- Usage limits
- Date ranges
- Product/category restrictions

**Types:**
- `Promotion` - Discount code
- `CreatePromotionInput` - Create promotion
- `ApplyPromotionInput` - Validate code
- `PromotionUsage` - Track usage

---

### 10. Analytics Schema (`analytics.schema.ts`)

**Ready for:**
- Sales reports
- Customer insights
- Product performance
- Revenue tracking
- Retention metrics

**Types:**
- `SalesAnalytics` - Revenue & orders
- `CustomerAnalytics` - Customer metrics
- `ProductPerformance` - Product stats
- `AnalyticsQuery` - Query parameters

---

### 11. Category Schema (`category.schema.ts`)

**Features:**
- Category management
- Bilingual names
- Custom ordering
- Icon/image support

---

## 🛠️ Common Utilities

The `index.ts` file exports shared utilities:

### Pagination
```typescript
import { paginationSchema, PaginatedResponse } from '@/schemas';

const params = paginationSchema.parse({
  page: 1,
  limit: 20,
  sortBy: 'createdAt',
  sortOrder: 'desc'
});
```

### API Response Wrappers
```typescript
import { createSuccessResponse, createErrorResponse } from '@/schemas';

// Success
const response = createSuccessResponse(products);

// Error
const error = createErrorResponse('VALIDATION_ERROR', 'Invalid data');
```

### Firebase Timestamp Conversion
```typescript
import { convertFirebaseTimestamp } from '@/schemas';

const date = convertFirebaseTimestamp(firestoreTimestamp);
```

---

## 📝 Usage Guidelines

### 1. Always Validate External Data

```typescript
import { validateProduct } from '@/schemas';

const result = validateProduct(userData);
if (!result.success) {
  console.error('Validation failed:', result.error);
  return;
}

const product = result.data; // Type-safe!
```

### 2. Use with React Hook Form

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createProductSchema } from '@/schemas';

const form = useForm({
  resolver: zodResolver(createProductSchema),
});
```

### 3. Firebase Integration

```typescript
import { collection, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { validateCreateProduct } from '@/schemas';

async function createProduct(data: unknown) {
  const result = validateCreateProduct(data);
  
  if (!result.success) {
    throw new Error(result.error.message);
  }

  const docRef = await addDoc(collection(db, 'products'), {
    ...result.data,
    createdAt: new Date(),
  });

  return docRef.id;
}
```

---

## ✅ Schema Benefits

1. **Type Safety** - Full TypeScript support with inferred types
2. **Runtime Validation** - Catch errors before they reach Firebase
3. **Data Consistency** - Enforce business rules across the app
4. **Developer Experience** - Autocomplete and type checking
5. **Error Messages** - Clear validation error messages
6. **Reusability** - Share schemas between frontend/backend
7. **Documentation** - Self-documenting code
8. **Future-Proof** - Ready for new features

---

## 🔄 Integration with Existing Code

### Update Imports

Replace imports from `@/types` with `@/schemas`:

```typescript
// Old
import { Product, Order } from '@/types';

// New (with validation)
import { Product, Order, validateProduct } from '@/schemas';
```

### Both Work Together

You can keep using `@/types/index.ts` for compatibility, or migrate gradually to use schemas directly.

---

## 📚 Next Steps

1. **Migrate existing Firebase calls** to use schema validation
2. **Update forms** to use Zod resolvers
3. **Add error handling** for validation failures
4. **Implement payment processing** using payment schemas
5. **Add review system** using review schemas
6. **Build analytics dashboard** using analytics schemas

---

## 🔗 Resources

- [Zod Documentation](https://zod.dev/)
- [React Hook Form + Zod](https://react-hook-form.com/get-started#SchemaValidation)
- [Firebase TypeScript](https://firebase.google.com/docs/reference/js)

---

**Last Updated:** April 13, 2026
