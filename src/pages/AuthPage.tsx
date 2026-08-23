import { useState, useEffect, useRef, type FormEvent } from 'react';
import { ChevronLeft, Phone, Loader2, ShieldCheck, X, CheckCircle2, RotateCcw, MessageSquare, Lock, Mail } from 'lucide-react';
import type { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';
import { useAuth } from '@/auth-context';
import { setupRecaptcha } from '@/firebase';

interface AuthPageProps {
  onClose?: () => void;
  onSuccess: () => void;
  isStrictGate?: boolean;
}

export default function AuthPage({ onClose, onSuccess, isStrictGate = false }: AuthPageProps) {
  const { sendPhoneOTP, confirmPhoneOTP, signInWithGoogle } = useAuth();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === 'otp' && countdown > 0) {
      timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    } else if (countdown === 0) {
      setCanResend(true);
    }
    return () => clearTimeout(timer);
  }, [step, countdown]);

  // Clean up any recaptcha on unmount
  useEffect(() => {
    return () => {
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const getOrCreateRecaptcha = (): RecaptchaVerifier => {
    const verifier = setupRecaptcha('firebase-auth-recaptcha-container', 'invisible');
    recaptchaVerifierRef.current = verifier;
    return verifier;
  };

  const handleSendOTP = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setOtpNotice(null);
    const cleanedDigits = phone.replace(/\D/g, '');
    if (cleanedDigits.length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }
    const fullPhone = '+91' + cleanedDigits.slice(-10);

    setIsSendingOtp(true);
    try {
      const appVerifier = getOrCreateRecaptcha();
      const res = await sendPhoneOTP(fullPhone, appVerifier);
      if (res.error || !res.confirmationResult) {
        setError(res.error || 'Failed to send OTP via Firebase SMS Gateway.');
        setIsSendingOtp(false);
        return;
      }
      setConfirmationResult(res.confirmationResult);
      setOtpNotice(`Firebase SMS OTP sent to +91 ${cleanedDigits.slice(-10)}. Please check your phone messages.`);
      setOtp('');
      setStep('otp');
      setCountdown(60);
      setCanResend(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send Firebase SMS OTP.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleResend = async () => {
    if (!canResend) return;
    setError('');
    const cleanedDigits = phone.replace(/\D/g, '');
    const fullPhone = '+91' + cleanedDigits.slice(-10);

    setIsSendingOtp(true);
    try {
      const appVerifier = getOrCreateRecaptcha();
      const res = await sendPhoneOTP(fullPhone, appVerifier);
      if (res.error || !res.confirmationResult) {
        setError(res.error || 'Failed to resend OTP.');
        setIsSendingOtp(false);
        return;
      }
      setConfirmationResult(res.confirmationResult);
      setOtpNotice(`New Firebase SMS OTP sent to +91 ${cleanedDigits.slice(-10)}.`);
      setOtp('');
      setCountdown(60);
      setCanResend(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend SMS OTP.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOTP = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (otp.length < 6) {
      setError('Please enter the complete 6-digit OTP code.');
      return;
    }
    if (!confirmationResult) {
      setError('OTP session expired. Please request a new OTP.');
      setStep('phone');
      return;
    }

    setIsVerifyingOtp(true);
    const fullPhone = '+91' + phone.replace(/\D/g, '').slice(-10);
    const { error: verifyError } = await confirmPhoneOTP(confirmationResult, otp, fullPhone, name || undefined);
    setIsVerifyingOtp(false);

    if (verifyError) {
      setError(verifyError);
      return;
    }
    onSuccess();
  };

  const handleGoogle = async () => {
    setError('');
    setIsGoogleLoading(true);
    const { error: googleError } = await signInWithGoogle();
    setIsGoogleLoading(false);
    if (googleError) {
      setError(googleError);
    } else {
      onSuccess();
    }
  };

  const isAnyLoading = isGoogleLoading || isSendingOtp || isVerifyingOtp;

  return (
    <div className={`bg-white flex flex-col ${isStrictGate ? 'min-h-screen' : 'fixed inset-0 z-[80] animate-slide-up'}`}>
      {/* Invisible container for Firebase Phone Auth Recaptcha */}
      <div id="firebase-auth-recaptcha-container" />

      <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 bg-white sticky top-0 z-10">
        {step === 'otp' ? (
          <button
            onClick={() => setStep('phone')}
            className="p-1.5 -ml-1 text-gray-700 hover:bg-gray-100 rounded-full transition-colors flex items-center gap-1 text-xs font-semibold"
          >
            <ChevronLeft size={20} />
            <span>Back</span>
          </button>
        ) : !isStrictGate && onClose ? (
          <button onClick={onClose} className="p-1.5 -ml-1 text-gray-700 hover:bg-gray-100 rounded-full">
            <ChevronLeft size={22} />
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-flipkart-600">
            <Lock size={14} />
            <span>AKSelling Security</span>
          </div>
        )}

        <h1 className="text-base font-bold text-gray-800">
          {step === 'phone' ? (isStrictGate ? 'AKSelling Sign In' : 'Login or Sign Up') : 'Verify Mobile OTP'}
        </h1>

        {!isStrictGate && onClose ? (
          <button onClick={onClose} className="p-1.5 -mr-1 text-gray-400 hover:bg-gray-100 rounded-full">
            <X size={20} />
          </button>
        ) : (
          <div className="w-6" />
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 max-w-md mx-auto w-full">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#2874f0] to-blue-600 shadow-md shadow-blue-500/20 flex items-center justify-center mb-3">
            <span className="text-2xl font-black text-white tracking-wider">AK</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Welcome to AKSelling</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1 text-center max-w-xs">
            {step === 'phone'
              ? (isStrictGate
                  ? 'Please login with your Google Account or Mobile Number to access the store & catalog.'
                  : 'Enter your mobile number to get an instant SMS OTP')
              : `Enter the 6-digit OTP code sent to +91 ${phone}`}
          </p>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm rounded-xl px-3.5 py-2.5 mb-4 font-medium flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
            <span className="flex-1 leading-snug">{error}</span>
          </div>
        )}

        {otpNotice && step === 'otp' && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl px-3.5 py-2.5 mb-4 flex items-start gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
            <div className="leading-snug">{otpNotice}</div>
          </div>
        )}

        {step === 'phone' ? (
          <>
            {/* Quick Google Sign In at top for instant 1-click login */}
            <button
              type="button"
              onClick={handleGoogle}
              disabled={isAnyLoading}
              className="w-full flex items-center justify-center gap-3 border-2 border-gray-200 hover:border-[#2874f0] bg-white hover:bg-blue-50/50 rounded-xl py-3.5 text-sm font-semibold text-gray-700 transition-all shadow-sm disabled:opacity-50"
            >
              {isGoogleLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin text-[#2874f0]" />
                  <span>Connecting to Google Account...</span>
                </>
              ) : (
                <>
                  <GoogleIcon />
                  <span>Continue with Google</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-semibold tracking-wider">OR PHONE OTP</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <form onSubmit={handleSendOTP} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Your Name (optional)</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Enter full name"
                  disabled={isAnyLoading}
                  className="w-full border border-gray-300 rounded-xl px-3.5 py-3 text-sm outline-none focus:border-[#2874f0] focus:ring-2 focus:ring-blue-100 transition-all font-medium disabled:bg-gray-50"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Mobile Number</label>
                <div className="flex items-center border border-gray-300 rounded-xl overflow-hidden focus-within:border-[#2874f0] focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                  <span className="px-3.5 py-3 text-sm font-semibold text-gray-700 bg-gray-50 border-r border-gray-200">+91</span>
                  <div className="pl-3 text-gray-400">
                    <Phone size={16} />
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10-digit mobile number"
                    disabled={isAnyLoading}
                    className="flex-1 px-3 py-3 text-sm font-medium outline-none disabled:bg-gray-50"
                    autoFocus={!isStrictGate}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isAnyLoading || phone.length < 10}
                className="w-full bg-[#2874f0] hover:bg-blue-600 text-white font-bold text-sm py-3.5 rounded-xl transition-all shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2 mt-2 cursor-pointer"
              >
                {isSendingOtp ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>Sending Firebase SMS OTP...</span>
                  </>
                ) : (
                  <>
                    <MessageSquare size={17} />
                    <span>Get SMS OTP</span>
                  </>
                )}
              </button>
            </form>

            <div className="flex items-center justify-center gap-2 mt-6 text-xs text-gray-500">
              <ShieldCheck size={16} className="text-emerald-600" />
              <span>100% Safe & Secure Real-Time Authentication</span>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 text-center">
              <p className="text-[11px] text-gray-400 flex items-center justify-center gap-1">
                <Mail size={12} className="text-gray-400" />
                <span>Support: </span>
                <span className="font-semibold text-gray-600">support.akselling@gmail.com</span>
              </p>
            </div>
          </>
        ) : (
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-600">Enter 6-Digit OTP</label>
                <button
                  type="button"
                  onClick={() => setStep('phone')}
                  className="text-xs text-[#2874f0] font-bold hover:underline"
                >
                  Change number
                </button>
              </div>
              <input
                type="text"
                value={otp}
                maxLength={6}
                onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="------"
                disabled={isVerifyingOtp}
                className="w-full border-2 border-gray-300 rounded-xl px-3 py-3 text-center text-2xl tracking-[0.4em] font-mono font-bold outline-none focus:border-[#2874f0] focus:ring-2 focus:ring-blue-100 transition-all bg-gray-50 focus:bg-white"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500 px-1">
              <span>Didn't receive code?</span>
              {canResend ? (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isSendingOtp}
                  className="text-[#2874f0] font-bold hover:underline flex items-center gap-1"
                >
                  {isSendingOtp ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                  <span>{isSendingOtp ? 'Sending...' : 'Resend OTP'}</span>
                </button>
              ) : (
                <span className="text-gray-400 font-mono">Resend in {countdown}s</span>
              )}
            </div>

            <button
              type="submit"
              disabled={isVerifyingOtp || otp.length < 6}
              className="w-full bg-[#2874f0] hover:bg-blue-600 text-white font-bold text-sm py-3.5 rounded-xl transition-all shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2 mt-3 cursor-pointer"
            >
              {isVerifyingOtp ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Verifying OTP & Logging In...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} />
                  <span>Verify & Login</span>
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 pt-2">
              <ShieldCheck size={14} className="text-emerald-500" />
              <span>Real-time Secure Verification</span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
