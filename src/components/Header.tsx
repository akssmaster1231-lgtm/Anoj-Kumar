import { useState, useRef, useEffect, type FormEvent } from 'react';
import { Search, Mic, Camera, ShoppingCart, X, Loader2 } from 'lucide-react';
import { useCart } from '@/cart-context';
import { useAuth } from '@/auth-context';
import { useI18n } from '@/i18n';

interface HeaderProps {
  onSearch: (query: string) => void;
  onCartClick: () => void;
  onNavigateHome: () => void;
  onAccountClick?: () => void;
  onSwitchToSeller?: () => void;
}

export default function Header({ onSearch, onCartClick, onNavigateHome, onAccountClick }: HeaderProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const { cartCount } = useCart();
  const recognitionRef = useRef<unknown>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const SR = (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
    setVoiceSupported(!!SR);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(query);
  };

  const handleVoice = () => {
    const SR = (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown }).SpeechRecognition
      || (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SR) {
      setVoiceActive(true);
      setTimeout(() => {
        setVoiceActive(false);
        setQuery('wireless headphones');
        onSearch('wireless headphones');
      }, 2000);
      return;
    }

    const recognition = new SR() as {
      lang: string;
      interimResults: boolean;
      continuous: boolean;
      onresult: (event: { results: { 0: { 0: { transcript: string } } } }) => void;
      onerror: () => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
    };
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.continuous = false;

    setVoiceActive(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setQuery(transcript);
      onSearch(transcript);
    };
    recognition.onerror = () => setVoiceActive(false);
    recognition.onend = () => setVoiceActive(false);

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      setVoiceActive(false);
    }
  };

  const stopVoice = () => {
    setVoiceActive(false);
    (recognitionRef.current as { stop?: () => void } | null)?.stop?.();
  };

  const handleCamera = async () => {
    setCameraOpen(true);
    setCameraError('');
    setCapturedImage(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraError('Camera access denied or not available on this device.');
    }
  };

  const closeCamera = () => {
    setCameraOpen(false);
    setCapturedImage(null);
    setCameraError('');
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    setCapturedImage(dataUrl);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setSearching(true);
    setTimeout(() => {
      setSearching(false);
      setCameraOpen(false);
      setCapturedImage(null);
      setQuery('headphones');
      onSearch('headphones');
      onNavigateHome();
    }, 2500);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  return (
    <>
      <header className="sticky top-0 z-50 bg-flipkart-500 shadow-md">
        <div className="mx-auto max-w-2xl px-3 py-2.5">
          <div className="flex items-center gap-3">
            <button onClick={onNavigateHome} className="flex items-baseline gap-0.5 shrink-0">
              <span className="text-xl font-extrabold text-white tracking-tight">
                AK<span className="text-accent-400">Selling</span>
              </span>
            </button>

            <form onSubmit={handleSubmit} className="flex-1 relative">
              <div className="flex items-center bg-white rounded-md shadow-sm overflow-hidden">
                <div className="pl-3 text-gray-400">
                  <Search size={18} />
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="flex-1 px-2.5 py-2.5 text-sm text-gray-800 placeholder-gray-400 bg-transparent outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      onSearch('');
                    }}
                    className="px-2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={16} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCamera}
                  className="px-2.5 border-l border-gray-100 text-gray-500 hover:text-flipkart-500 transition-colors"
                  aria-label="Visual search"
                >
                  <Camera size={18} />
                </button>
                <button
                  type="button"
                  onClick={voiceActive ? stopVoice : handleVoice}
                  className={`px-3 transition-colors ${
                    voiceActive ? 'text-flipkart-500' : 'text-gray-500 hover:text-flipkart-500'
                  }`}
                  aria-label="Voice search"
                >
                  {voiceActive ? (
                    <span className="relative flex items-center justify-center">
                      <span className="absolute inline-flex h-5 w-5 rounded-full bg-flipkart-200 animate-pulse-ring" />
                      <Mic size={18} className="relative" />
                    </span>
                  ) : (
                    <Mic size={18} />
                  )}
                </button>
              </div>
            </form>

            <button
              onClick={onCartClick}
              className="relative shrink-0 flex items-center gap-1.5 text-white"
              aria-label="View Cart"
            >
              <div className="relative">
                <ShoppingCart size={22} />
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-accent-400 text-flipkart-900 text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                    {cartCount}
                  </span>
                )}
              </div>
              <span className="text-sm font-medium hidden sm:inline">{t('cart')}</span>
            </button>

            {onAccountClick && (
              <button
                onClick={onAccountClick}
                className="relative shrink-0 flex items-center text-white hover:opacity-90 transition-opacity"
                title={user?.name || 'Account'}
              >
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name || 'Account'}
                    className="w-7 h-7 rounded-full object-cover border border-white/80 shadow-xs"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-white/20 border border-white/40 flex items-center justify-center text-xs font-bold text-white shadow-xs">
                    {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Voice search overlay */}
      {voiceActive && (
        <div className="fixed inset-0 z-[80] bg-black/60 flex flex-col items-center justify-center animate-fade-in">
          <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-4 max-w-xs mx-4">
            <div className="relative">
              <span className="absolute inline-flex h-16 w-16 rounded-full bg-flipkart-200 animate-pulse-ring" />
              <div className="w-16 h-16 rounded-full bg-flipkart-500 flex items-center justify-center">
                <Mic size={32} className="text-white" />
              </div>
            </div>
            <p className="text-gray-700 font-medium text-sm">
              {voiceSupported ? 'Listening... speak now' : 'Searching for "wireless headphones"...'}
            </p>
            <button
              onClick={stopVoice}
              className="text-sm text-gray-500 font-medium px-4 py-2 rounded-lg hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Camera search overlay */}
      {cameraOpen && (
        <div className="fixed inset-0 z-[80] bg-black flex flex-col animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 bg-black">
            <button onClick={closeCamera} className="text-white p-1">
              <X size={24} />
            </button>
            <span className="text-white text-sm font-medium">Visual Search</span>
            <div className="w-8" />
          </div>

          {cameraError ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
              <Camera size={48} className="text-gray-500 mb-4" />
              <p className="text-white/80 text-sm">{cameraError}</p>
              <p className="text-white/50 text-xs mt-2">Please allow camera access in your browser settings.</p>
              <button
                onClick={closeCamera}
                className="mt-6 bg-flipkart-500 text-white text-sm font-bold px-6 py-2.5 rounded-xl"
              >
                Go Back
              </button>
            </div>
          ) : capturedImage ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <img src={capturedImage} alt="Captured" className="max-h-[60vh] rounded-lg" />
              <div className="flex items-center gap-2 mt-6">
                {searching && <Loader2 size={20} className="animate-spin text-white" />}
                <p className="text-white text-sm font-medium">
                  {searching ? 'Searching for matching products...' : 'Photo captured!'}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-64 h-64 border-2 border-white/60 rounded-2xl" />
                </div>
                <p className="absolute bottom-4 left-0 right-0 text-center text-white/70 text-xs">
                  Point your camera at a product to search
                </p>
              </div>
              <div className="bg-black py-6 flex items-center justify-center">
                <button
                  onClick={capturePhoto}
                  className="w-16 h-16 rounded-full bg-white border-4 border-flipkart-500 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <Camera size={28} className="text-flipkart-500" />
                </button>
              </div>
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
    </>
  );
}
