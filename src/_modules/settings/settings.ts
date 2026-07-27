import { DataType, SettingDomain } from '@prisma/client';

export type Setting = {
  setting: string;
  domain: SettingDomain;
  value: string;
  type: DataType;
  enum?: object;
};

export const settingTypes = [
  {
    // general
    setting: 'generalCopyRightTextAr',
    domain: SettingDomain.BUSINESS,
    value: '',
    type: DataType.STRING,
  },
  {
    // general
    setting: 'logo',
    domain: SettingDomain.BUSINESS,
    value: '',
    type: DataType.FILE,
  },
  {
    setting: 'generalCopyRightTextEn',
    domain: SettingDomain.BUSINESS,
    value: '',
    type: DataType.STRING,
  },
  {
    setting: 'conditionsAndProvisionsEn',
    domain: SettingDomain.BUSINESS,
    value: '',
    type: DataType.TEXTAREA,
  },
  {
    setting: 'conditionsAndProvisionsAr',
    domain: SettingDomain.BUSINESS,
    value: '',
    type: DataType.TEXTAREA,
  },
  {
    setting: 'privatePolicyAr',
    domain: SettingDomain.BUSINESS,
    value: '',
    type: DataType.TEXTAREA,
  },
  {
    setting: 'privatePolicyEn',
    domain: SettingDomain.BUSINESS,
    value: '',
    type: DataType.TEXTAREA,
  },

  // {
  //     setting: 'maintenance',
  //     domain: SettingDomain.BUSINESS,
  //     value: 'true',
  //     type: DataType.BOOLEAN,
  //   },

  // order

  // {
  //   setting: 'commissionIncluded',
  //   domain: SettingDomain.ORDER,
  //   type: DataType.BOOLEAN,
  //   value: 'true',
  // },
  // {
  //   setting: 'businessFreeDeliveryOver',
  //   domain: SettingDomain.ORDER,
  //   value: '4999.000000000000000000000000000000',
  //   type: DataType.NUMBER,
  // },

  {
    setting: 'shippingKMCharge',
    domain: SettingDomain.ORDER,
    value: '2.000000000000000000000000000000',
    type: DataType.NUMBER,
  },
  {
    setting: 'deliveryCommission',
    domain: SettingDomain.ORDER,
    value: '2.000000000000000000000000000000',
    type: DataType.NUMBER,
  },

  // {
  //   setting: 'storeConfirmOrder',
  //   domain: SettingDomain.ORDER,
  //   value: 'true',
  //   type: DataType.BOOLEAN,
  // },

  // Store

  {
    setting: 'businessOrderCommissionRateForAll',
    domain: SettingDomain.STORE,
    value: 'true',
    type: DataType.BOOLEAN,
  },

  {
    setting: 'filterByZone',
    domain: SettingDomain.STORE,
    value: 'true',
    type: DataType.BOOLEAN,
  },

  {
    setting: 'businessOrderCommissionRate',
    domain: SettingDomain.STORE,
    value: '0.000000000000000000000000000000',
    type: DataType.NUMBER,
  },

  {
    // Admin global commission mode: PERCENTAGE = businessOrderCommissionRate is a
    // percent of the order subtotal; FIXED = it is a flat amount added once per order.
    // Defaults to FIXED so any pre-existing rate keeps its legacy flat behavior.
    setting: 'businessOrderCommissionType',
    domain: SettingDomain.STORE,
    value: 'FIXED',
    type: DataType.ENUM,
    enum: ['PERCENTAGE', 'FIXED'],
  },

  {
    setting: 'StoreTaxForAll',
    domain: SettingDomain.STORE,
    value: 'true',
    type: DataType.BOOLEAN,
  },

  {
    setting: 'StoreTaxRate',
    domain: SettingDomain.STORE,
    value: '0.000000000000000000000000000000',
    type: DataType.NUMBER,
  },

  //  {
  //     setting: 'storeNeedApproval',
  //     domain: SettingDomain.STORE,
  //     value: 'true',
  //     type: DataType.BOOLEAN,
  //   },
  // {
  //   setting: 'storeNeedApprovalForServices',
  //   domain: SettingDomain.STORE,
  //   value: 'true',
  //   type: DataType.BOOLEAN,
  // },
  {
    setting: 'storeNearestByKM',
    domain: SettingDomain.STORE,
    value: '10000',
    type: DataType.NUMBER,
  },

  // CUSTOMER
  // {
  //   setting: 'customerLoyaltyPoints',
  //   domain: SettingDomain.CUSTOMER,
  //   value: 'true',
  //   type: DataType.BOOLEAN,
  // },
  // {
  //   setting: 'customer1PoundPoints',
  //   domain: SettingDomain.CUSTOMER,
  //   value: '1.000000000000000000000000000000',
  //   type: DataType.NUMBER,
  // },
  // {
  //   setting: 'customerOrderPoints',
  //   domain: SettingDomain.CUSTOMER,
  //   value: '2.000000000000000000000000000000',
  //   type: DataType.NUMBER,
  // },
  // {
  //   setting: 'customerMinPointsConvert',
  //   domain: SettingDomain.CUSTOMER,
  //   value: '2.000000000000000000000000000000',
  //   type: DataType.NUMBER,
  // },

  // DELIVERY
  {
    setting: 'deliveryAcceptanceTimer',
    domain: SettingDomain.DELIVERY,
    value: '90',
    type: DataType.NUMBER,
  },

  {
    setting: 'deliveryAssignmentMode',
    domain: SettingDomain.DELIVERY,
    value: 'AUTO',
    type: DataType.ENUM,
    enum: ['AUTO', 'MANUAL'],
  },
  // How long after the store accepts (PREPARING) the system waits before
  // searching for a driver — AUTO assignment mode only (MANUAL is unaffected,
  // the admin assigns directly). Default 480s = 8 minutes.
  {
    setting: 'driverAssignmentDelaySeconds',
    domain: SettingDomain.DELIVERY,
    value: '480',
    type: DataType.NUMBER,
  },
  {
    setting: 'deliveryAfkBreakMinutes',
    domain: SettingDomain.DELIVERY,
    value: '15',
    type: DataType.NUMBER,
  },
  {
    setting: 'deliveryAfkBreakEnabled',
    domain: SettingDomain.DELIVERY,
    value: 'false',
    type: DataType.BOOLEAN,
  },
  // Geofence radii enforced in OrderService.changeStatus. Seeded to match the
  // previously hardcoded 1500m so behavior is unchanged until an admin retunes them.
  {
    setting: 'pickupGeofenceRadiusMeters',
    domain: SettingDomain.DELIVERY,
    value: '1500',
    type: DataType.NUMBER,
  },
  {
    setting: 'deliveryGeofenceRadiusMeters',
    domain: SettingDomain.DELIVERY,
    value: '1500',
    type: DataType.NUMBER,
  },
  {
    setting: 'customDeliveryExtraStopPrice',
    domain: SettingDomain.ORDER,
    value: '0',
    type: DataType.NUMBER,
  },
  {
    setting: 'customDeliveryEnabled',
    domain: SettingDomain.ORDER,
    value: 'true',
    type: DataType.BOOLEAN,
  },
  // Whether customers can choose OrderType.PICKUP (self-pickup from branch) at all.
  {
    setting: 'pickupEnabled',
    domain: SettingDomain.ORDER,
    value: 'true',
    type: DataType.BOOLEAN,
  },
  // Custom-delivery (private courier) pricing — kept independent from the regular
  // store-delivery settings (shippingKMCharge/deliveryCommission) so admins can
  // tune one without moving the other. Seeded to match the old shared values
  // (2 + 2) so nothing changes in price until an admin retunes them.
  {
    setting: 'customDeliveryKMCharge',
    domain: SettingDomain.ORDER,
    value: '2.000000000000000000000000000000',
    type: DataType.NUMBER,
  },
  {
    setting: 'customDeliveryBaseFee',
    domain: SettingDomain.ORDER,
    value: '2.000000000000000000000000000000',
    type: DataType.NUMBER,
  },
  // Custom-delivery's own platform commission on the declared items/purchases cost —
  // independent of businessOrderCommissionRate(ForAll)/Type, which price store orders.
  // Seeded to match the current shared values (enabled, 0, FIXED) so nothing changes
  // in price until an admin retunes them.
  {
    setting: 'customDeliveryCommissionForAll',
    domain: SettingDomain.ORDER,
    value: 'true',
    type: DataType.BOOLEAN,
  },
  {
    setting: 'customDeliveryCommissionRate',
    domain: SettingDomain.ORDER,
    value: '0.000000000000000000000000000000',
    type: DataType.NUMBER,
  },
  {
    setting: 'customDeliveryCommissionType',
    domain: SettingDomain.ORDER,
    value: 'FIXED',
    type: DataType.ENUM,
    enum: ['PERCENTAGE', 'FIXED'],
  },
  // Manual checkpoint for the admin dashboard's "current period" earnings summary
  // (mirrors Store.dashboardPeriodStartAt for the store-level version). Empty =
  // no reset yet, summary covers all-time. Resetting only moves this date forward;
  // it never touches any Order/Transaction row.
  {
    setting: 'adminDashboardPeriodStartAt',
    domain: SettingDomain.BUSINESS,
    value: '',
    type: DataType.DATE,
  },
  // Online-seller delivery (separate system from the purchase/shopping custom
  // delivery above) — single pickup/dropoff, zone-based, flat pricing (no
  // per-km calculation).
  {
    setting: 'onlineDeliveryEnabled',
    domain: SettingDomain.ORDER,
    value: 'true',
    type: DataType.BOOLEAN,
  },
  {
    setting: 'onlineDeliveryBaseFee',
    domain: SettingDomain.ORDER,
    value: '15',
    type: DataType.NUMBER,
  },
  {
    setting: 'onlineDeliveryCommission',
    domain: SettingDomain.ORDER,
    value: '0',
    type: DataType.NUMBER,
  },
  // Optional packaging add-on for online-seller deliveries — one flat
  // admin-controlled price (per user's explicit choice, not per-item/tiered).
  {
    setting: 'packagingFee',
    domain: SettingDomain.ORDER,
    value: '5',
    type: DataType.NUMBER,
  },
  // Whether the packaging add-on can be requested at all on online-seller
  // deliveries. When false, any recipient with packagingRequested: true is
  // rejected with a clear error (checked in OrderService.calculateOnlineDeliveryOrder).
  {
    setting: 'onlineDeliveryPackagingEnabled',
    domain: SettingDomain.ORDER,
    value: 'true',
    type: DataType.BOOLEAN,
  },
  // Online Representative specific base delivery price (separated from Purchases/Restaurants)
  {
    setting: 'onlineRepresentativeBaseFee',
    domain: SettingDomain.ORDER,
    value: '2.000000000000000000000000000000',
    type: DataType.NUMBER,
  },
  // Online Representative specific additional station price (separated from Purchases/Restaurants)
  {
    setting: 'onlineRepresentativeExtraStopPrice',
    domain: SettingDomain.ORDER,
    value: '0',
    type: DataType.NUMBER,
  },
] as const satisfies readonly Setting[];

export const SettingKeys = settingTypes.map((s) => s.setting);

export type SettingKey = (typeof SettingKeys)[number];
