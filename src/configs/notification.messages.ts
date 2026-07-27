export const NotificationMessages = {
  newOrderCreated: {
    title: {
      ar: 'طلب جديد',
      en: 'New Order Created',
    },
    body: {
      ar: 'تم إنشاء طلب جديد',
      en: 'New Order Created',
    },
  },
  orderStatusChanged: (status: string) => {
    const statuses = {
      PREPARING: {
        title: { ar: 'تحديث الطلب', en: 'Order Update' },
        body: {
          ar: 'طلبك قيد التحضير الآن',
          en: 'Your order is being prepared',
        },
      },
      READY_PICKUP: {
        title: { ar: 'الطلب جاهز', en: 'Order Ready' },
        body: {
          ar: 'طلبك جاهز للاستلام',
          en: 'Your order is ready for pickup',
        },
      },
      ON_THE_WAY: {
        title: { ar: 'طلبك في الطريق', en: 'Order on the way' },
        body: {
          ar: 'طلبك في الطريق إليك الآن',
          en: 'Your order is on the way',
        },
      },
      DELIVERED: {
        title: { ar: 'تم التوصيل', en: 'Order Delivered' },
        body: {
          ar: 'تم توصيل طلبك بنجاح',
          en: 'Your order has been delivered safely',
        },
      },
      CANCELLED: {
        title: { ar: 'تم إلغاء الطلب', en: 'Order Cancelled' },
        body: { ar: 'تم إلغاء طلبك', en: 'Your order has been cancelled' },
      },
      REJECTED: {
        title: { ar: 'تم رفض الطلب', en: 'Order Rejected' },
        body: { ar: 'تم رفض طلبك', en: 'Your order has been rejected' },
      },
    };
    return (
      statuses[status] || {
        title: { ar: 'تحديث الطلب', en: 'Order Update' },
        body: {
          ar: `تغيرت حالة طلبك إلى ${status}`,
          en: `Your order status changed to ${status}`,
        },
      }
    );
  },
  // Sent to admins only, when a store rejects an order the platform already
  // took payment for. No automatic refund happens on REJECTED — this is the
  // signal an admin needs to go process it manually.
  orderRejectedRefundOwed: (orderId: Id, amount: number) => ({
    title: { ar: 'رفض طلب — مطلوب استرداد', en: 'Order rejected — refund owed' },
    body: {
      ar: `الطلب #${orderId} اترفض من المتجر، والعميل صاحب الطلب مستحق استرداد ${amount} جنيه يدويًا`,
      en: `Order #${orderId} was rejected by the store — the customer is owed a ${amount} refund`,
    },
  }),
};
