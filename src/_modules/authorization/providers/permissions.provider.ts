export const permissions = [
  {
    name: { en: 'Languages', ar: 'اللغات' },
    prefix: 'languages',
    default: true,
    methods: ['post', 'get', 'delete', 'patch'],
  },

  {
    name: { en: 'Users', ar: 'المستخدمين' },
    prefix: 'users',
    default: false,
    methods: ['post', 'get', 'delete', 'patch'],
  },
  {
    name: { en: 'Roles', ar: 'الادوار' },
    prefix: 'roles',
    default: true,
    methods: ['post', 'get', 'delete', 'patch'],
  },
  {
    name: { en: 'Profile', ar: 'الحساب الشخصي' },
    prefix: 'profile',
    default: true,
    methods: ['post', 'get', 'patch', 'delete'],
  },
  {
    name: { en: 'Permissions', ar: 'الصلاحيات' },
    prefix: 'permissions',
    default: false,
    methods: ['get', 'patch'],
  },
  {
    name: { en: 'Customers', ar: 'العملاء' },
    prefix: 'customers',
    default: false,
    methods: ['post', 'get', 'patch', 'delete'],
  },
  {
    name: { en: 'Addresses', ar: 'العناوين' },
    prefix: 'addresses',
    default: true,
    methods: ['post', 'get', 'patch', 'delete'],
  },
  {
    name: { en: 'Banners', ar: 'البانرات' },
    prefix: 'banners',
    default: false,
    methods: ['post', 'get', 'patch', 'delete'],
  },
  {
    name: { en: 'Special Delivery Banners', ar: 'بانرات التوصيل الخاص' },
    prefix: 'special-delivery-banners',
    default: false,
    methods: ['post', 'get', 'patch', 'delete'],
  },
  {
    name: { en: 'Categories', ar: 'الفئات' },
    prefix: 'categories',
    default: false,
    methods: ['post', 'get', 'patch', 'delete', 'manage'],
  },

  {
    name: { en: 'Stores', ar: 'المتاجر' },
    prefix: 'stores',
    default: false,
    methods: ['post', 'get', 'patch', 'delete'],
  },
  {
    name: { en: 'Store Favourite', ar: 'المتجر المفضل' },
    prefix: 'stores/favourite',
    default: true,
    methods: ['get', 'patch'],
  },

  {
    name: { en: 'Service', ar: 'الخدمات' },
    prefix: 'services',
    default: false,
    methods: ['post', 'get', 'patch', 'delete', 'manage'],
  },
  {
    name: { en: 'Service Favourite', ar: 'الخدمات المفضلة' },
    prefix: 'services/favourite',
    default: true,
    methods: ['get', 'patch'],
  },
  {
    name: { en: 'filters', ar: 'الفلاتر' },
    prefix: 'filters',
    default: true,
    methods: ['get'],
  },
  {
    name: { en: 'settings', ar: 'الإعدادات' },
    prefix: 'settings',
    default: false,
    methods: ['get', 'patch'],
  },
  {
    name: { en: 'Social Media', ar: 'وسائل التواصل الاجتماعي' },
    prefix: 'social-media',
    default: false,
    methods: ['post', 'get', 'patch', 'delete'],
  },
  {
    name: { en: 'System Notifications', ar: 'إشعارات النظام' },
    prefix: 'system-notifications',
    default: false,
    methods: ['get', 'patch'],
  },
  {
    name: { en: 'Fund', ar: 'رصيد المحفظة' },
    prefix: 'fund',
    default: false,
    methods: ['post', 'get'],
  },
  {
    name: { en: 'Coupons', ar: 'القسائم' },
    prefix: 'coupons',
    default: false,
    methods: ['post', 'get', 'patch', 'delete'],
  },
  {
    name: { en: 'Bundles', ar: 'العروض' },
    prefix: 'bundles',
    default: false,
    methods: ['post', 'get', 'patch', 'delete', 'manage'],
  },
  {
    name: { en: 'Schedule', ar: 'جدول الجدولة' },
    prefix: 'schedule',
    default: false,
    methods: ['post', 'get', 'put', 'patch', 'delete', 'manage'],
  },
  {
    name: { en: 'Orders', ar: 'الطلبات' },
    prefix: 'orders',
    default: false,
    methods: ['post', 'get', 'patch', 'delete', 'manage'],
  },
  {
    name: { en: 'Cities', ar: 'المدن' },
    prefix: 'cities',
    default: true,
    methods: ['post', 'get', 'patch', 'delete', 'manage'],
  },
  {
    name: { en: 'Service Rating', ar: 'تقييم الخدمات' },
    prefix: 'servicerating',
    default: true,
    methods: ['post', 'get', 'patch', 'delete', 'manage'],
  },
  {
    name: { en: 'Store Rating', ar: 'تقييم المتجر' },
    prefix: 'storerating',
    default: true,
    methods: ['post', 'get', 'patch', 'delete', 'manage'],
  },
  {
    name: { en: 'statistics', ar: 'الإحصائيات' },
    prefix: 'statistics',
    default: true,
    methods: ['post', 'get', 'patch', 'delete', 'manage'],
  },

  {
    name: { en: 'notification', ar: 'الإشعارات' },
    prefix: 'notification',
    default: true,
    methods: ['post', 'get', 'patch', 'delete', 'manage'],
  },
  {
    name: { en: 'statistics', ar: 'الإحصائيات' },
    prefix: 'orders/statistics',
    default: true,
    methods: ['get'],
  },
  {
    name: { en: 'store statistics', ar: 'إحصائيات المتجر' },
    prefix: 'statistics/store',
    default: true,
    methods: ['get', 'post'],
  },
  {
    name: { en: 'specialists', ar: 'الخبراء' },
    prefix: 'specialists',
    default: true,
    methods: ['post', 'get', 'patch', 'delete'],
  },
  {
    name: { en: 'wallet', ar: 'المحفظة' },
    prefix: 'wallet',
    default: true,
    methods: ['get'],
  },
  {
    name: { en: 'withdraw', ar: 'السحب' },
    prefix: 'withdraw',
    default: true,
    methods: ['post', 'get', 'patch'],
  },
  {
    name: { en: 'transactions', ar: 'التحويلات' },
    prefix: 'transactions',
    default: true,
    methods: ['get'],
  },
  {
    name: { en: 'fund', ar: 'رصيد المحفظة' },
    prefix: 'fund',
    default: true,
    methods: ['post'],
  },
  {
    name: { en: 'Complaints', ar: 'الشكاوي' },
    prefix: 'complaint',
    default: true,
    methods: ['post', 'get', 'patch', 'delete', 'manage'],
  },
  {
    name: { en: 'block store', ar: 'حظر المتجر' },
    prefix: 'store-block',
    default: true,
    methods: ['patch'],
  },
  {
    name: { en: 'store approval', ar: 'موافقة المتجر' },
    prefix: 'store-approval',
    default: true,
    methods: ['patch'],
  },
  {
    name: { en: 'payment verification', ar: 'مراجعة إثبات الدفع' },
    prefix: 'payment-verification',
    default: true,
    methods: ['patch'],
  },
  {
    name: { en: 'Zones', ar: 'المناطق' },
    prefix: 'zones',
    default: false,
    methods: ['post', 'get', 'patch', 'delete'],
  },
  {
    name: { en: 'Branches', ar: 'الفروع' },
    prefix: 'branches',
    default: false,
    methods: ['post', 'get', 'patch', 'delete'],
  },
  {
    name: { en: 'Store Commission', ar: 'عمولة المتجر' },
    prefix: 'store-commission',
    default: false,
    methods: ['patch'],
  },
  {
    name: { en: 'Store Zone Pricing', ar: 'تسعير المناطق للمتجر' },
    prefix: 'store-zone-pricing',
    default: false,
    methods: ['patch'],
  },
  {
    name: { en: 'Store Managed By Admin', ar: 'إدارة المتجر عن طريق الأدمن' },
    prefix: 'store-managed-by-admin',
    default: false,
    methods: ['patch'],
  },
  {
    name: { en: 'Rating', ar: 'التقييم' },
    prefix: 'rating',
    default: false,
    methods: ['get', 'patch', 'delete'],
  },
  {
    name: { en: 'Variation Templates', ar: 'قوالب المتغيرات' },
    prefix: 'variation-templates',
    default: false,
    methods: ['post', 'get', 'patch', 'delete'],
  },
  {
    name: { en: 'Fortune Wheel', ar: 'عجلة الحظ' },
    prefix: 'fortune-wheel',
    default: false,
    methods: ['post', 'get', 'patch', 'delete'],
  },
  {
    name: { en: 'Logs', ar: 'السجلات' },
    prefix: 'logs',
    default: false,
    methods: ['get'],
  },
  {
    name: { en: 'Campaigns', ar: 'الإشعارات والعروض' },
    prefix: 'campaigns',
    default: false,
    methods: ['post', 'get', 'patch', 'delete'],
  },
  {
    name: { en: 'Admin Notifications', ar: 'إشعارات الإدارة' },
    prefix: 'admin-notifications',
    default: false,
    methods: ['post', 'get', 'delete'],
  },
  {
    name: { en: 'Store Templates', ar: 'قوالب المتاجر' },
    prefix: 'store-templates',
    default: false,
    methods: ['post', 'get', 'patch', 'delete'],
  },
  {
    name: { en: 'Delivery', ar: 'مندوبي التوصيل' },
    prefix: 'delivery',
    default: false,
    methods: ['post', 'get', 'put', 'patch', 'delete'],
  },
  {
    name: { en: 'Driver withdrawals', ar: 'طلبات سحب المندوبين' },
    prefix: 'delivery/withdrawals',
    default: false,
    methods: ['get', 'patch'],
  },
  {
    name: { en: 'Driver cash settlements', ar: 'تسويات كاش المندوبين' },
    prefix: 'delivery/cash-settlements',
    default: false,
    methods: ['post', 'get'],
  },
  {
    name: { en: 'Employees', ar: 'الموظفين' },
    prefix: 'employees',
    default: true,
    methods: ['post', 'get', 'patch', 'delete'],
  },
];

type Permission = (typeof permissions)[number];

export type PermissionMethod =
  | 'get'
  | 'post'
  | 'put'
  | 'patch'
  | 'delete'
  | 'manage';

export type PermissionMap = Record<Permission['prefix'], PermissionMethod[]>;
