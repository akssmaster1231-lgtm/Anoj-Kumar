import { useState, useEffect } from 'react';
import {
  ChevronLeft,
  Package,
  CheckCircle2,
  Truck,
  Clock,
  PackageCheck,
  MapPin,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { formatPrice } from '@/data';
import { useI18n } from '@/i18n';
import { subscribeOrders, type FirestoreOrder } from '@/firebase';
import { useAuth } from '@/auth-context';

interface OrdersPageProps {
  onBack: () => void;
}

type OrderRow = FirestoreOrder;

export default function OrdersPage({ onBack }: OrdersPageProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [returnRequested, setReturnRequested] = useState<string | null>(null);

  useEffect(() => {
    let localOrders: OrderRow[] = [];
    try {
      const stored = localStorage.getItem('akselling_local_orders');
      if (stored) {
        localOrders = JSON.parse(stored);
        setOrders(localOrders);
        setLoading(false);
      }
    } catch {
      // ignore
    }

    // Subscribe to Firestore orders in real-time
    const unsubscribe = subscribeOrders(user?.phone, (firestoreOrders) => {
      if (firestoreOrders.length > 0) {
        const ids = new Set(firestoreOrders.map(o => o.id));
        const remainingLocal = localOrders.filter(o => !ids.has(o.id));
        setOrders([...firestoreOrders, ...remainingLocal]);
      } else if (localOrders.length > 0) {
        setOrders(localOrders);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.phone]);

  const handleReturn = async (order: OrderRow) => {
    const firstItem = order.items[0];
    if (!firstItem) return;
    try {
      await supabase.from('returns').insert({
        order_id: order.id,
        product_id: firstItem.product_id,
        product_title: firstItem.product_title,
        product_image: firstItem.product_image,
        customer_name: order.customer_name,
        reason: 'Product not satisfactory',
        status: 'requested',
      });
    } catch {
      // ignore
    }
    setReturnRequested(order.id);
    setTimeout(() => setReturnRequested(null), 3000);
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'Delivered':
        return { icon: <CheckCircle2 size={16} />, color: 'text-success-600 bg-success-500/10', label: t('delivered') };
      case 'In Transit':
        return { icon: <Truck size={16} />, color: 'text-accent-600 bg-accent-400/10', label: t('inTransit') };
      case 'Processing':
        return { icon: <Clock size={16} />, color: 'text-flipkart-600 bg-flipkart-500/10', label: t('processing') };
      default:
        return { icon: <PackageCheck size={16} />, color: 'text-gray-600 bg-gray-100', label: t('placed') };
    }
  };

  const getTimeline = (status: string) => {
    const steps = [
      { label: t('placed'), done: true, icon: <PackageCheck size={14} /> },
      { label: t('processing'), done: ['Processing', 'In Transit', 'Delivered'].includes(status), icon: <Clock size={14} /> },
      { label: t('inTransit'), done: ['In Transit', 'Delivered'].includes(status), icon: <Truck size={14} /> },
      { label: t('delivered'), done: status === 'Delivered', icon: <CheckCircle2 size={14} /> },
    ];
    return steps;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[65] bg-gray-50 flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-flipkart-500" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[65] bg-gray-50 overflow-y-auto animate-fade-in">
      <div className="sticky top-0 bg-white shadow-sm px-3 py-2.5 flex items-center gap-3 z-10">
        <button onClick={onBack} className="p-1 text-gray-700">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-base font-bold text-gray-800">{t('myOrders')}</h1>
      </div>

      <div className="px-3 py-4 pb-12">
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-full bg-flipkart-50 flex items-center justify-center mb-4">
              <Package size={36} className="text-flipkart-300" />
            </div>
            <p className="text-sm text-gray-500">{t('noOrders')}</p>
            <p className="text-xs text-gray-400 mt-1">Your order history will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(order => {
              const statusInfo = getStatusInfo(order.status);
              const isExpanded = expandedOrder === order.id;
              return (
                <div key={order.id} className="bg-white rounded-xl shadow-card overflow-hidden">
                  {/* Order Header */}
                  <button
                    onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                    className="w-full p-3 flex items-center gap-3 text-left"
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-50 shrink-0">
                      {order.items[0]?.product_image && (
                        <img src={order.items[0].product_image} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 line-clamp-1">
                        {order.items[0]?.product_title || 'Order'}
                        {order.items.length > 1 && ` +${order.items.length - 1} more`}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Order ID: {order.id.slice(0, 8).toUpperCase()} • {new Date(order.created_at).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 ${statusInfo.color}`}>
                        {statusInfo.icon}
                        {statusInfo.label}
                      </span>
                      <span className="text-sm font-bold text-gray-900">{formatPrice(order.total_amount)}</span>
                    </div>
                  </button>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 p-3 space-y-3 animate-fade-in">
                      {/* Timeline */}
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase mb-2">{t('orderTracking')}</p>
                        <div className="flex items-center justify-between">
                          {getTimeline(order.status).map((step, i) => (
                            <div key={i} className="flex flex-col items-center gap-1 flex-1">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step.done ? 'bg-flipkart-500 text-white' : 'bg-gray-100 text-gray-300'}`}>
                                {step.icon}
                              </div>
                              <span className={`text-[10px] ${step.done ? 'text-flipkart-600 font-medium' : 'text-gray-400'}`}>
                                {step.label}
                              </span>
                              {i < 3 && (
                                <div className={`absolute h-0.5 ${step.done ? 'bg-flipkart-500' : 'bg-gray-200'}`} style={{ width: '20%', marginLeft: '40px' }} />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Items */}
                      <div className="space-y-2">
                        {order.items.map((item, i) => (
                          <div key={i} className="flex gap-2 items-center">
                            <img src={item.product_image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-700 line-clamp-1">{item.product_title}</p>
                              <p className="text-xs text-gray-400">Qty: {item.quantity} • {formatPrice(item.price)}</p>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Delivery Address */}
                      <div className="bg-gray-50 rounded-lg p-2.5 flex items-start gap-2">
                        <MapPin size={14} className="text-gray-400 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-gray-600">{order.customer_name}</p>
                          <p className="text-xs text-gray-400">{order.customer_address}</p>
                          <p className="text-xs text-gray-400">Phone: {order.customer_phone}</p>
                        </div>
                      </div>

                      {/* Return Button */}
                      {order.status === 'Delivered' && (
                        <div className="space-y-1.5">
                          <button
                            onClick={() => handleReturn(order)}
                            disabled={returnRequested === order.id}
                            className="w-full flex items-center justify-center gap-2 text-sm font-bold text-error-500 border border-error-200 rounded-lg py-2.5 hover:bg-error-50 transition-colors disabled:opacity-50"
                          >
                            {returnRequested === order.id ? (
                              <><CheckCircle2 size={16} /> Return Requested</>
                            ) : (
                              <><RotateCcw size={16} /> Request Return</>
                            )}
                          </button>
                          <p className="text-[10px] text-gray-500 text-center">
                            For return queries or SPF disputes: <span className="font-semibold text-flipkart-700">support.akselling@gmail.com</span>
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
