const PREFIX_ALIASES: Record<string, string[]> = {
  rating: ['rating', 'storerating', 'servicerating', 'reviews'],
  storerating: ['storerating', 'rating', 'servicerating', 'reviews'],
  servicerating: ['servicerating', 'rating', 'storerating', 'reviews'],

  statistics: ['statistics', 'orders/statistics', 'statistics/store', 'wallet'],
  'orders/statistics': [
    'orders/statistics',
    'statistics',
    'statistics/store',
    'orders',
    'wallet',
  ],
  'statistics/store': [
    'statistics/store',
    'statistics',
    'orders/statistics',
    'wallet',
  ],
  wallet: [
    'wallet',
    'withdraw',
    'transactions',
    'statistics',
    'statistics/store',
    'orders/statistics',
  ],
  withdraw: ['withdraw', 'wallet', 'transactions'],
  transactions: ['transactions', 'wallet', 'withdraw'],

  services: [
    'services',
    'categories',
    'bundles',
    'variation-templates',
    'menu',
  ],
  categories: ['categories', 'services', 'bundles', 'menu'],
  bundles: ['bundles', 'services', 'categories'],
  'variation-templates': ['variation-templates', 'services'],

  orders: ['orders', 'orders/statistics'],
  employees: ['employees', 'roles'],
  roles: ['roles', 'employees'],
  stores: ['stores', 'branches', 'schedule'],
  branches: ['branches', 'stores', 'schedule'],
  schedule: ['schedule', 'stores', 'branches'],
};

export function validatePermissions(
  requiredPermissions: string,
  userPermissions: {
    prefix: string;
    method: string;
  }[],
): boolean {
  if (!requiredPermissions || requiredPermissions.length === 0) {
    return true;
  }

  if (!userPermissions || !Array.isArray(userPermissions)) {
    return false;
  }

  const reqLower = requiredPermissions.toLowerCase();
  const lastUnderscoreIndex = reqLower.lastIndexOf('_');
  if (lastUnderscoreIndex === -1) {
    return false;
  }

  const reqPrefix = reqLower.substring(0, lastUnderscoreIndex);
  const reqMethod = reqLower.substring(lastUnderscoreIndex + 1);
  const allowedPrefixes = PREFIX_ALIASES[reqPrefix] || [reqPrefix];

  const hasPermission = userPermissions.some((perm) => {
    const permPrefix = perm.prefix?.toLowerCase();
    const permMethod = perm.method?.toLowerCase();
    return (
      (permPrefix === reqPrefix || allowedPrefixes.includes(permPrefix)) &&
      (permMethod === reqMethod || permMethod === 'manage')
    );
  });

  return !!hasPermission;
}
