/**
 * src/types/index.ts — convenience re-export barrel.
 * The schemas in src/schemas/ are the single source of truth.
 */

export type { Product, ProductCategory, CaffeineLevel, AntioxidantLevel, CreateProductInput, UpdateProductInput, ProductFilter } from '@/schemas/product.schema';
export type { Order, OrderItem, OrderStatus, OrderPayment } from '@/schemas/order.schema';
export type { UserProfile, UserRole, CreateUserProfileInput, UpdateUserProfileInput, AuthCredentials, SignupInput } from '@/schemas/user.schema';
// CartItem is exported from store/cartStore — that's the runtime
// source of truth (includes stock, bundle, gstApplicable). The
// `CartItemSchema` re-export below is the Zod-validated shape used
// for round-trip validation (e.g. when reading /carts/{userId} from
// Firestore). Both shapes match field-for-field after the round-3
// cart.schema cleanup; the rename is here so callers can import
// `CartItem` (runtime) and `CartItemSchema` (validation) without a
// name collision.
export type { CartItem as CartItemSchema } from '@/schemas/cart.schema';
export type { Address, CreateAddressInput, UpdateAddressInput, ShippingAddress } from '@/schemas/address.schema';
export type { Review, ReviewRating, CreateReviewInput, UpdateReviewInput } from '@/schemas/review.schema';
export type { Category, CreateCategoryInput, UpdateCategoryInput } from '@/schemas/category.schema';
export type { Promotion, CreatePromotionInput, UpdatePromotionInput } from '@/schemas/promotion.schema';

// Notification + Credit types
export type { Notification, NotificationType } from '@/schemas/notification.schema';
// NotificationData is server-only — used by Cloud Functions, not client code
export type { CreditAccount, CreditTransaction, CreditTxType, AdminCreditInput } from '@/schemas/credit.schema';
