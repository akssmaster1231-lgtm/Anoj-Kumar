import { useState } from 'react';
import {
  ChevronLeft,
  MapPin,
  User,
  Phone,
  Loader2,
  CheckCircle2,
  Tag,
  Zap,
  Shield,
  Truck,
  CreditCard,
  Check,
  ChevronRight,
} from 'lucide-react';
import { formatPrice } from '@/data';
import { initiateRazorpayPayment } from '@/razorpay';
import { saveOrderToFirestore, type FirestoreOrder } from '@/firebase';
import { useI18n } from '@/i18n';
import { recordPlacedOrder } from '@/utils/orderSync';
import type { Product } from '@/types';

interface BuyNowCheckoutProps {
  product: Product;
  quantity: number;
  onBack: () => void;
  onSuccess: () => void;
}

type Step = 'address' | 'payment' | 'review';
type State = 'form' | 'processing' | 'success';

export default function BuyNowCheckout({ product, quantity, onBack, onSuccess }: BuyNowCheckoutProps) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>('address');
  const [state, setState] = useState<State>('form');
  const [error, setError] = useState('');
  const [orderId, setOrderId] = useState('');
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    city: '',
    pincode: '',
    paymentMethod: 'cod',
  });

  const totalAmount = product.price * quantity;
  const mrpTotal = product.mrp * quantity;
  const discount = mrpTotal - totalAmount;
  const deliveryFee = totalAmount > 500 ? 0 : 49;
  const finalAmount = totalAmount + deliveryFee;

  const handleAddressNext = () => {
    setError('');
    if (!form.name.trim() || !form.phone.trim() || !form.address.trim() || !form.pincode.trim()) {
      setError('Please fill in all required fields to continue.');
      return;
    }
    if (form.phone.trim().length < 10) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }
    setStep('payment');
  };

  const handlePaymentNext = () => {
    setStep('review');
  };

  const handleConfirm = async () => {
    setError('');

    if (form.paymentMethod === 'cod') {
      await placeOrder();
      return;
    }

    setState('processing');
    const paymentResult = await initiateRazorpayPayment(finalAmount, {
      name: 'AKSelling',
      description: product.title,
      prefill: { name: form.name, contact: form.phone },
    });

    if (!paymentResult.success) {
      setError(paymentResult.error || 'Payment failed. Please try again.');
      setState('form');
      return;
    }

    await placeOrder(paymentResult.orderId, paymentResult.paymentId);
  };

  const placeOrder = async (rzpOrderId?: string, rzpPayId?: string) => {
    setState('processing');
    try {
      const orderItems = [{
        product_id: product.id,
        product_title: product.title,
        product_image: product.images[0],
        quantity,
        price: product.price,
      }];

      const fullAddress = `${form.address}, ${form.city}, ${form.pincode}`;
      const generatedId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);

      const isPrepaid = form.paymentMethod !== 'cod';
      const orderPayload: FirestoreOrder = {
        id: generatedId,
        customer_name: form.name,
        customer_phone: form.phone,
        customer_address: fullAddress,
        items: orderItems,
        total_amount: finalAmount,
        payment_method: isPrepaid ? 'Prepaid (Razorpay / UPI / Card)' : 'Cash on Delivery',
        payment_status: isPrepaid ? 'Paid' : 'Pending (COD)',
        razorpay_order_id: rzpOrderId,
        razorpay_payment_id: rzpPayId,
        status: 'Placed',
        created_at: new Date().toISOString(),
      };

      // 1. Record in Firebase Firestore in real-time
      await saveOrderToFirestore(orderPayload);

      // 2. Record in customer local history AND dispatch to Seller Dashboard Orders Tab
      recordPlacedOrder(orderPayload);

      setOrderId(generatedId);
      setState('success');
    } catch (err) {
      console.error('Order placement error:', err);
      setError('Failed to place order. Please try again.');
      setState('form');
    }
  };

  if (state === 'success') {
    return (
      <div className="fixed inset-0 z-[65] bg-white flex flex-col items-center justify-center animate-fade-in px-4">
        <div className="w-20 h-20 rounded-full bg-success-500 flex items-center justify-center mb-4 animate-scale-in">
          <CheckCircle2 size={48} className="text-white" />
        </div>
        <h2 className="text-xl font-bold text-gray-800">{t('orderPlaced')}</h2>
        <p className="text-sm text-gray-500 mt-2 text-center">
          Your {product.title} will be delivered soon.
        </p>
        {orderId && (
          <p className="text-xs text-gray-400 mt-1">Order ID: {orderId.slice(0, 8).toUpperCase()}</p>
        )}
        <div className="mt-4 bg-flipkart-50 rounded-xl px-4 py-3 text-center">
          <p className="text-xs text-gray-500">{t('estimatedDelivery')}</p>
          <p className="text-sm font-bold text-flipkart-600">3-5 Business Days</p>
        </div>
        <button
          onClick={onSuccess}
          className="mt-6 bg-flipkart-500 text-white font-bold text-sm px-8 py-3 rounded-xl hover:bg-flipkart-600 transition-colors"
        >
          {t('continueShopping')}
        </button>
      </div>
    );
  }

  if (state === 'processing') {
    return (
      <div className="fixed inset-0 z-[65] bg-white flex flex-col items-center justify-center animate-fade-in">
        <Loader2 size={40} className="animate-spin text-flipkart-500 mb-4" />
        <h2 className="text-lg font-bold text-gray-800">Placing your order...</h2>
        <p className="text-sm text-gray-500 mt-1">Please wait while we confirm your order</p>
      </div>
    );
  }

  const steps: { id: Step; label: string }[] = [
    { id: 'address', label: t('step1Address') },
    { id: 'payment', label: t('step2Payment') },
    { id: 'review', label: t('step3Review') },
  ];
  const currentStepIndex = steps.findIndex(s => s.id === step);

  return (
    <div className="fixed inset-0 z-[65] bg-gray-50 overflow-y-auto">
      <div className="sticky top-0 bg-white shadow-sm px-3 py-2.5 flex items-center gap-3 z-10">
        <button onClick={onBack} className="p-1 text-gray-700">
          <ChevronLeft size={24} />
        </button>
        <div className="flex items-center gap-2">
          <Zap size={18} className="text-accent-400" />
          <h1 className="text-base font-bold text-gray-800">{t('buyNow')}</h1>
        </div>
      </div>

      {/* Step Progress Bar */}
      <div className="bg-white px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  i <= currentStepIndex ? 'bg-flipkart-500 text-white' : 'bg-gray-200 text-gray-400'
                }`}>
                  {i < currentStepIndex ? <Check size={14} /> : i + 1}
                </div>
                <span className={`text-[10px] ${i <= currentStepIndex ? 'text-flipkart-600 font-medium' : 'text-gray-400'}`}>
                  {s.label}
                </span>
              </div>
              {i < 2 && (
                <div className={`flex-1 h-0.5 mx-2 ${i < currentStepIndex ? 'bg-flipkart-500' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="px-3 py-4 pb-28">
        {/* Product Summary (always visible) */}
        <div className="bg-white rounded-xl shadow-card p-3 flex gap-3 mb-4">
          <img src={product.images[0]} alt="" className="w-16 h-16 rounded-lg object-cover" />
          <div className="flex-1">
            <p className="text-xs text-gray-400 uppercase">{product.brand}</p>
            <h3 className="text-sm font-medium text-gray-800 line-clamp-2">{product.title}</h3>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-sm font-bold text-gray-900">{formatPrice(product.price)}</span>
              <span className="text-xs text-gray-400 line-through">{formatPrice(product.mrp)}</span>
              <span className="text-xs font-bold text-success-500">{product.discount}% off</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{t('qty')}: {quantity}</p>
          </div>
        </div>

        {/* Step 1: Address */}
        {step === 'address' && (
          <div className="bg-white rounded-xl shadow-card p-4 space-y-4">
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-flipkart-500" />
              <h2 className="text-sm font-bold text-gray-800">{t('step1Address')}</h2>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 flex items-center gap-1.5 mb-1.5">
                <User size={14} /> {t('fullName')} *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Enter your name"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-flipkart-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 flex items-center gap-1.5 mb-1.5">
                <Phone size={14} /> {t('phoneNumber')} *
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                placeholder="10-digit mobile number"
                maxLength={10}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-flipkart-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 flex items-center gap-1.5 mb-1.5">
                <MapPin size={14} /> {t('address')} *
              </label>
              <textarea
                value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                placeholder="House no, Street, Area"
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-flipkart-500 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">{t('city')}</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={e => setForm({ ...form, city: e.target.value })}
                  placeholder="City"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-flipkart-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">{t('pincode')} *</label>
                <input
                  type="text"
                  value={form.pincode}
                  onChange={e => setForm({ ...form, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                  placeholder="6-digit pincode"
                  maxLength={6}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-flipkart-500"
                />
              </div>
            </div>
            {error && <p className="text-sm text-error-500 bg-error-50 rounded-lg px-3 py-2">{error}</p>}
            <button
              onClick={handleAddressNext}
              className="w-full bg-flipkart-500 text-white font-bold text-sm py-3.5 rounded-xl hover:bg-flipkart-600 transition-colors flex items-center justify-center gap-2"
            >
              Save & Continue <ChevronRight size={18} />
            </button>
          </div>
        )}

        {/* Step 2: Payment */}
        {step === 'payment' && (
          <div className="bg-white rounded-xl shadow-card p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard size={18} className="text-flipkart-500" />
              <h2 className="text-sm font-bold text-gray-800">{t('step2Payment')}</h2>
            </div>
            {[
              { label: t('cashOnDelivery'), value: 'cod', icon: '💵' },
              { label: t('upi'), value: 'upi', icon: '📱' },
              { label: t('card'), value: 'card', icon: '💳' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setForm({ ...form, paymentMethod: opt.value })}
                className={`w-full flex items-center gap-3 px-3 py-3.5 rounded-lg border transition-colors ${
                  form.paymentMethod === opt.value ? 'border-flipkart-500 bg-flipkart-50' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span className="text-xl">{opt.icon}</span>
                <span className="flex-1 text-left text-sm font-medium text-gray-700">{opt.label}</span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  form.paymentMethod === opt.value ? 'border-flipkart-500' : 'border-gray-300'
                }`}>
                  {form.paymentMethod === opt.value && <div className="w-2.5 h-2.5 rounded-full bg-flipkart-500" />}
                </div>
              </button>
            ))}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setStep('address')}
                className="px-4 text-sm text-gray-500 font-medium rounded-lg hover:bg-gray-100"
              >
                Back
              </button>
              <button
                onClick={handlePaymentNext}
                className="flex-1 bg-flipkart-500 text-white font-bold text-sm py-3 rounded-xl hover:bg-flipkart-600 transition-colors flex items-center justify-center gap-2"
              >
                Continue to Review <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 'review' && (
          <>
            {/* Saved Address Summary */}
            <div className="bg-white rounded-xl shadow-card p-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-flipkart-500" />
                  <h3 className="text-sm font-bold text-gray-700">{t('deliveryDetails')}</h3>
                </div>
                <button onClick={() => setStep('address')} className="text-xs text-flipkart-500 font-medium">Edit</button>
              </div>
              <p className="text-sm font-medium text-gray-800">{form.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{form.address}, {form.city}, {form.pincode}</p>
              <p className="text-xs text-gray-500">Phone: {form.phone}</p>
            </div>

            {/* Payment Summary */}
            <div className="bg-white rounded-xl shadow-card p-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CreditCard size={16} className="text-flipkart-500" />
                  <h3 className="text-sm font-bold text-gray-700">{t('paymentMethod')}</h3>
                </div>
                <button onClick={() => setStep('payment')} className="text-xs text-flipkart-500 font-medium">Edit</button>
              </div>
              <p className="text-sm text-gray-600">
                {form.paymentMethod === 'cod' ? t('cashOnDelivery') : form.paymentMethod === 'upi' ? t('upi') : t('card')}
              </p>
            </div>

            {/* Price Summary */}
            <div className="bg-white rounded-xl shadow-card overflow-hidden mb-3">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="text-sm font-bold text-gray-800">{t('priceDetails')}</h2>
              </div>
              <div className="p-4 space-y-2.5">
                <Row label={`${t('price')} (${quantity} item)`} value={formatPrice(mrpTotal)} />
                <Row label={t('discount')} value={`- ${formatPrice(discount)}`} color="text-success-500" />
                <Row label={t('deliveryCharges')} value={deliveryFee === 0 ? t('free') : formatPrice(deliveryFee)} color={deliveryFee === 0 ? 'text-success-500' : 'text-gray-700'} />
                <div className="border-t border-dashed border-gray-200 pt-2.5">
                  <Row label={t('totalAmount')} value={formatPrice(finalAmount)} bold />
                </div>
                {discount > 0 && (
                  <div className="bg-success-50 rounded-lg px-3 py-2 flex items-center gap-2">
                    <Tag size={14} className="text-success-500" />
                    <p className="text-xs text-success-600 font-medium">{t('youSave')} {formatPrice(discount)}!</p>
                  </div>
                )}
              </div>
            </div>

            {/* Trust badges */}
            <div className="flex items-center justify-around bg-white rounded-xl shadow-card p-3 mb-3">
              <div className="flex flex-col items-center gap-1">
                <Shield size={18} className="text-success-500" />
                <span className="text-[10px] text-gray-500">{t('securePayment')}</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Truck size={18} className="text-flipkart-500" />
                <span className="text-[10px] text-gray-500">{t('fastDelivery')}</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <CheckCircle2 size={18} className="text-accent-500" />
                <span className="text-[10px] text-gray-500">{t('easyReturns')}</span>
              </div>
            </div>

            {error && <p className="text-sm text-error-500 bg-error-50 rounded-lg px-3 py-2 mb-3">{error}</p>}
          </>
        )}
      </div>

      {/* Bottom Action */}
      {step === 'review' && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 px-4 py-3 max-w-2xl mx-auto shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-400">{t('totalAmount')}</p>
              <p className="text-lg font-bold text-gray-900">{formatPrice(finalAmount)}</p>
            </div>
            <button
              onClick={handleConfirm}
              className="flex-1 ml-4 bg-accent-400 text-white font-bold text-base py-3.5 rounded-xl hover:bg-accent-600 transition-colors flex items-center justify-center gap-2"
            >
              <Zap size={18} /> {t('confirmAndBuy')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${bold ? 'font-bold text-gray-800' : 'text-gray-500'}`}>{label}</span>
      <span className={`text-sm ${bold ? 'font-bold text-gray-900' : 'font-medium'} ${color || 'text-gray-700'}`}>{value}</span>
    </div>
  );
}
