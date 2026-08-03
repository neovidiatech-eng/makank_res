import { mapPermissionConfigToRole } from '../../../../../src/globals/helpers/mapRoles.helper';
import { PermissionMap } from '../permissions.provider';

const customerPermissions: PermissionMap = {
  languages: ['get'],
  profile: ['post', 'get', 'delete', 'patch'],
  addresses: ['post', 'get', 'patch', 'delete'],
  banners: ['get'],
  'special-delivery-banners': ['get'],
  categories: ['get'],
  stores: ['get'],
  'stores/favourite': ['get', 'patch'],
  services: ['get'],
  'services/favourite': ['get', 'patch'],
  filters: ['get'],
  'social-media': ['get'],
  coupons: ['get'],
  schedule: ['get'],
  orders: ['post', 'get', 'patch'],
  cities: ['get'],
  servicerating: ['post', 'get', 'patch', 'delete'],
  storerating: ['post', 'get', 'patch', 'delete'],
  rating: ['get'],
  notification: ['get'],
  complaint: ['post', 'get'],
} as const satisfies PermissionMap;

export const CustomerRole = {
  id: 2,
  name: { en: 'customer', ar: 'عميل' },
  key: 'Customer',
  default: true,
  permissions: mapPermissionConfigToRole(customerPermissions),
};
