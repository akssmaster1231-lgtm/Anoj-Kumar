import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type UserCredential,
} from 'firebase/auth';
import type { Product, Banner } from '@/types';
import type { UserProfile } from '@/auth-context';
import type { SellerProduct } from '@/types/supplier';

/**
 * ------------------------------------------------------------------
 * FIREBASE CONFIGURATION (firebaseConfig)
 * ------------------------------------------------------------------
 * आप यहाँ अपना Firebase प्रोजेक्ट क्रेडेंशियल्स (apiKey, authDomain आदि)
 * सीधे भर सकते हैं या फिर .env / firebase-applet-config.json का उपयोग कर सकते हैं।
 *
 * Example:
 * export const firebaseConfig = {
 *   apiKey: "AIzaSyYourApiKeyHere...",
 *   authDomain: "your-project-id.firebaseapp.com",
 *   projectId: "your-project-id",
 *   storageBucket: "your-project-id.appspot.com",
 *   messagingSenderId: "123456789012",
 *   appId: "1:123456789012:web:abcdef123456",
 * };
 */
export const firebaseConfig = {
  apiKey: "AIzaSyD2iqR43dzlWh3jeN8HHPUFXekNaXCMs8s",
  authDomain: "gen-lang-client-0914646976.firebaseapp.com",
  projectId: "gen-lang-client-0914646976",
  storageBucket: "gen-lang-client-0914646976.firebasestorage.app",
  messagingSenderId: "552581398009",
  appId: "1:552581398009:web:94e3d43130ef2106159128",
  measurementId: "",
  firestoreDatabaseId: "ai-studio-flipkart-389265a4-448e-4e98-bb37-5ffd4fbd4c4e",
};

// Initialize Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with configured databaseId
export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Initialize Firebase Authentication
export const auth = getAuth(app);
try {
  auth.useDeviceLanguage();
} catch {
  // ignore in non-browser environments
}

export const isFirebaseConfigured = Boolean(firebaseConfig && firebaseConfig.projectId && firebaseConfig.apiKey);

/**
 * Setup RecaptchaVerifier for Firebase Phone Auth
 * Supports container ID string or DOM element, invisible or normal size
 */
export function setupRecaptcha(
  containerIdOrElement: string | HTMLElement = 'firebase-recaptcha-container',
  size: 'invisible' | 'normal' = 'invisible'
): RecaptchaVerifier {
  if (typeof window === 'undefined') {
    throw new Error('Window is not available');
  }

  const win = window as unknown as { recaptchaVerifier?: RecaptchaVerifier };

  // Clear any existing recaptcha widget on the window if needed
  if (win.recaptchaVerifier) {
    try {
      win.recaptchaVerifier.clear();
    } catch (e) {
      console.warn('RecaptchaVerifier clear notice:', e);
    }
    delete win.recaptchaVerifier;
  }

  // Ensure target container exists and has clean DOM
  let targetEl: HTMLElement;
  if (typeof containerIdOrElement === 'string') {
    let el = document.getElementById(containerIdOrElement);
    if (!el) {
      el = document.createElement('div');
      el.id = containerIdOrElement;
      document.body.appendChild(el);
    }
    el.innerHTML = '';
    targetEl = el;
  } else {
    targetEl = containerIdOrElement;
    targetEl.innerHTML = '';
  }

  const verifier = new RecaptchaVerifier(auth, targetEl, {
    size,
    callback: () => {
      console.log('Firebase Phone Auth reCAPTCHA solved.');
    },
    'expired-callback': () => {
      console.warn('Firebase Phone Auth reCAPTCHA expired. Please try again.');
    },
  });

  win.recaptchaVerifier = verifier;
  return verifier;
}

/**
 * Send real SMS OTP to phone number using Firebase Phone Authentication
 * @param phone E.164 formatted phone number (e.g. +919876543210)
 * @param appVerifier RecaptchaVerifier instance
 */
export async function sendFirebasePhoneOtp(
  phone: string,
  appVerifier: RecaptchaVerifier
): Promise<ConfirmationResult> {
  return await signInWithPhoneNumber(auth, phone, appVerifier);
}

/**
 * Confirm OTP code and complete Firebase Phone Sign-in
 */
export async function verifyFirebasePhoneOtp(
  confirmationResult: ConfirmationResult,
  otpCode: string
): Promise<UserCredential> {
  return await confirmationResult.confirm(otpCode);
}

// Helper to strip undefined values recursively (Firestore disallows undefined)
export function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value !== undefined) {
        clean[key] = sanitizeForFirestore(value);
      }
    }
    return clean as unknown as T;
  }
  return obj;
}

// -------------------------------------------------------------
// PRODUCTS FIRESTORE REAL-TIME SYNC
// -------------------------------------------------------------

export function subscribeProducts(
  callback: (products: Product[]) => void,
  categoryFilter?: string
): () => void {
  try {
    const productsRef = collection(db, 'products');
    let q = query(productsRef);
    if (categoryFilter && categoryFilter !== 'all') {
      q = query(productsRef, where('category', '==', categoryFilter));
    }

    return onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const items: Product[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            items.push({
              id: docSnap.id,
              title: data.title || '',
              description: data.description || '',
              price: Number(data.price) || 0,
              mrp: Number(data.mrp) || Number(data.price) || 0,
              discount: Number(data.discount) || 0,
              category: data.category || 'fashion',
              images: Array.isArray(data.images) && data.images.length > 0 ? data.images : [data.image || 'https://images.pexels.com/photos/8532616/pexels-photo-8532616.jpeg'],
              rating: typeof data.rating === 'number' ? data.rating : 4.2,
              ratingCount: Number(data.ratingCount || data.rating_count || 120),
              brand: data.brand || 'AKSelling',
              inStock: data.inStock !== false && data.in_stock !== false,
              delivery: data.delivery || 'Free delivery in 2-3 days',
              sizes: data.sizes,
              colors: data.colors,
              neckType: data.neckType || data.neck_type,
              sleeveType: data.sleeveType || data.sleeve_type,
              fitType: data.fitType || data.fit_type,
              fabric: data.fabric,
              pickupLocation: data.pickupLocation,
              weight: data.weight,
              dimensions: data.dimensions,
            });
          });
          callback(items);
        } else {
          callback([]);
        }
      },
      (error) => {
        console.warn('Firestore products subscription notice:', error);
        callback([]);
      }
    );
  } catch (err) {
    console.warn('Failed to subscribe to Firestore products:', err);
    return () => {};
  }
}

export async function saveProductToFirestore(product: Product | SellerProduct): Promise<void> {
  try {
    const prodId = product.id;
    if (!prodId) return;
    const docRef = doc(db, 'products', prodId);
    
    // Normalizing attributes
    const rawData: Record<string, unknown> = {
      id: prodId,
      title: product.title || '',
      description: product.description || '',
      price: Number(product.price) || 0,
      mrp: Number(product.mrp) || Number(product.price) || 0,
      discount: Number(product.discount) || 0,
      category: product.category || 'fashion',
      images: Array.isArray(product.images) && product.images.length > 0
        ? product.images
        : ('image' in product && product.image ? [product.image] : []),
      rating: typeof product.rating === 'number' ? product.rating : 4.2,
      ratingCount: ('salesCount' in product ? product.salesCount : product.ratingCount) || 0,
      brand: product.brand || 'AKSelling',
      inStock: 'stock' in product ? (product.stock > 0 || product.status === 'live') : (product.inStock ?? true),
      delivery: ('delivery' in product ? product.delivery : null) || 'Free delivery by tomorrow',
      updatedAt: new Date().toISOString(),
    };

    if ('sizes' in product && product.sizes !== undefined) rawData.sizes = product.sizes;
    if ('colors' in product && product.colors !== undefined) rawData.colors = product.colors;
    if ('neckType' in product && product.neckType !== undefined) rawData.neckType = product.neckType;
    if ('sleeveType' in product && product.sleeveType !== undefined) rawData.sleeveType = product.sleeveType;
    if ('fitType' in product && product.fitType !== undefined) rawData.fitType = product.fitType;
    if ('fabric' in product && product.fabric !== undefined) rawData.fabric = product.fabric;
    if ('pickupLocation' in product && product.pickupLocation !== undefined) rawData.pickupLocation = product.pickupLocation;
    if ('weight' in product && product.weight !== undefined) rawData.weight = product.weight;
    if ('dimensions' in product && product.dimensions !== undefined) rawData.dimensions = product.dimensions;

    const dataToSave = sanitizeForFirestore(rawData);
    await setDoc(docRef, dataToSave, { merge: true });
  } catch (err) {
    console.error('Failed to save product to Firestore:', err);
  }
}

export async function deleteProductFromFirestore(productId: string): Promise<void> {
  try {
    if (!productId) return;
    await deleteDoc(doc(db, 'products', productId));
  } catch (err) {
    console.error('Failed to delete product from Firestore:', err);
  }
}

export async function seedInitialProductsIfEmpty(initialProductsList: Product[]): Promise<void> {
  try {
    const productsRef = collection(db, 'products');
    const snap = await getDocs(productsRef);
    if (snap.empty && initialProductsList.length > 0) {
      console.log('Seeding initial products into Firestore catalog...');
      const batchPromises = initialProductsList.map((prod) => saveProductToFirestore(prod));
      await Promise.all(batchPromises);
      console.log('Firestore product catalog seeded successfully.');
    }
  } catch (err) {
    console.warn('Initial products seed notice:', err);
  }
}

// -------------------------------------------------------------
// ORDERS FIRESTORE REAL-TIME SYNC
// -------------------------------------------------------------

export interface FirestoreOrder {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  items: Array<{
    product_id: string;
    product_title: string;
    product_image: string;
    quantity: number;
    price: number;
    sku?: string;
    size?: string;
    color?: string;
  }>;
  total_amount: number;
  payment_method: string;
  payment_status?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  status: string;
  created_at: string;
  updated_at?: string;
  awb_code?: string;
  courier_name?: string;
}

export function subscribeOrders(
  userPhone: string | undefined,
  callback: (orders: FirestoreOrder[]) => void
): () => void {
  try {
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef);

    return onSnapshot(
      q,
      (snapshot) => {
        const orderList: FirestoreOrder[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as FirestoreOrder;
          // If filtering by user phone
          if (!userPhone || !data.customer_phone || data.customer_phone.includes(userPhone.replace(/\D/g, '').slice(-10))) {
            orderList.push({
              ...data,
              id: docSnap.id,
            });
          }
        });

        // Sort latest first
        orderList.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        callback(orderList);
      },
      (error) => {
        console.warn('Firestore orders subscription notice:', error);
        callback([]);
      }
    );
  } catch (err) {
    console.warn('Failed to subscribe to Firestore orders:', err);
    return () => {};
  }
}

export async function saveOrderToFirestore(order: FirestoreOrder): Promise<void> {
  try {
    if (!order.id) return;
    const docRef = doc(db, 'orders', order.id);
    const cleanedOrder = sanitizeForFirestore({
      ...order,
      updated_at: new Date().toISOString(),
    });
    await setDoc(docRef, cleanedOrder, { merge: true });
  } catch (err) {
    console.error('Failed to save order to Firestore:', err);
  }
}

export async function updateOrderStatusInFirestore(
  orderId: string,
  newStatus: string,
  extra?: Record<string, unknown>
): Promise<void> {
  try {
    if (!orderId) return;
    const docRef = doc(db, 'orders', orderId);
    const cleanExtra = extra ? sanitizeForFirestore(extra) : {};
    await updateDoc(docRef, {
      status: newStatus,
      updated_at: new Date().toISOString(),
      ...cleanExtra,
    });
  } catch (err) {
    console.error('Failed to update order status in Firestore:', err);
  }
}

// -------------------------------------------------------------
// USER PROFILES FIRESTORE REAL-TIME SYNC
// -------------------------------------------------------------

export async function saveUserProfileToFirestore(profile: UserProfile): Promise<void> {
  try {
    const userId = profile.id || profile.phone || profile.email;
    if (!userId || userId === 'guest') return;
    const userDoc = doc(db, 'users', userId);
    const cleaned = sanitizeForFirestore({
      ...profile,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(userDoc, cleaned, { merge: true });
  } catch (err) {
    console.warn('Firestore user profile save notice:', err);
  }
}

export function subscribeUserProfile(
  userId: string,
  callback: (profile: UserProfile | null) => void
): () => void {
  try {
    if (!userId || userId === 'guest') return () => {};
    const userDoc = doc(db, 'users', userId);
    return onSnapshot(
      userDoc,
      (docSnap) => {
        if (docSnap.exists()) {
          callback(docSnap.data() as UserProfile);
        } else {
          callback(null);
        }
      },
      (err) => {
        console.warn('User profile subscription notice:', err);
        callback(null);
      }
    );
  } catch {
    return () => {};
  }
}

// -------------------------------------------------------------
// BANNERS FIRESTORE REAL-TIME SYNC
// -------------------------------------------------------------

export function subscribeBanners(callback: (banners: Banner[]) => void): () => void {
  try {
    const bannersRef = collection(db, 'banners');
    return onSnapshot(
      bannersRef,
      (snapshot) => {
        if (!snapshot.empty) {
          const list: Banner[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            list.push({
              id: docSnap.id,
              title: data.title || '',
              subtitle: data.subtitle || '',
              cta: data.cta || 'Shop Now',
              image: data.image || '',
              gradient: data.gradient || 'from-blue-600 to-indigo-800',
            });
          });
          callback(list);
        } else {
          callback([]);
        }
      },
      (err) => {
        console.warn('Firestore banners subscription notice:', err);
        callback([]);
      }
    );
  } catch {
    return () => {};
  }
}

export async function saveBannerToFirestore(banner: Banner): Promise<void> {
  try {
    if (!banner.id) return;
    const bannerDoc = doc(db, 'banners', banner.id);
    const cleaned = sanitizeForFirestore(banner);
    await setDoc(bannerDoc, cleaned, { merge: true });
  } catch (err) {
    console.error('Failed to save banner to Firestore:', err);
  }
}

export async function deleteBannerFromFirestore(id: string): Promise<void> {
  try {
    if (!id) return;
    await deleteDoc(doc(db, 'banners', id));
  } catch (err) {
    console.error('Failed to delete banner from Firestore:', err);
  }
}

// -------------------------------------------------------------
// SELLER KYC & VERIFICATION FIRESTORE REAL-TIME SYNC
// -------------------------------------------------------------

export interface SellerKycRecord {
  id: string;
  seller_id: string;
  business_name: string;
  owner_name: string;
  registration_type: 'gst' | 'pan';
  gst_number?: string | null;
  pan_number?: string | null;
  aadhar_masked?: string | null;
  mobile_number: string;
  is_mobile_verified: boolean;
  email: string;
  support_email: string;
  pickup_address: string;
  city: string;
  state: string;
  pincode: string;
  bank_beneficiary: string;
  account_number: string;
  ifsc_code: string;
  bank_name: string;
  account_type?: string;
  upi_id?: string;
  status: 'verified_active' | 'approved' | 'pending' | 'rejected';
  is_diamond_certified: boolean;
  commission_rate: number;
  compliance_status: string;
  verification_audit_id?: string;
  ip_address_hash?: string;
  device_agent?: string;
  validation_logs: Array<{
    field: string;
    status: 'valid' | 'invalid';
    timestamp: string;
    message: string;
  }>;
  registered_at: string;
  updated_at: string;
}

export interface SellerVerificationAudit {
  id: string;
  seller_id: string;
  business_name: string;
  mobile_number: string;
  is_otp_verified: boolean;
  document_type: 'gst' | 'pan';
  document_reference: string;
  bank_account_verified: boolean;
  bank_name: string;
  ifsc_code: string;
  penny_drop_status: string;
  compliance_passed: boolean;
  support_contact: string;
  user_agent: string;
  verified_at: string;
  logs: Array<{
    field: string;
    status: 'valid' | 'invalid';
    timestamp: string;
    message: string;
  }>;
}

export async function saveSellerKycToFirestore(seller: SellerKycRecord): Promise<void> {
  try {
    if (!seller.id && !seller.seller_id) return;
    const docId = seller.seller_id || seller.id;
    const sellerDoc = doc(db, 'sellers', docId);
    const cleaned = sanitizeForFirestore({
      ...seller,
      support_email: 'support.akselling@gmail.com',
      updated_at: new Date().toISOString(),
    });
    await setDoc(sellerDoc, cleaned, { merge: true });
    console.log(`[Firestore] Seller KYC saved successfully: ${docId}`);
  } catch (err) {
    console.warn('Firestore seller KYC save notice:', err);
  }
}

export async function logSellerVerificationAudit(audit: SellerVerificationAudit): Promise<void> {
  try {
    if (!audit.id && !audit.seller_id) return;
    const auditDocId = audit.id || `AUDIT_${audit.seller_id}_${Date.now()}`;
    const auditDoc = doc(db, 'seller_verification_audits', auditDocId);
    const cleaned = sanitizeForFirestore({
      ...audit,
      id: auditDocId,
      support_contact: 'support.akselling@gmail.com',
      verified_at: audit.verified_at || new Date().toISOString(),
    });
    await setDoc(auditDoc, cleaned, { merge: true });
    console.log(`[Firestore] Seller verification audit logged: ${auditDocId}`);
  } catch (err) {
    console.warn('Firestore seller audit log notice:', err);
  }
}

export function subscribeSellerKyc(
  sellerId: string,
  callback: (record: SellerKycRecord | null) => void
): () => void {
  try {
    if (!sellerId) return () => {};
    const sellerDoc = doc(db, 'sellers', sellerId);
    return onSnapshot(
      sellerDoc,
      (docSnap) => {
        if (docSnap.exists()) {
          callback(docSnap.data() as SellerKycRecord);
        } else {
          callback(null);
        }
      },
      (err) => {
        console.warn('Seller KYC subscription notice:', err);
        callback(null);
      }
    );
  } catch {
    return () => {};
  }
}
