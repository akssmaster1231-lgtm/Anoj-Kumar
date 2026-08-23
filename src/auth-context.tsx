import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
  type ConfirmationResult,
  type RecaptchaVerifier,
} from 'firebase/auth';
import {
  auth,
  saveUserProfileToFirestore,
  subscribeUserProfile,
  sendFirebasePhoneOtp,
  verifyFirebasePhoneOtp,
} from '@/firebase';

export interface UserProfile {
  id: string;
  name: string;
  phone: string;
  email: string;
  avatar: string;
  language: string;
  notificationEnabled: boolean;
  addresses: AddressEntry[];
  savedCards: CardEntry[];
  devices: DeviceEntry[];
}

export interface AddressEntry {
  id: string;
  label: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
}

export interface CardEntry {
  id: string;
  type: string;
  last4: string;
  holderName: string;
}

export interface DeviceEntry {
  id: string;
  name: string;
  lastActive: string;
}

interface AuthContextType {
  user: UserProfile | null;
  authInitialized: boolean;
  isAuthenticating: boolean;
  sendPhoneOTP: (phone: string, appVerifier: RecaptchaVerifier) => Promise<{ error: string | null; confirmationResult?: ConfirmationResult }>;
  confirmPhoneOTP: (confirmationResult: ConfirmationResult, otpCode: string, phone: string, name?: string) => Promise<{ error: string | null; user?: UserProfile }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  addAddress: (address: Omit<AddressEntry, 'id'>) => Promise<void>;
  removeAddress: (id: string) => Promise<void>;
  addCard: (card: Omit<CardEntry, 'id'>) => Promise<void>;
  removeCard: (id: string) => Promise<void>;
  removeDevice: (id: string) => Promise<void>;
}

const defaultProfileTemplate: UserProfile = {
  id: 'guest',
  name: 'User',
  phone: '',
  email: '',
  avatar: '',
  language: 'English',
  notificationEnabled: true,
  addresses: [],
  savedCards: [],
  devices: [
    { id: 'd1', name: 'Web Browser', lastActive: 'Active now' },
  ],
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const saveLocalUser = (profile: UserProfile | null) => {
    try {
      if (profile) {
        localStorage.setItem('akselling_user_profile', JSON.stringify(profile));
      } else {
        localStorage.removeItem('akselling_user_profile');
      }
    } catch {
      // ignore
    }
  };

  // Sync with Firebase Auth state on startup
  useEffect(() => {
    let isMounted = true;

    // Restore any locally saved user session immediately (so reloads don't blank-screen)
    try {
      const stored = localStorage.getItem('akselling_user_profile');
      if (stored) {
        const parsed: UserProfile = JSON.parse(stored);
        if (parsed && parsed.id && parsed.id !== 'guest') {
          setUser(parsed);
          setAuthInitialized(true);
        }
      }
    } catch {
      // ignore
    }

    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!isMounted) return;

      if (fbUser) {
        // Genuine logged in Firebase user
        const existingStored = localStorage.getItem('akselling_user_profile');
        const prev: UserProfile | null = existingStored ? JSON.parse(existingStored) : null;

        const resolvedProfile: UserProfile = {
          id: fbUser.uid,
          name: fbUser.displayName || prev?.name || fbUser.email?.split('@')[0] || (fbUser.phoneNumber ? `User ${fbUser.phoneNumber.slice(-4)}` : 'AKSelling User'),
          phone: fbUser.phoneNumber || prev?.phone || '',
          email: fbUser.email || prev?.email || '',
          avatar: fbUser.photoURL || prev?.avatar || '',
          language: prev?.language || 'English',
          notificationEnabled: prev?.notificationEnabled ?? true,
          addresses: prev?.addresses || [],
          savedCards: prev?.savedCards || [],
          devices: prev?.devices || [
            { id: 'd1', name: navigator.userAgent.includes('Mobile') ? 'Mobile Browser' : 'Desktop Browser', lastActive: 'Active now' }
          ],
        };

        setUser(resolvedProfile);
        saveLocalUser(resolvedProfile);
        saveUserProfileToFirestore(resolvedProfile);
      } else {
        // Strictly unauthenticated - lock out protected screens
        setUser(null);
        saveLocalUser(null);
      }
      setAuthInitialized(true);
    });

    // Safety timeout: if Firebase Auth never responds within 4 seconds,
    // force-initialize so the app doesn't stay on a blank white loading screen forever.
    const safetyTimer = setTimeout(() => {
      if (isMounted && !authInitialized) {
        console.warn('Firebase Auth initialization timed out — proceeding in offline mode.');
        setAuthInitialized(true);
      }
    }, 4000);

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Real-time Firestore user profile sync for active user
  useEffect(() => {
    const activeId = user?.id || user?.phone || user?.email;
    if (!activeId || activeId === 'guest') return;

    const unsubscribe = subscribeUserProfile(activeId, (remoteProfile) => {
      if (remoteProfile) {
        setUser((prev) => {
          if (!prev) return remoteProfile;
          const merged = { ...prev, ...remoteProfile };
          saveLocalUser(merged);
          return merged;
        });
      }
    });
    return () => unsubscribe();
  }, [user?.id, user?.phone, user?.email]);

  // Firebase Phone Auth: Send OTP
  const sendPhoneOTP = useCallback(async (phone: string, appVerifier: RecaptchaVerifier) => {
    setIsAuthenticating(true);
    try {
      const confirmationResult = await sendFirebasePhoneOtp(phone, appVerifier);
      setIsAuthenticating(false);
      return {
        error: null,
        confirmationResult,
      };
    } catch (err: unknown) {
      setIsAuthenticating(false);
      console.warn('Firebase Phone Auth send notice:', err);
      let errorMsg = 'Could not send SMS OTP. Please check your mobile number.';
      if (err instanceof Error) {
        if (err.message.includes('auth/invalid-phone-number')) {
          errorMsg = 'Invalid phone number. Please enter a valid 10-digit number (e.g. 9876543210).';
        } else if (err.message.includes('auth/quota-exceeded')) {
          errorMsg = 'SMS limit reached for today. Please try again later or use Google Sign-in.';
        } else if (err.message.includes('auth/too-many-requests')) {
          errorMsg = 'Too many requests. Please wait a moment before trying again.';
        } else {
          // General friendly message without scary API error banners
          errorMsg = err.message.replace(/Firebase:?\s*Error\s*\(auth\/[^)]+\):?\s*/gi, '');
        }
      }
      return {
        error: errorMsg,
      };
    }
  }, []);

  // Firebase Phone Auth: Confirm OTP and complete Sign-In
  const confirmPhoneOTP = useCallback(async (
    confirmationResult: ConfirmationResult,
    otpCode: string,
    phone: string,
    name?: string
  ) => {
    setIsAuthenticating(true);
    try {
      const userCredential = await verifyFirebasePhoneOtp(confirmationResult, otpCode);
      const fbUser = userCredential.user;

      const profile: UserProfile = {
        ...defaultProfileTemplate,
        id: fbUser.uid,
        name: name || fbUser.displayName || `User ${phone.slice(-4)}`,
        phone: fbUser.phoneNumber || phone,
      };

      // Real-time Cloud Firestore persistence
      await saveUserProfileToFirestore(profile);
      setUser(profile);
      saveLocalUser(profile);
      setIsAuthenticating(false);
      return { error: null, user: profile };
    } catch (err: unknown) {
      setIsAuthenticating(false);
      console.warn('Firebase Phone Auth verify OTP error:', err);
      let errorMsg = 'Invalid OTP code. Please enter the correct 6-digit code received on your phone.';
      if (err instanceof Error) {
        if (err.message.includes('auth/invalid-verification-code')) {
          errorMsg = 'Invalid verification code. Please check and re-enter the 6-digit OTP.';
        } else if (err.message.includes('auth/code-expired')) {
          errorMsg = 'OTP has expired. Please request a new verification code.';
        } else {
          errorMsg = err.message.replace(/Firebase:?\s*Error\s*\(auth\/[^)]+\):?\s*/gi, '');
        }
      }
      return { error: errorMsg };
    }
  }, []);

  // Real Google Sign-In using Firebase Authentication Popup
  const signInWithGoogle = useCallback(async () => {
    setIsAuthenticating(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account',
      });

      const result = await signInWithPopup(auth, provider);
      const fbUser = result?.user;

      if (!fbUser) {
        throw new Error('No user returned from Google popup');
      }

      // Fetch real dynamic Google credentials
      const realGoogleProfile: UserProfile = {
        id: fbUser.uid,
        name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Google User',
        email: fbUser.email || '',
        phone: fbUser.phoneNumber || '',
        avatar: fbUser.photoURL || '',
        language: 'English',
        notificationEnabled: true,
        addresses: [],
        savedCards: [],
        devices: [
          {
            id: 'd_' + Date.now(),
            name: typeof navigator !== 'undefined' && navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Web Browser',
            lastActive: 'Active now',
          },
        ],
      };

      // Save real user account to Cloud Firestore
      await saveUserProfileToFirestore(realGoogleProfile);
      setUser(realGoogleProfile);
      saveLocalUser(realGoogleProfile);
      setIsAuthenticating(false);
      return { error: null, user: realGoogleProfile };
    } catch (err: unknown) {
      setIsAuthenticating(false);
      console.warn('Google Sign-In popup notice:', err);

      let msg = 'Google Sign-In failed. Please try again.';
      if (err instanceof Error) {
        if (err.message.includes('auth/popup-closed-by-user')) {
          msg = 'Google sign-in popup was closed. Please try again.';
        } else if (err.message.includes('auth/popup-blocked')) {
          msg = 'Pop-up window was blocked by browser. Please allow pop-ups for this site.';
        } else if (err.message.includes('auth/cancelled-popup-request')) {
          msg = 'Another sign-in attempt was already in progress.';
        } else {
          msg = err.message.replace(/Firebase:?\s*Error\s*\(auth\/[^)]+\):?\s*/gi, '');
        }
      }

      return { error: msg };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await fbSignOut(auth);
    } catch (e) {
      console.warn('Firebase sign-out notice:', e);
    }
    setUser(null);
    saveLocalUser(null);
  }, []);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    setUser(prev => {
      const base = prev || defaultProfileTemplate;
      const updated = { ...base, ...updates };
      saveLocalUser(updated);
      saveUserProfileToFirestore(updated);
      return updated;
    });
  }, []);

  const addAddress = useCallback(async (address: Omit<AddressEntry, 'id'>) => {
    setUser(prev => {
      const base = prev || defaultProfileTemplate;
      const newAddr = { ...address, id: 'addr_' + Date.now() };
      const updated = { ...base, addresses: [...base.addresses, newAddr] };
      saveLocalUser(updated);
      saveUserProfileToFirestore(updated);
      return updated;
    });
  }, []);

  const removeAddress = useCallback(async (id: string) => {
    setUser(prev => {
      const base = prev || defaultProfileTemplate;
      const updated = { ...base, addresses: base.addresses.filter(a => a.id !== id) };
      saveLocalUser(updated);
      saveUserProfileToFirestore(updated);
      return updated;
    });
  }, []);

  const addCard = useCallback(async (card: Omit<CardEntry, 'id'>) => {
    setUser(prev => {
      const base = prev || defaultProfileTemplate;
      const newCard = { ...card, id: 'card_' + Date.now() };
      const updated = { ...base, savedCards: [...base.savedCards, newCard] };
      saveLocalUser(updated);
      saveUserProfileToFirestore(updated);
      return updated;
    });
  }, []);

  const removeCard = useCallback(async (id: string) => {
    setUser(prev => {
      const base = prev || defaultProfileTemplate;
      const updated = { ...base, savedCards: base.savedCards.filter(c => c.id !== id) };
      saveLocalUser(updated);
      saveUserProfileToFirestore(updated);
      return updated;
    });
  }, []);

  const removeDevice = useCallback(async (id: string) => {
    setUser(prev => {
      const base = prev || defaultProfileTemplate;
      const updated = { ...base, devices: base.devices.filter(d => d.id !== id) };
      saveLocalUser(updated);
      saveUserProfileToFirestore(updated);
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        authInitialized,
        isAuthenticating,
        sendPhoneOTP,
        confirmPhoneOTP,
        signInWithGoogle,
        signOut,
        updateProfile,
        addAddress,
        removeAddress,
        addCard,
        removeCard,
        removeDevice,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
