import { mapPermissionConfigToRole } from '../../../../../src/globals/helpers/mapRoles.helper';
import { PermissionMap } from '../permissions.provider';

const storePermissions: PermissionMap = {
  languages: ['get'],
  users: ['post', 'get'],
  roles: ['post', 'get', 'delete', 'patch'],
  profile: ['get', 'patch', 'delete'],
  permissions: ['get'],
  customers: ['get'],
  banners: ['get'],
  categories: ['get', 'post', 'patch', 'delete'],
  stores: ['get', 'patch'],
  services: ['post', 'get', 'patch', 'delete'],
  'social-media': ['get'],
  'system-notifications': ['get', 'patch'],
  fund: ['post', 'get'],
  coupons: ['get'],
  bundles: ['get', 'post', 'patch', 'delete'],
  schedule: ['post', 'get', 'patch', 'delete'],
  transactions: ['get'],
  orders: ['post', 'get', 'patch', 'delete'],

  cities: ['get'],
  servicerating: ['get'],
  storerating: ['get'],
  notification: ['get'],
  'orders/statistics': ['get'],
  'statistics/store': ['get', 'post'],
  specialists: ['post', 'get', 'patch', 'delete'],
  wallet: ['get'],
  withdraw: ['post', 'get'],
  complaint: ['get'],
  branches: ['post', 'get', 'patch', 'delete'],
  employees: ['post', 'get', 'patch', 'delete'],
  'payment-verification': ['patch'],
  logs: ['get'],
} as const satisfies PermissionMap;

export const StoreRole = {
  id: 4,
  name: { en: 'Store', ar: 'مركز' },
  key: 'Store',
  default: true,
  permissions: mapPermissionConfigToRole(storePermissions),
};
