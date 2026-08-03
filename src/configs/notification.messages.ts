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
  orderStatusChanged: (status: string, order?: any, isStoreOrAdmin?: boolean) => {
    const orderId = order?.id || '';
    if (isStoreOrAdmin) {
      const statuses = {
        PREPARING: {
          title: { ar: `قبول الطلب #${orderId}`, en: `Accepted Order #${orderId}` },
          body: {
            ar: `تم قبول الطلب رقم #${orderId} وبدأ التحضير في المطبخ.`,
            en: `Order #${orderId} was accepted and preparation has started.`,
          },
        },
        READY_PICKUP: {
          title: { ar: `الطلب جاهز #${orderId}`, en: `Order #${orderId} Ready` },
          body: {
            ar: `الطلب رقم #${orderId} أصبح جاهزاً للتسليم/الاستلام.`,
            en: `Order #${orderId} is now ready for pickup/handover.`,
          },
        },
        ON_THE_WAY: {
          title: { ar: `الطلب في الطريق #${orderId}`, en: `Order #${orderId} On The Way` },
          body: {
            ar: `الطلب رقم #${orderId} في الطريق للعميل مع المندوب.`,
            en: `Order #${orderId} is now on the way to the client with the driver.`,
          },
        },
        DELIVERED: {
          title: { ar: `تم تسليم الطلب #${orderId}`, en: `Order #${orderId} Delivered` },
          body: {
            ar: `تم تسليم الطلب رقم #${orderId} للعميل بنجاح.`,
            en: `Order #${orderId} has been successfully delivered to the customer.`,
          },
        },
        CANCELLED: {
          title: { ar: `إلغاء الطلب #${orderId}`, en: `Order #${orderId} Cancelled` },
          body: {
            ar: `تم إلغاء الطلب رقم #${orderId} من قبل العميل.`,
            en: `Order #${orderId} was cancelled by the customer.`,
          },
        },
        REJECTED: {
          title: { ar: `رفض الطلب #${orderId}`, en: `Order #${orderId} Rejected` },
          body: {
            ar: `تم رفض الطلب رقم #${orderId}.`,
            en: `Order #${orderId} was rejected.`,
          },
        },
      };
      return (
        statuses[status] || {
          title: { ar: `تحديث الطلب #${orderId}`, en: `Order Update #${orderId}` },
          body: {
            ar: `تغيرت حالة الطلب رقم #${orderId} إلى ${status}`,
            en: `Order #${orderId} status changed to ${status}`,
          },
        }
      );
    } else {
      const statuses = {
        PREPARING: {
          title: { ar: `تحديث الطلب #${orderId}`, en: `Order Update #${orderId}` },
          body: {
            ar: `طلبك رقم #${orderId} قيد التحضير الآن.`,
            en: `Your order #${orderId} is being prepared now.`,
          },
        },
        READY_PICKUP: {
          title: { ar: `الطلب جاهز #${orderId}`, en: `Order Ready #${orderId}` },
          body: {
            ar: `طلبك رقم #${orderId} جاهز للاستلام.`,
            en: `Your order #${orderId} is ready for pickup.`,
          },
        },
        ON_THE_WAY: {
          title: { ar: `طلبك في الطريق #${orderId}`, en: `Order On The Way #${orderId}` },
          body: {
            ar: `طلبك رقم #${orderId} في الطريق إليك الآن.`,
            en: `Your order #${orderId} is on the way.`,
          },
        },
        DELIVERED: {
          title: { ar: `تم التوصيل #${orderId}`, en: `Order Delivered #${orderId}` },
          body: {
            ar: `تم توصيل طلبك رقم #${orderId} بنجاح.`,
            en: `Your order #${orderId} has been delivered safely.`,
          },
        },
        CANCELLED: {
          title: { ar: `تم إلغاء الطلب #${orderId}`, en: `Order Cancelled #${orderId}` },
          body: {
            ar: `تم إلغاء طلبك رقم #${orderId}.`,
            en: `Your order #${orderId} has been cancelled.`,
          },
        },
        REJECTED: {
          title: { ar: `تم رفض الطلب #${orderId}`, en: `Order Rejected #${orderId}` },
          body: {
            ar: `تم رفض طلبك رقم #${orderId}.`,
            en: `Your order #${orderId} has been rejected.`,
          },
        },
      };
      return (
        statuses[status] || {
          title: { ar: `تحديث الطلب #${orderId}`, en: `Order Update #${orderId}` },
          body: {
            ar: `تغيرت حالة طلبك رقم #${orderId} إلى ${status}`,
            en: `Your order #${orderId} status changed to ${status}`,
          },
        }
      );
    }
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
