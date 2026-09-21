/* eslint-disable no-console */
/**
 * tanta-full-ecosystem.seed.ts
 *
 * Comprehensive, production-grade test seed for Tanta City (مدينة طنطا).
 * Populates a complete, rich ecosystem specifically for Tanta across:
 * - City 2 (طنطا) + City 1 (المحلة الكبرى for comparison)
 * - 5 authentic Tanta zones with real coordinates & polygons
 * - 10 authentic Tanta stores & restaurants (Koshary, Burgers, Pizza, Sweets, Seafood, Grills, etc.)
 * - Store owner accounts, branches in Tanta, 24/7 store schedules, wallets
 * - Menu categories, 40+ products with sizes, addons, and high-res imagery
 * - StoreZonePrice delivery matrix for all Tanta zones
 * - Layered Delivery Promotions (Store, Zone, Store-Zone)
 * - Tanta targeted Banners & BannerZones
 * - Fortune Wheel Items linked directly to Tanta stores
 * - Tanta Coupons (TANTA20, WELCOME_TANTA, etc.)
 * - Tanta Customers with saved Tanta addresses & wallet balances
 * - Tanta Delivery Drivers with active availability & coordinates
 * - Realistic Orders across all statuses (PENDING, PREPARING, READY_PICKUP, ON_THE_WAY, DELIVERED, CANCELLED)
 *
 * Test Credentials:
 * ─────────────────
 * Admin:       admin@makanak.com     / Admin@1234
 * Tanta Cust:  customer_tanta@makanak.com / Customer@1234
 * Tanta Cust2: customer2_tanta@makanak.com / Customer@1234
 * Tanta Driver: driver_tanta@makanak.com / Driver@1234
 * Tanta Driver2: driver2_tanta@makanak.com / Driver@1234
 * Store Owners: owner_koshary@makanak.com, owner_burger@makanak.com, ... / Owner@1234
 *
 * Run via:
 *   npx ts-node -r tsconfig-paths/register prisma/seeds/tanta-full-ecosystem.seed.ts
 */

import {
  PrismaClient,
  Days,
  PaymentStatus,
  PaymentMethod,
  OrderStatus,
  OrderType,
  ServiceStatus,
  CouponType,
  DiscountType,
  CommissionType,
  BranchStatus,
  DeliveryPromoScope,
  PromoDiscountType,
  BannerTargetType,
  FortuneWheelRewardType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const HASH_SALT = 10;
const hash = (pass: string) => bcrypt.hashSync(pass, HASH_SALT);

// Role constants
const RoleIds = {
  ADMIN: 1,
  CUSTOMER: 2,
  DELIVERY: 3,
  STORE: 4,
} as const;

const RolesKeys = {
  ADMIN: 'Admin',
  CUSTOMER: 'Customer',
  DELIVERY: 'Delivery',
  STORE: 'Store',
} as const;

// ─── TANTA GEOGRAPHY ──────────────────────────────────────────────────────────
// Center: (30.7865, 31.0004)
//
// 5 non-overlapping zones enclosing Tanta neighborhoods:
// 1. Al-Stad (الاستاد): 30.7950 to 30.8120 lat, 30.9900 to 31.0100 lng
// 2. Al-Nahas & Mahatta (النحاس والمحطة): 30.7760 to 30.7940 lat, 30.9850 to 30.9980 lng
// 3. Saeed & Gomhouria (سعيد والجمهورية): 30.7780 to 30.7940 lat, 30.9990 to 31.0180 lng
// 4. Corniche & Qohafa (الكورنيش وقحافة): 30.7600 to 30.7750 lat, 30.9900 to 31.0200 lng
// 5. Seeger & Terat El-Sheety (سيجر وترعة الشيتي): 30.7600 to 30.7800 lat, 30.9650 to 30.9840 lng

const TANTA_ZONES_CONFIG = [
  {
    id: 201,
    name: { ar: 'منطقة الاستاد ومحب', en: 'Al-Stad & Moheb Zone' },
    center: { lat: 30.8010, lng: 30.9980 },
    deliveryPrice: 15,
    deliveryPriceAfterDiscount: 10,
    coords: [
      { lat: 30.7950, lng: 30.9900 },
      { lat: 30.7950, lng: 31.0100 },
      { lat: 30.8120, lng: 31.0100 },
      { lat: 30.8120, lng: 30.9900 },
      { lat: 30.7950, lng: 30.9900 },
    ],
  },
  {
    id: 202,
    name: { ar: 'شارع النحاس والمحطة', en: 'Al-Nahas & Station Zone' },
    center: { lat: 30.7850, lng: 30.9920 },
    deliveryPrice: 15,
    deliveryPriceAfterDiscount: 10,
    coords: [
      { lat: 30.7760, lng: 30.9850 },
      { lat: 30.7760, lng: 30.9980 },
      { lat: 30.7940, lng: 30.9980 },
      { lat: 30.7940, lng: 30.9850 },
      { lat: 30.7760, lng: 30.9850 },
    ],
  },
  {
    id: 203,
    name: { ar: 'شارع سعيد والجمهورية', en: 'Saeed & Gomhouria Zone' },
    center: { lat: 30.7880, lng: 31.0080 },
    deliveryPrice: 18,
    deliveryPriceAfterDiscount: 12,
    coords: [
      { lat: 30.7780, lng: 30.9990 },
      { lat: 30.7780, lng: 31.0180 },
      { lat: 30.7940, lng: 31.0180 },
      { lat: 30.7940, lng: 30.9990 },
      { lat: 30.7780, lng: 30.9990 },
    ],
  },
  {
    id: 204,
    name: { ar: 'الكورنيش وقحافة', en: 'Corniche & Qohafa Zone' },
    center: { lat: 30.7700, lng: 31.0050 },
    deliveryPrice: 20,
    deliveryPriceAfterDiscount: 15,
    coords: [
      { lat: 30.7600, lng: 30.9900 },
      { lat: 30.7600, lng: 31.0200 },
      { lat: 30.7750, lng: 31.0200 },
      { lat: 30.7750, lng: 30.9900 },
      { lat: 30.7600, lng: 30.9900 },
    ],
  },
  {
    id: 205,
    name: { ar: 'منطقة سيجر وترعة الشيتي', en: 'Seeger & Sheety Zone' },
    center: { lat: 30.7700, lng: 30.9780 },
    deliveryPrice: 20,
    deliveryPriceAfterDiscount: 15,
    coords: [
      { lat: 30.7600, lng: 30.9650 },
      { lat: 30.7600, lng: 30.9840 },
      { lat: 30.7800, lng: 30.9840 },
      { lat: 30.7800, lng: 30.9650 },
      { lat: 30.7600, lng: 30.9650 },
    ],
  },
];

// El Mahalla baseline comparison zone
const MAHALLA_ZONE_CONFIG = {
  id: 101,
  name: { ar: 'منطقة المحطة - المحلة الكبرى', en: 'El Mahalla Station Zone' },
  center: { lat: 30.9700, lng: 31.1650 },
  deliveryPrice: 15,
  coords: [
    { lat: 30.9600, lng: 31.1550 },
    { lat: 30.9600, lng: 31.1750 },
    { lat: 30.9800, lng: 31.1750 },
    { lat: 30.9800, lng: 31.1550 },
    { lat: 30.9600, lng: 31.1550 },
  ],
};

// ─── 10 AUTHENTIC TANTA STORES ────────────────────────────────────────────────
const TANTA_STORES = [
  {
    id: 201,
    name: { ar: 'كشري طنطاوي الأصلي', en: 'Koshary Tantawy' },
    logo: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&auto=format&fit=crop&q=80',
    cover: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=1000&auto=format&fit=crop&q=80',
    ownerEmail: 'owner_koshary@makanak.com',
    ownerName: 'أحمد الطنطاوي (كشري طنطاوي)',
    ownerPhone: '+201010001201',
    branchName: { ar: 'فرع النحاس الرئيسي', en: 'Main Nahas Branch' },
    branchAddress: 'شارع النحاس بجوار محطة قطار طنطا',
    lat: 30.7850,
    lng: 30.9920,
    primaryZoneId: 202,
    rating: 4.9,
    review: 142,
    prepTimeMinutes: 15,
    minOrderAmount: 30,
    isPartner: true,
    categories: [
      {
        id: 2011,
        name: { ar: 'أطباق كشري طنطاوي', en: 'Koshary Bowls' },
        services: [
          {
            id: 20101,
            name: { ar: 'كشري سوبر طنطاوي مع تقلية وحمص إضافي', en: 'Super Tantawy Koshary' },
            desc: { ar: 'أرز، عدس، مكرونة، حمص، تقلية مقرمشة، صلصة ودقة خاصة', en: 'Traditional Egyptian Koshary with crispy onions and special sauce' },
            price: 55,
            priceAfterDiscount: 45,
            image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80',
            sizes: [
              { name: { ar: 'وسط', en: 'Medium' }, price: 45, isDefault: true },
              { name: { ar: 'كبير', en: 'Large' }, price: 55 },
              { name: { ar: 'عائلي سوبر', en: 'Family Mega' }, price: 90 },
            ],
            addons: [
              { name: { ar: 'تقلية بصل مقرمشة إضافية', en: 'Extra Crispy Onions' }, price: 10 },
              { name: { ar: 'دقة وشطة زيادة', en: 'Extra Garlic Vinegar & Chili' }, price: 5 },
            ],
          },
          {
            id: 20102,
            name: { ar: 'طاجن مكرونة باللحمة المفرومة في الفرن', en: 'Oven Meat Tajine' },
            desc: { ar: 'طاجن فخار مكرونة بالصلصة الغنية واللحم المفروم المتبل', en: 'Clay pot pasta baked with minced beef' },
            price: 65,
            priceAfterDiscount: 55,
            image: 'https://images.unsplash.com/photo-1621996346565-e3d5d6281699?w=600&auto=format&fit=crop&q=80',
            sizes: [],
            addons: [
              { name: { ar: 'موتزاريلا سايحة على الوش', en: 'Melted Mozzarella' }, price: 15 },
            ],
          },
          {
            id: 20103,
            name: { ar: 'طاجن فراخ بالموتزاريلا والصلصة الإيطالية', en: 'Chicken Mozzarella Tajine' },
            desc: { ar: 'قطع فراخ متبلة مع مكرونة وجبنة موتزاريلا سايحة', en: 'Spiced chicken chunks with pasta and mozzarella' },
            price: 70,
            priceAfterDiscount: 60,
            image: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600&auto=format&fit=crop&q=80',
            sizes: [],
            addons: [],
          },
        ],
      },
      {
        id: 2012,
        name: { ar: 'حلويات ومشروبات', en: 'Desserts & Drinks' },
        services: [
          {
            id: 20104,
            name: { ar: 'أرز باللبن فرن بالقشطة والمكسرات', en: 'Baked Rice Pudding with Nuts' },
            desc: { ar: 'أرز باللبن مخبوز في الفرن البلدي مع القشطة والمكسرات', en: 'Oven-baked Egyptian rice pudding' },
            price: 35,
            priceAfterDiscount: 28,
            image: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?w=600&auto=format&fit=crop&q=80',
            sizes: [],
            addons: [],
          },
        ],
      },
    ],
  },
  {
    id: 202,
    name: { ar: 'برجر ستيشن طنطا', en: 'Burger Station Tanta' },
    logo: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300&auto=format&fit=crop&q=80',
    cover: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=1000&auto=format&fit=crop&q=80',
    ownerEmail: 'owner_burger@makanak.com',
    ownerName: 'محمود برجر (برجر ستيشن)',
    ownerPhone: '+201010001202',
    branchName: { ar: 'فرع الاستاد', en: 'Al-Stad Branch' },
    branchAddress: 'شارع الاستاد الرئيسي أمام مدرسة اللغات',
    lat: 30.8010,
    lng: 30.9980,
    primaryZoneId: 201,
    rating: 4.85,
    review: 198,
    prepTimeMinutes: 20,
    minOrderAmount: 50,
    isPartner: true,
    categories: [
      {
        id: 2021,
        name: { ar: 'سندوتشات برجر سماش', en: 'Smash Burgers' },
        services: [
          {
            id: 20201,
            name: { ar: 'كلاسيك دبل سماش برجر بالجبنة الشيدر', en: 'Classic Double Smash' },
            desc: { ar: 'قطعتين لحم أنجوس بلدي، جبنة شيدر دوبل، صوص ستيشن الخاص، خيار مخلل وخس فريش', en: 'Double Angus beef patties, double cheddar cheese, special burger sauce' },
            price: 135,
            priceAfterDiscount: 115,
            image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
            sizes: [
              { name: { ar: 'سينجل (قطعة واحدة)', en: 'Single' }, price: 95 },
              { name: { ar: 'دبل (قطعتين)', en: 'Double' }, price: 115, isDefault: true },
              { name: { ar: 'تربل (3 قطع)', en: 'Triple' }, price: 145 },
            ],
            addons: [
              { name: { ar: 'بيكون لحم بقري مدخن', en: 'Smoked Beef Bacon' }, price: 25 },
              { name: { ar: 'أصابع هالبينو مقلية', en: 'Jalapeno Poppers' }, price: 20 },
              { name: { ar: 'صوص جبنة شيدر سايحة', en: 'Melted Cheddar Dip' }, price: 18 },
            ],
          },
          {
            id: 20202,
            name: { ar: 'سموكي بيكون مشروم برجر', en: 'Smoky Bacon Mushroom Burger' },
            desc: { ar: 'برجر لحم فاخر مع مشروم سوتيه طازج وبيكون وصوص باربيكيو مدخن', en: 'Beef patty with fresh sauteed mushrooms, bacon, and BBQ sauce' },
            price: 150,
            priceAfterDiscount: 130,
            image: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80',
            sizes: [],
            addons: [],
          },
          {
            id: 20203,
            name: { ar: 'كرسبي تشيكن تاور حار', en: 'Spicy Crispy Chicken Tower' },
            desc: { ar: 'صدور دجاج كرسبي مقرمشة مع صوص مايونيز حار وشريحة جبنة شيدر', en: 'Crispy fried chicken fillet with spicy sauce' },
            price: 120,
            priceAfterDiscount: 105,
            image: 'https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?w=600&auto=format&fit=crop&q=80',
            sizes: [],
            addons: [],
          },
        ],
      },
      {
        id: 2022,
        name: { ar: 'مقبلات وبطاطس', en: 'Sides & Fries' },
        services: [
          {
            id: 20204,
            name: { ar: 'تشيزي فرايز ستيشن مع هالبينو', en: 'Cheesy Station Fries' },
            desc: { ar: 'بطاطس مقلية ذهبية مغطاة بصوص الشيدر وقطع الهالبينو', en: 'Golden fries loaded with cheddar cheese & jalapenos' },
            price: 55,
            priceAfterDiscount: 45,
            image: 'https://images.unsplash.com/photo-1585109649139-366815a0d713?w=600&auto=format&fit=crop&q=80',
            sizes: [],
            addons: [],
          },
        ],
      },
    ],
  },
  {
    id: 203,
    name: { ar: 'بيتزا وفطائر السلطان', en: 'Sultan Pizza & Pies' },
    logo: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=300&auto=format&fit=crop&q=80',
    cover: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=1000&auto=format&fit=crop&q=80',
    ownerEmail: 'owner_pizza@makanak.com',
    ownerName: 'سامح سلطان (بيتزا السلطان)',
    ownerPhone: '+201010001203',
    branchName: { ar: 'فرع شارع الجيش', en: 'El-Geish Branch' },
    branchAddress: 'شارع الجيش أمام عمر أفندي - طنطا',
    lat: 30.7880,
    lng: 31.0010,
    primaryZoneId: 202,
    rating: 4.8,
    review: 110,
    prepTimeMinutes: 25,
    minOrderAmount: 60,
    isPartner: true,
    categories: [
      {
        id: 2031,
        name: { ar: 'بيتزا إيطالي وشرقي', en: 'Pizza Menu' },
        services: [
          {
            id: 20301,
            name: { ar: 'بيتزا سوبر سوبريم ميكس لحوم وجبن', en: 'Super Supreme Pizza' },
            desc: { ar: 'سجق بلدي، بيبروني، لحم مفروم، فلفل ألوان، زيتون أسود، جبنة موتزاريلا طبيعي', en: 'Beef sausage, pepperoni, minced meat, peppers, olives, mozzarella' },
            price: 160,
            priceAfterDiscount: 135,
            image: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80',
            sizes: [
              { name: { ar: 'وسط (28 سم)', en: 'Medium 28cm' }, price: 110 },
              { name: { ar: 'كبير (35 سم)', en: 'Large 35cm' }, price: 135, isDefault: true },
              { name: { ar: 'عائلي جامبو (40 سم)', en: 'Jumbo 40cm' }, price: 175 },
            ],
            addons: [
              { name: { ar: 'أطراف محشوة جبنة شيدر وموتزاريلا', en: 'Stuffed Crust' }, price: 30 },
              { name: { ar: 'موتزاريلا إضافية دبل', en: 'Double Cheese' }, price: 25 },
            ],
          },
          {
            id: 20302,
            name: { ar: 'بيتزا باربيكيو تشيكن رانش', en: 'BBQ Chicken Ranch Pizza' },
            desc: { ar: 'قطع دجاج مشوي، صوص باربيكيو، صوص رانش، جبنة موتزاريلا وبصل مكرمل', en: 'Grilled chicken, BBQ sauce, ranch, mozzarella and onions' },
            price: 155,
            priceAfterDiscount: 130,
            image: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&auto=format&fit=crop&q=80',
            sizes: [],
            addons: [],
          },
        ],
      },
      {
        id: 2032,
        name: { ar: 'فطير مشلتت وحلو', en: 'Egyptian Feteer & Pies' },
        services: [
          {
            id: 20303,
            name: { ar: 'فطيرة مشلتت فلاحي بالسمن البلدي والقشطة', en: 'Traditional Feteer Meshaltet' },
            desc: { ar: 'فطير مورق بالسمن البلدي الفلاحي مع عسل أبيض وجبنة قديمة', en: 'Flaky layered pastry baked with real clarified butter' },
            price: 120,
            priceAfterDiscount: 100,
            image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop&q=80',
            sizes: [],
            addons: [],
          },
        ],
      },
    ],
  },
  {
    id: 204,
    name: { ar: 'حلواني الصعيدي طنطا', en: 'Al-Saidi Sweets Tanta' },
    logo: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?w=300&auto=format&fit=crop&q=80',
    cover: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=1000&auto=format&fit=crop&q=80',
    ownerEmail: 'owner_sweets@makanak.com',
    ownerName: 'الحاج مصطفى الصعيدي (حلويات الصعيدي)',
    ownerPhone: '+201010001204',
    branchName: { ar: 'فرع شارع البحر', en: 'El-Bahr St. Branch' },
    branchAddress: 'شارع البحر الرئيسي بجوار ديوان المحافظة - طنطا',
    lat: 30.7870,
    lng: 30.9990,
    primaryZoneId: 202,
    rating: 4.95,
    review: 320,
    prepTimeMinutes: 10,
    minOrderAmount: 50,
    isPartner: true,
    categories: [
      {
        id: 2041,
        name: { ar: 'مشبك وحلويات طنطا الشهيرة', en: 'Famous Tanta Sweets' },
        services: [
          {
            id: 20401,
            name: { ar: 'علبة مشبك طنطاوي فاخر عسلي (1 كجم)', en: 'Famous Tanta Meshabbak (1kg)' },
            desc: { ar: 'المشبك الطنطاوي الأصلي بالسمن البلدي والعسل المصفى', en: 'Authentic crispy Tanta Meshabbak sweet with honey' },
            price: 110,
            priceAfterDiscount: 95,
            image: 'https://images.unsplash.com/photo-1587314168485-3236d6710814?w=600&auto=format&fit=crop&q=80',
            sizes: [
              { name: { ar: 'نصف كيلو', en: '500g' }, price: 55 },
              { name: { ar: '1 كيلو فاخر', en: '1kg' }, price: 95, isDefault: true },
              { name: { ar: '2 كيلو هدايا', en: '2kg Gift Box' }, price: 185 },
            ],
            addons: [],
          },
          {
            id: 20402,
            name: { ar: 'صينية بسبوسة بالسمن البلدي والبندق المحمص', en: 'Basbousa with Roasted Hazelnuts' },
            desc: { ar: 'بسبوسة طرية ودايبة بالسمن البلدي الفلاحي والبندق الفاخر', en: 'Soft semolina cake soaked in syrup with hazelnuts' },
            price: 140,
            priceAfterDiscount: 120,
            image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&auto=format&fit=crop&q=80',
            sizes: [],
            addons: [],
          },
          {
            id: 20403,
            name: { ar: 'تورتة لوتس سبيشال عائلية', en: 'Lotus Biscoff Cake' },
            desc: { ar: 'تورتة طبقات كريمة اللوتس مع بسكويت اللوتس المقرمش', en: 'Rich lotus biscoff celebration cake' },
            price: 280,
            priceAfterDiscount: 240,
            image: 'https://images.unsplash.com/photo-1535141192574-5d4897c13136?w=600&auto=format&fit=crop&q=80',
            sizes: [],
            addons: [],
          },
        ],
      },
    ],
  },
  {
    id: 205,
    name: { ar: 'مشويات وكبابجي النحاس', en: 'Nahas Grills & BBQ' },
    logo: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=300&auto=format&fit=crop&q=80',
    cover: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=1000&auto=format&fit=crop&q=80',
    ownerEmail: 'owner_grills@makanak.com',
    ownerName: 'إبراهيم النحاس (كبابجي النحاس)',
    ownerPhone: '+201010001205',
    branchName: { ar: 'فرع النحاس', en: 'Nahas Branch' },
    branchAddress: 'شارع النحاس تقاطع الفاتح - طنطا',
    lat: 30.7830,
    lng: 30.9940,
    primaryZoneId: 202,
    rating: 4.88,
    review: 165,
    prepTimeMinutes: 30,
    minOrderAmount: 80,
    isPartner: true,
    categories: [
      {
        id: 2051,
        name: { ar: 'مشويات على الفحم', en: 'Charcoal Grills' },
        services: [
          {
            id: 20501,
            name: { ar: 'كيلو كفتة ضاني بلدي على الفحم مع طحينة وعيش', en: '1kg Grilled Lamb Kofta' },
            desc: { ar: 'كفتة بلدي متبلة بخلطة النحاس السرية مشوية على الفحم مع سلطات وعيش بلدي سخن', en: 'Charcoal grilled Egyptian lamb kofta with tahini and fresh bread' },
            price: 380,
            priceAfterDiscount: 340,
            image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&auto=format&fit=crop&q=80',
            sizes: [
              { name: { ar: 'ربع كيلو', en: 'Quarter kg' }, price: 95 },
              { name: { ar: 'نصف كيلو', en: 'Half kg' }, price: 180 },
              { name: { ar: 'كيلو كامل', en: '1 kg' }, price: 340, isDefault: true },
            ],
            addons: [
              { name: { ar: 'طبق طحينة وسلطة بلدي زيادة', en: 'Extra Tahini & Salad' }, price: 15 },
              { name: { ar: 'أرز بسمتي أصفر بالمكسرات', en: 'Basmati Rice with Nuts' }, price: 35 },
            ],
          },
          {
            id: 20502,
            name: { ar: 'وجبة ميكس جريل النحاس (شيش وكفتة وكباب)', en: 'Mix Grill Platter' },
            desc: { ar: 'كفتة مشوية، شيش طاووق، كباب بتلو، أرز بسمتي وسلطات', en: 'Assorted grills with kofta, shish tawook, and kebab' },
            price: 220,
            priceAfterDiscount: 195,
            image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
            sizes: [],
            addons: [],
          },
        ],
      },
    ],
  },
  {
    id: 206,
    name: { ar: 'أسماك وسي فود طنطا', en: 'Tanta Seafood House' },
    logo: 'https://images.unsplash.com/photo-1534939561126-855b8675edd7?w=300&auto=format&fit=crop&q=80',
    cover: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=1000&auto=format&fit=crop&q=80',
    ownerEmail: 'owner_fish@makanak.com',
    ownerName: 'كابتن جابر (أسماك طنطا)',
    ownerPhone: '+201010001206',
    branchName: { ar: 'فرع شارع سعيد', en: 'Saeed Branch' },
    branchAddress: 'شارع سعيد أمام مستشفى الدلتا الدولي - طنطا',
    lat: 30.7910,
    lng: 31.0060,
    primaryZoneId: 203,
    rating: 4.75,
    review: 85,
    prepTimeMinutes: 35,
    minOrderAmount: 100,
    isPartner: true,
    categories: [
      {
        id: 2061,
        name: { ar: 'أسماك وطواجن بحرية', en: 'Fish & Seafood' },
        services: [
          {
            id: 20601,
            name: { ar: 'شوربة سي فود ملوكي بالكريمة والجمبري', en: 'Royal Creamy Seafood Soup' },
            desc: { ar: 'جمبري، كابوريا، فيليه، كاليماري، كريمة لباني غنية وتوابل بحرية', en: 'Rich creamy soup with shrimp, crab, calamari, and fish fillet' },
            price: 95,
            priceAfterDiscount: 80,
            image: 'https://images.unsplash.com/photo-1534939561126-855b8675edd7?w=600&auto=format&fit=crop&q=80',
            sizes: [],
            addons: [],
          },
          {
            id: 20602,
            name: { ar: 'طاجن جمبري إسكندراني بالخلطة الحمراء', en: 'Alexandrian Shrimp Tajine' },
            desc: { ar: 'جمبري بلدي طازج مطبوخ في طاجن فخار مع صوص طماطم متبل وفلفل حار', en: 'Fresh shrimp cooked in rich spiced tomato sauce' },
            price: 210,
            priceAfterDiscount: 185,
            image: 'https://images.unsplash.com/photo-1559742811-822873691df8?w=600&auto=format&fit=crop&q=80',
            sizes: [],
            addons: [],
          },
        ],
      },
    ],
  },
  {
    id: 207,
    name: { ar: 'شاورما الشام طنطا', en: 'Shawarma El-Sham Tanta' },
    logo: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=300&auto=format&fit=crop&q=80',
    cover: 'https://images.unsplash.com/photo-1561651823-34feb02250e4?w=1000&auto=format&fit=crop&q=80',
    ownerEmail: 'owner_shawarma@makanak.com',
    ownerName: 'أبو أنس السوري (شاورما الشام)',
    ownerPhone: '+201010001207',
    branchName: { ar: 'فرع شارع سعيد', en: 'Saeed Branch' },
    branchAddress: 'شارع سعيد بجوار صيدلية العزبي - طنطا',
    lat: 30.7890,
    lng: 31.0040,
    primaryZoneId: 203,
    rating: 4.82,
    review: 210,
    prepTimeMinutes: 15,
    minOrderAmount: 40,
    isPartner: true,
    categories: [
      {
        id: 2071,
        name: { ar: 'شاورما سوري وفتة', en: 'Syrian Shawarma' },
        services: [
          {
            id: 20701,
            name: { ar: 'وجبة شاورما فراخ عربي دبل مع بطاطس وتومية', en: 'Double Chicken Arabic Shawarma' },
            desc: { ar: 'سندوتشين شاورما فراخ سوري مقطعين مع بطاطس مقرمشة وتومية شامية ومخلل', en: 'Sliced Syrian shawarma roll served with fries, garlic sauce, and pickles' },
            price: 110,
            priceAfterDiscount: 95,
            image: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=600&auto=format&fit=crop&q=80',
            sizes: [
              { name: { ar: 'عربي سينجل', en: 'Single Arabic' }, price: 65 },
              { name: { ar: 'عربي دبل', en: 'Double Arabic' }, price: 95, isDefault: true },
              { name: { ar: 'عربي تربل عائلي', en: 'Triple Arabic' }, price: 135 },
            ],
            addons: [
              { name: { ar: 'علبة تومية إضافية', en: 'Extra Garlic Dip' }, price: 10 },
              { name: { ar: 'مخلل مشكل سوري', en: 'Syrian Pickles' }, price: 10 },
            ],
          },
          {
            id: 20702,
            name: { ar: 'فتة شاورما ميكس لحم وفراخ بالأرز البسمتي', en: 'Mix Shawarma Fatteh' },
            desc: { ar: 'أرز بسمتي مبهر، عيش شامي محمص، شاورما فراخ ولحم، صوص تومية وزبادي', en: 'Spiced basmati rice with crispy bread, mixed shawarma and yogurt sauce' },
            price: 130,
            priceAfterDiscount: 110,
            image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
            sizes: [],
            addons: [],
          },
        ],
      },
    ],
  },
  {
    id: 208,
    name: { ar: 'كافيه ومطعم الكورنيش طنطا', en: 'Corniche Lounge & Cafe' },
    logo: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=300&auto=format&fit=crop&q=80',
    cover: 'https://images.unsplash.com/photo-1445116572660-238429888843?w=1000&auto=format&fit=crop&q=80',
    ownerEmail: 'owner_cafe@makanak.com',
    ownerName: 'كريم البحيري (كافيه الكورنيش)',
    ownerPhone: '+201010001208',
    branchName: { ar: 'فرع الكورنيش', en: 'Corniche Branch' },
    branchAddress: 'طريق الكورنيش بجوار نادي المعلمين - طنطا',
    lat: 30.7710,
    lng: 31.0060,
    primaryZoneId: 204,
    rating: 4.7,
    review: 64,
    prepTimeMinutes: 15,
    minOrderAmount: 35,
    isPartner: true,
    categories: [
      {
        id: 2081,
        name: { ar: 'قهوة ومشروبات منعشة', en: 'Coffee & Drinks' },
        services: [
          {
            id: 20801,
            name: { ar: 'سبانش لاتيه مثلج مميز مع كراميل', en: 'Iced Spanish Latte' },
            desc: { ar: 'إسبريسو غني، حليب مكثف محلى، حليب فريش، صوص كراميل ومكعبات ثلج', en: 'Espresso with sweetened condensed milk and ice' },
            price: 55,
            priceAfterDiscount: 45,
            image: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=600&auto=format&fit=crop&q=80',
            sizes: [],
            addons: [],
          },
          {
            id: 20802,
            name: { ar: 'سموذي مانجو وتوت بري فريش', en: 'Mango Berry Smoothie' },
            desc: { ar: 'عصير مانجو طبيعي مع قطع توت بري مثلج وزبادي خفيف', en: 'Fresh mango and berries blended to perfection' },
            price: 60,
            priceAfterDiscount: 50,
            image: 'https://images.unsplash.com/photo-1505252585461-04db1eb84625?w=600&auto=format&fit=crop&q=80',
            sizes: [],
            addons: [],
          },
        ],
      },
    ],
  },
  {
    id: 209,
    name: { ar: 'هايبر ماركت الأمل طنطا', en: 'Al-Amal Hypermarket Tanta' },
    logo: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?w=300&auto=format&fit=crop&q=80',
    cover: 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=1000&auto=format&fit=crop&q=80',
    ownerEmail: 'owner_market@makanak.com',
    ownerName: 'أشرف الجمال (هايبر الأمل)',
    ownerPhone: '+201010001209',
    branchName: { ar: 'فرع الاستاد هايبر', en: 'Al-Stad Hyper Branch' },
    branchAddress: 'ميدان الاستاد - مول الأمل التجاري - طنطا',
    lat: 30.7990,
    lng: 30.9960,
    primaryZoneId: 201,
    rating: 4.65,
    review: 130,
    prepTimeMinutes: 20,
    minOrderAmount: 100,
    isPartner: true,
    categories: [
      {
        id: 2091,
        name: { ar: 'منتجات ألبان وبقالة', en: 'Dairy & Grocery' },
        services: [
          {
            id: 20901,
            name: { ar: 'جبنة رومي قديمة فاخرة (500 جم)', en: 'Aged Roumy Cheese (500g)' },
            desc: { ar: 'جبنة رومي بطارخ مبشورة أو شرائح فاخرة من مزارع الدلتا', en: 'Traditional aged Egyptian Roumy cheese' },
            price: 160,
            priceAfterDiscount: 145,
            image: 'https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?w=600&auto=format&fit=crop&q=80',
            sizes: [],
            addons: [],
          },
          {
            id: 20902,
            name: { ar: 'حليب جهينة كامل الدسم (كرتونة 6 لتر)', en: 'Juhayna Milk Pack (6L)' },
            desc: { ar: 'حليب طبيعي 100% مبستر كامل الدسم عائلي', en: 'Pure fresh full cream milk 6 pack' },
            price: 240,
            priceAfterDiscount: 220,
            image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&auto=format&fit=crop&q=80',
            sizes: [],
            addons: [],
          },
        ],
      },
    ],
  },
  {
    id: 210,
    name: { ar: 'وافل وكريب بابلز طنطا', en: 'Bubbles Waffle & Crepe' },
    logo: 'https://images.unsplash.com/photo-1562376552-0d160a2f238d?w=300&auto=format&fit=crop&q=80',
    cover: 'https://images.unsplash.com/photo-1562376552-0d160a2f238d?w=1000&auto=format&fit=crop&q=80',
    ownerEmail: 'owner_waffle@makanak.com',
    ownerName: 'زياد النجار (بابلز كريب)',
    ownerPhone: '+201010001210',
    branchName: { ar: 'فرع سيجر', en: 'Seeger Branch' },
    branchAddress: 'شارع الحكمة متفرع من سيجر - طنطا',
    lat: 30.7720,
    lng: 30.9780,
    primaryZoneId: 205,
    rating: 4.8,
    review: 92,
    prepTimeMinutes: 15,
    minOrderAmount: 40,
    isPartner: true,
    categories: [
      {
        id: 2101,
        name: { ar: 'كريب حادق وحلو', en: 'Crepes & Waffles' },
        services: [
          {
            id: 21001,
            name: { ar: 'كريب زنجر دجاج حار سوبر كرانشي', en: 'Super Crunchy Chicken Zinger Crepe' },
            desc: { ar: 'قطع دجاج مقرمشة، جبنة شيدر، موتزاريلا، صوص باربيكيو ومايونيز في عجينة كريب فرنسية', en: 'Crispy zinger chicken with cheese blend wrapped in french crepe' },
            price: 85,
            priceAfterDiscount: 70,
            image: 'https://images.unsplash.com/photo-1519676867240-f03562e64548?w=600&auto=format&fit=crop&q=80',
            sizes: [],
            addons: [
              { name: { ar: 'جبنة كيري إضافية', en: 'Extra Kiri Cheese' }, price: 15 },
              { name: { ar: 'هالبينو وصوص حار', en: 'Jalapeno & Hot Sauce' }, price: 8 },
            ],
          },
          {
            id: 21002,
            name: { ar: 'وافل بلجيكي بالنوتيلا والفراولة والموز', en: 'Belgian Nutella & Strawberry Waffle' },
            desc: { ar: 'وافل مقرمش ومغطى بشوكولاتة النوتيلا الغنية مع شرائح الفراولة والموز وبولة آيس كريم', en: 'Crisp waffle loaded with nutella, fresh berries, and banana' },
            price: 75,
            priceAfterDiscount: 65,
            image: 'https://images.unsplash.com/photo-1562376552-0d160a2f238d?w=600&auto=format&fit=crop&q=80',
            sizes: [],
            addons: [],
          },
        ],
      },
    ],
  },
];

// Baseline store in El Mahalla for dashboard filter comparison
const MAHALLA_STORE = {
  id: 101,
  name: { ar: 'مطعم المحلاوي للمشويات', en: 'El Mahllawy Grills' },
  logo: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=300&auto=format&fit=crop&q=80',
  cover: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=1000&auto=format&fit=crop&q=80',
  ownerEmail: 'owner_mahalla@makanak.com',
  ownerName: 'محمود المحلاوي',
  ownerPhone: '+201010001101',
  branchName: { ar: 'فرع المحلة الرئيسي', en: 'Mahalla Main Branch' },
  branchAddress: 'شارع شكري القوتلي - المحلة الكبرى',
  lat: 30.9700,
  lng: 31.1650,
};

// ─── SEED FUNCTION ────────────────────────────────────────────────────────────

export async function seedTantaFullEcosystem(prismaClient: PrismaClient) {
  console.log('🚀 Starting Comprehensive Tanta City Ecosystem Seed...');

  // 0. Clean up previous test Tanta entities to ensure fresh, conflict-free run
  const allTantaZoneIds = TANTA_ZONES_CONFIG.map((z) => z.id);
  await prismaClient.storeRating.deleteMany({ where: { Order: { zoneId: { in: allTantaZoneIds } } } }).catch(() => {});
  await prismaClient.orderItem.deleteMany({ where: { Order: { zoneId: { in: allTantaZoneIds } } } }).catch(() => {});
  await prismaClient.order.deleteMany({ where: { zoneId: { in: allTantaZoneIds } } }).catch(() => {});
  await prismaClient.address.deleteMany({ where: { User: { email: { contains: 'tanta' } } } }).catch(() => {});
  await prismaClient.deliveryDetails.deleteMany({ where: { User: { email: { contains: 'tanta' } } } }).catch(() => {});
  await prismaClient.details.deleteMany({ where: { User: { email: { contains: 'tanta' } } } }).catch(() => {});
  await prismaClient.user.deleteMany({ where: { email: { contains: 'tanta' } } }).catch(() => {});
  console.log('  ✔ Previous Tanta test users & orders cleaned up');

  // 1. Languages
  for (const lang of [
    { key: 'en', name: 'English', file: 'uploads/i18n/en.json', frontFile: 'uploads/i18n/front/en.json' },
    { key: 'ar', name: 'Arabic', file: 'uploads/i18n/ar.json', frontFile: 'uploads/i18n/front/ar.json' },
  ]) {
    await prismaClient.language.upsert({ where: { key: lang.key }, update: {}, create: lang });
  }
  console.log('  ✔ Languages verified');

  // 2. Roles
  for (const r of [
    { id: RoleIds.ADMIN, roleKey: RolesKeys.ADMIN, name: { en: 'Admin', ar: 'مدير النظام' } },
    { id: RoleIds.CUSTOMER, roleKey: RolesKeys.CUSTOMER, name: { en: 'Customer', ar: 'عميل' } },
    { id: RoleIds.DELIVERY, roleKey: RolesKeys.DELIVERY, name: { en: 'Delivery', ar: 'مندوب توصيل' } },
    { id: RoleIds.STORE, roleKey: RolesKeys.STORE, name: { en: 'Store', ar: 'متجر' } },
  ]) {
    await prismaClient.role.upsert({
      where: { id: r.id },
      update: { roleKey: r.roleKey, name: r.name },
      create: { id: r.id, roleKey: r.roleKey, name: r.name },
    });
  }
  console.log('  ✔ Roles verified');

  // 3. Admin user & wallet
  const adminRole = await prismaClient.role.findFirst({ where: { roleKey: RolesKeys.ADMIN } });
  const existingAdmin = await prismaClient.user.findFirst({
    where: { email: 'admin@makanak.com', roleKey: RolesKeys.ADMIN },
  });
  if (!existingAdmin) {
    await prismaClient.user.create({
      data: {
        name: 'System Admin',
        email: 'admin@makanak.com',
        phone: '+201000000001',
        password: hash('Admin@1234'),
        verified: true,
        active: true,
        roleId: adminRole!.id,
        roleKey: RolesKeys.ADMIN,
      },
    });
  }
  await prismaClient.adminWallet.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, totalEarning: 5400, currentBalance: 3200, collectedCash: 1200 },
  });
  console.log('  ✔ Admin & AdminWallet verified');

  // 4. Default Plan
  await prismaClient.plan.upsert({
    where: { id: 1 },
    update: { name: 'Standard Business Plan' },
    create: { id: 1, name: 'Standard Business Plan' },
  });

  // 5. Cities: City 1 (El Mahalla) and City 2 (Tanta)
  await prismaClient.city.upsert({
    where: { id: 1 },
    update: {
      name: { ar: 'المحلة الكبرى', en: 'El Mahalla El Kubra' },
      lat: 30.9700,
      lng: 31.1650,
      radius: 15,
      toleranceRadius: 5,
      active: true,
    },
    create: {
      id: 1,
      name: { ar: 'المحلة الكبرى', en: 'El Mahalla El Kubra' },
      lat: 30.9700,
      lng: 31.1650,
      radius: 15,
      toleranceRadius: 5,
      active: true,
    },
  });

  await prismaClient.city.upsert({
    where: { id: 2 },
    update: {
      name: { ar: 'طنطا', en: 'Tanta' },
      lat: 30.7865,
      lng: 31.0004,
      radius: 15,
      toleranceRadius: 5,
      active: true,
    },
    create: {
      id: 2,
      name: { ar: 'طنطا', en: 'Tanta' },
      lat: 30.7865,
      lng: 31.0004,
      radius: 15,
      toleranceRadius: 5,
      active: true,
    },
  });
  console.log('  ✔ Cities seeded: [1] El Mahalla, [2] Tanta');

  // 6. Zones: El Mahalla Zone 101 and Tanta Zones 201–205
  await prismaClient.zone.upsert({
    where: { id: MAHALLA_ZONE_CONFIG.id },
    update: {
      name: MAHALLA_ZONE_CONFIG.name,
      cityId: 1,
      coordinates: MAHALLA_ZONE_CONFIG.coords,
      deliveryPrice: MAHALLA_ZONE_CONFIG.deliveryPrice,
      active: true,
    },
    create: {
      id: MAHALLA_ZONE_CONFIG.id,
      name: MAHALLA_ZONE_CONFIG.name,
      cityId: 1,
      coordinates: MAHALLA_ZONE_CONFIG.coords,
      deliveryPrice: MAHALLA_ZONE_CONFIG.deliveryPrice,
      active: true,
    },
  });

  for (const z of TANTA_ZONES_CONFIG) {
    await prismaClient.zone.upsert({
      where: { id: z.id },
      update: {
        name: z.name,
        cityId: 2,
        coordinates: z.coords,
        deliveryPrice: z.deliveryPrice,
        deliveryPriceAfterDiscount: z.deliveryPriceAfterDiscount,
        active: true,
      },
      create: {
        id: z.id,
        name: z.name,
        cityId: 2,
        coordinates: z.coords,
        deliveryPrice: z.deliveryPrice,
        deliveryPriceAfterDiscount: z.deliveryPriceAfterDiscount,
        active: true,
      },
    });
  }
  console.log('  ✔ 5 Tanta Zones (201-205) + Mahalla Zone (101) seeded');

  // 7. Seed El Mahalla Baseline Store (Store 101)
  const storeRole = await prismaClient.role.findFirst({ where: { roleKey: RolesKeys.STORE } });
  const mahallaOwner = await prismaClient.user.upsert({
    where: { email_roleKey: { email: MAHALLA_STORE.ownerEmail, roleKey: RolesKeys.STORE } },
    update: { name: MAHALLA_STORE.ownerName, phone: MAHALLA_STORE.ownerPhone },
    create: {
      name: MAHALLA_STORE.ownerName,
      email: MAHALLA_STORE.ownerEmail,
      phone: MAHALLA_STORE.ownerPhone,
      password: hash('Owner@1234'),
      verified: true,
      active: true,
      roleId: storeRole!.id,
      roleKey: RolesKeys.STORE,
    },
  });

  await prismaClient.store.upsert({
    where: { id: MAHALLA_STORE.id },
    update: {
      name: MAHALLA_STORE.name,
      cityId: 1,
      planId: 1,
      isStoreAccepted: true,
      isVerified: true,
    },
    create: {
      id: MAHALLA_STORE.id,
      name: MAHALLA_STORE.name,
      logo: MAHALLA_STORE.logo,
      cover: MAHALLA_STORE.cover,
      cityId: 1,
      planId: 1,
      isStoreAccepted: true,
      isVerified: true,
      commission: 10,
      tax: 14,
      rating: 4.7,
      review: 50,
      storeOrder: 1,
    },
  });

  const mahallaBranch = await prismaClient.branch.upsert({
    where: { id: 101 },
    update: {
      name: MAHALLA_STORE.branchName,
      address: MAHALLA_STORE.branchAddress,
      lat: MAHALLA_STORE.lat,
      lng: MAHALLA_STORE.lng,
      storeId: MAHALLA_STORE.id,
      isActive: true,
    },
    create: {
      id: 101,
      storeId: MAHALLA_STORE.id,
      name: MAHALLA_STORE.branchName,
      phone: MAHALLA_STORE.ownerPhone,
      address: MAHALLA_STORE.branchAddress,
      lat: MAHALLA_STORE.lat,
      lng: MAHALLA_STORE.lng,
      isMainBranch: true,
      isActive: true,
    },
  });

  await prismaClient.branchZone.upsert({
    where: { branchId_zoneId: { branchId: mahallaBranch.id, zoneId: MAHALLA_ZONE_CONFIG.id } },
    update: {},
    create: { branchId: mahallaBranch.id, zoneId: MAHALLA_ZONE_CONFIG.id },
  });

  // 7b. Ensure Restaurant StoreTemplate & TemplateCategories exist
  let restaurantTemplate = await prismaClient.storeTemplate.findFirst({
    where: {
      OR: [
        { moduleType: 'restaurant' },
        { name: { path: ['en'], equals: 'Restaurant' } },
        { name: { path: ['ar'], equals: 'مطاعم' } },
        { name: { path: ['ar'], equals: 'مطعم' } },
      ],
      deletedAt: null,
    },
    include: { categories: true },
  });

  if (!restaurantTemplate) {
    restaurantTemplate = await prismaClient.storeTemplate.create({
      data: {
        name: { ar: 'مطاعم', en: 'Restaurants' },
        description: { ar: 'أشهى المأكولات والمطاعم في طنطا', en: 'Best restaurants in Tanta' },
        moduleType: 'restaurant',
        active: true,
        order: 1,
        image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500',
      },
      include: { categories: true },
    });
  }

  const standardTemplateCategories = [
    { name: { ar: 'وجبات رئيسية', en: 'Main Dishes' }, order: 1, keywords: ['وجبات', 'أطباق', 'صواني', 'محاشي', 'باستا', 'مكرونة'] },
    { name: { ar: 'سندوتشات', en: 'Sandwiches' }, order: 2, keywords: ['سندوتش', 'برجر', 'شاورما', 'تيك أواي'] },
    { name: { ar: 'بيتزا وفطائر', en: 'Pizza & Pies' }, order: 3, keywords: ['بيتزا', 'فطير', 'فطائر'] },
    { name: { ar: 'كشري وطواجن', en: 'Koshary & Casseroles' }, order: 4, keywords: ['كشري', 'طاجن', 'طواجن'] },
    { name: { ar: 'مشويات وكباب', en: 'Grills & Kebab' }, order: 5, keywords: ['مشوي', 'مشويات', 'كباب', 'لحوم'] },
    { name: { ar: 'كريب ووافل', en: 'Crepes & Waffles' }, order: 6, keywords: ['كريب', 'وافل'] },
    { name: { ar: 'حلويات ومشروبات', en: 'Desserts & Drinks' }, order: 7, keywords: ['حلو', 'حلويات', 'عصير', 'مشروب', 'تورت', 'نوتيلا'] },
    { name: { ar: 'مأكولات بحرية', en: 'Seafood' }, order: 8, keywords: ['سمك', 'جمبري', 'بحريات', 'سي فود'] },
  ];

  const templateCatMappingList: { id: number; keywords: string[] }[] = [];
  for (const catDef of standardTemplateCategories) {
    let existing = restaurantTemplate.categories.find((c: any) => {
      const arName = typeof c.name === 'object' ? (c.name as any)?.ar : String(c.name);
      return arName === catDef.name.ar;
    });

    if (!existing) {
      existing = await prismaClient.templateCategory.create({
        data: {
          name: catDef.name,
          order: catDef.order,
          templateId: restaurantTemplate.id,
        },
      });
    }

    templateCatMappingList.push({
      id: existing.id,
      keywords: catDef.keywords,
    });
  }

  // 8. Seed 10 Tanta Stores with Owners, Branches, Wallets, Schedules, & BranchZones
  for (let sIdx = 0; sIdx < TANTA_STORES.length; sIdx++) {
    const s = TANTA_STORES[sIdx];

    // Store Owner
    await prismaClient.user.upsert({
      where: { email_roleKey: { email: s.ownerEmail, roleKey: RolesKeys.STORE } },
      update: { name: s.ownerName, phone: s.ownerPhone },
      create: {
        name: s.ownerName,
        email: s.ownerEmail,
        phone: s.ownerPhone,
        password: hash('Owner@1234'),
        verified: true,
        active: true,
        roleId: storeRole!.id,
        roleKey: RolesKeys.STORE,
      },
    });

    // Store
    await prismaClient.store.upsert({
      where: { id: s.id },
      update: {
        name: s.name,
        logo: s.logo,
        cover: s.cover,
        cityId: 2,
        planId: 1,
        isStoreAccepted: true,
        isVerified: true,
        isPartner: s.isPartner,
        commission: 10,
        commissionType: CommissionType.PERCENTAGE,
        tax: 14,
        rating: s.rating,
        review: s.review,
        bestRated: s.rating >= 4.8,
        prepTimeMinutes: s.prepTimeMinutes,
        deliveryTimeMinMinutes: 20,
        deliveryTimeMaxMinutes: 45,
        minOrderAmount: s.minOrderAmount,
        zonePricingEnabled: true,
        storeOrder: sIdx + 1,
      },
      create: {
        id: s.id,
        name: s.name,
        logo: s.logo,
        cover: s.cover,
        cityId: 2,
        planId: 1,
        isStoreAccepted: true,
        isVerified: true,
        isPartner: s.isPartner,
        commission: 10,
        commissionType: CommissionType.PERCENTAGE,
        tax: 14,
        rating: s.rating,
        review: s.review,
        bestRated: s.rating >= 4.8,
        prepTimeMinutes: s.prepTimeMinutes,
        deliveryTimeMinMinutes: 20,
        deliveryTimeMaxMinutes: 45,
        minOrderAmount: s.minOrderAmount,
        zonePricingEnabled: true,
        storeOrder: sIdx + 1,
      },
    });

    // Branch
    const branch = await prismaClient.branch.upsert({
      where: { id: s.id },
      update: {
        storeId: s.id,
        name: s.branchName,
        phone: s.ownerPhone,
        address: s.branchAddress,
        lat: s.lat,
        lng: s.lng,
        isActive: true,
        isMainBranch: true,
        closed: false,
        status: BranchStatus.NORMAL,
        rating: s.rating,
        review: s.review,
      },
      create: {
        id: s.id,
        storeId: s.id,
        name: s.branchName,
        phone: s.ownerPhone,
        address: s.branchAddress,
        lat: s.lat,
        lng: s.lng,
        isActive: true,
        isMainBranch: true,
        closed: false,
        status: BranchStatus.NORMAL,
        rating: s.rating,
        review: s.review,
      },
    });

    // Branch Wallet
    await prismaClient.wallet.upsert({
      where: { branchId: branch.id },
      update: {},
      create: {
        branchId: branch.id,
        totalEarning: 3500 + s.id * 150,
        currentBalance: 2100 + s.id * 100,
        totalWithdrawn: 1400 + s.id * 50,
      },
    });

    // 24/7 Store Schedule so branch is always OPEN
    const allDays = [
      Days.SUNDAY,
      Days.MONDAY,
      Days.TUESDAY,
      Days.WEDNESDAY,
      Days.THURSDAY,
      Days.FRIDAY,
      Days.SATURDAY,
    ];
    await prismaClient.storeSchedule.deleteMany({ where: { branchId: branch.id } });
    for (const day of allDays) {
      await prismaClient.storeSchedule.create({
        data: {
          branchId: branch.id,
          day,
          openingTime: new Date('1970-01-01T00:00:00Z'),
          closingTime: new Date('1970-01-01T23:59:59Z'),
        },
      });
    }

    // Connect Branch to all 5 Tanta Zones
    for (const zId of allTantaZoneIds) {
      await prismaClient.branchZone.upsert({
        where: { branchId_zoneId: { branchId: branch.id, zoneId: zId } },
        update: {},
        create: { branchId: branch.id, zoneId: zId },
      });

      // StoreZonePrice matrix
      const basePrice = zId === s.primaryZoneId ? 12 : 18;
      await prismaClient.storeZonePrice.upsert({
        where: { storeId_zoneId: { storeId: s.id, zoneId: zId } },
        update: { price: basePrice, priceAfterDiscount: basePrice - 3 },
        create: { storeId: s.id, zoneId: zId, price: basePrice, priceAfterDiscount: basePrice - 3 },
      });
    }

    // StoreTemplateApplication
    if (restaurantTemplate) {
      await prismaClient.storeTemplateApplication.upsert({
        where: {
          storeId_templateId: {
            storeId: s.id,
            templateId: restaurantTemplate.id,
          },
        },
        update: { order: sIdx + 1 },
        create: {
          storeId: s.id,
          templateId: restaurantTemplate.id,
          order: sIdx + 1,
        },
      });
    }

    // Categories & Products
    for (const cat of s.categories) {
      const arName = typeof cat.name === 'object' ? (cat.name as any)?.ar : String(cat.name);
      let matchedTemplateCategoryId = templateCatMappingList[0]?.id;
      for (const mapping of templateCatMappingList) {
        if (mapping.keywords.some(k => arName.includes(k))) {
          matchedTemplateCategoryId = mapping.id;
          break;
        }
      }

      await prismaClient.category.upsert({
        where: { id: cat.id },
        update: { name: cat.name, storeId: s.id, active: true, templateCategoryId: matchedTemplateCategoryId ?? null },
        create: { id: cat.id, name: cat.name, storeId: s.id, active: true, templateCategoryId: matchedTemplateCategoryId ?? null },
      });

      for (const svc of cat.services) {
        await prismaClient.service.upsert({
          where: { id: svc.id },
          update: {
            name: svc.name,
            description: svc.desc,
            price: svc.price,
            priceAfterDiscount: svc.priceAfterDiscount,
            image: svc.image,
            durationMinutes: 20,
            status: ServiceStatus.ACTIVE,
            available: true,
            storeId: s.id,
            categoryId: cat.id,
          },
          create: {
            id: svc.id,
            name: svc.name,
            description: svc.desc,
            price: svc.price,
            priceAfterDiscount: svc.priceAfterDiscount,
            image: svc.image,
            durationMinutes: 20,
            status: ServiceStatus.ACTIVE,
            available: true,
            storeId: s.id,
            categoryId: cat.id,
          },
        });

        // Sizes
        if (svc.sizes && svc.sizes.length > 0) {
          await prismaClient.serviceSize.deleteMany({ where: { serviceId: svc.id } });
          for (let szIdx = 0; szIdx < svc.sizes.length; szIdx++) {
            const sz = svc.sizes[szIdx];
            await prismaClient.serviceSize.create({
              data: {
                serviceId: svc.id,
                name: sz.name,
                price: sz.price,
                isDefault: !!sz.isDefault,
              },
            });
          }
        }

        // Addons
        if (svc.addons && svc.addons.length > 0) {
          await prismaClient.serviceAddon.deleteMany({ where: { serviceId: svc.id } });
          for (let adIdx = 0; adIdx < svc.addons.length; adIdx++) {
            const ad = svc.addons[adIdx];
            await prismaClient.serviceAddon.create({
              data: {
                serviceId: svc.id,
                name: ad.name,
                price: ad.price,
              },
            });
          }
        }
      }
    }
  }
  console.log('  ✔ 10 Tanta Stores, Branches, 24/7 Schedules, Menus & Zone Prices seeded');

  // 9. Delivery Promotions in Tanta
  await prismaClient.deliveryPromotion.deleteMany({ where: { storeId: { in: TANTA_STORES.map((s) => s.id) } } });
  await prismaClient.deliveryPromotion.deleteMany({ where: { zoneId: { in: allTantaZoneIds } } });

  // Store Promo: Koshary Tantawy delivery discount
  await prismaClient.deliveryPromotion.create({
    data: {
      name: 'عرض توصيل كشري طنطاوي 10ج',
      badgeText: 'توصيل مخفض 10ج',
      scope: DeliveryPromoScope.STORE,
      discountType: PromoDiscountType.FIXED_PRICE,
      promoValue: 10,
      storeId: 201,
      isActive: true,
    },
  });

  // Store Promo: Burger Station delivery promo
  await prismaClient.deliveryPromotion.create({
    data: {
      name: 'عرض توصيل برجر ستيشن بـ 12 جنيه',
      badgeText: 'توصيل 12ج بس',
      scope: DeliveryPromoScope.STORE,
      discountType: PromoDiscountType.FIXED_PRICE,
      promoValue: 12,
      storeId: 202,
      isActive: true,
    },
  });

  // Zone Promo: Stadium Zone Promo
  await prismaClient.deliveryPromotion.create({
    data: {
      name: 'خصم توصيل منطقة الاستاد بطنطا',
      badgeText: 'توصيل الاستاد 8ج',
      scope: DeliveryPromoScope.ZONE,
      discountType: PromoDiscountType.FIXED_PRICE,
      promoValue: 8,
      zoneId: 201,
      isActive: true,
    },
  });

  // Store-Zone Promo: Free delivery from Al-Saidi Sweets to Saeed Zone
  await prismaClient.deliveryPromotion.create({
    data: {
      name: 'توصيل مجاني من حلواني الصعيدي لشارع سعيد',
      badgeText: 'توصيل مجاني',
      scope: DeliveryPromoScope.STORE_ZONE,
      discountType: PromoDiscountType.FIXED_PRICE,
      promoValue: 0,
      storeId: 204,
      zoneId: 203,
      isActive: true,
    },
  });
  console.log('  ✔ Tanta Delivery Promotions seeded (Store, Zone, Store-Zone)');

  // 10. Banners & BannerZones for Tanta
  const bannerConfigs = [
    {
      id: 201,
      name: { ar: 'مهرجان برجر ستيشن في الاستاد', en: 'Burger Station Stadium Festival' },
      image: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=800&auto=format&fit=crop&q=80',
      targetType: BannerTargetType.STORE,
      storeId: 202,
    },
    {
      id: 202,
      name: { ar: 'أشهى كشري في طنطا - كشري طنطاوي الأصلي', en: 'Best Koshary in Tanta' },
      image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&auto=format&fit=crop&q=80',
      targetType: BannerTargetType.STORE,
      storeId: 201,
    },
    {
      id: 203,
      name: { ar: 'مشبك وحلويات الصعيدي الأصلية', en: 'Al-Saidi Authentic Sweets' },
      image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&auto=format&fit=crop&q=80',
      targetType: BannerTargetType.STORE,
      storeId: 204,
    },
    {
      id: 204,
      name: { ar: 'مكانك وصل طنطا! توصيل سريع لكل الأحياء', en: 'Makanak is in Tanta! Fast Delivery' },
      image: 'https://images.unsplash.com/photo-1526367790999-0150786686a2?w=800&auto=format&fit=crop&q=80',
      targetType: BannerTargetType.GENERAL,
    },
  ];

  for (const b of bannerConfigs) {
    await prismaClient.banner.upsert({
      where: { id: b.id },
      update: {
        name: b.name,
        image: b.image,
        targetType: b.targetType,
        storeId: b.storeId,
        active: true,
      },
      create: {
        id: b.id,
        name: b.name,
        image: b.image,
        targetType: b.targetType,
        storeId: b.storeId,
        active: true,
      },
    });

    // Link banner to all 5 Tanta zones
    for (const zId of allTantaZoneIds) {
      await prismaClient.bannerZone.upsert({
        where: { bannerId_zoneId: { bannerId: b.id, zoneId: zId } },
        update: {},
        create: { bannerId: b.id, zoneId: zId },
      });
    }
  }
  console.log('  ✔ Tanta Banners & BannerZones seeded');

  // 11. Fortune Wheel Settings & Items linked to Tanta Stores
  await prismaClient.fortuneWheelSettings.upsert({
    where: { id: 1 },
    update: { isEnabled: true, displayIntervalHours: 24 },
    create: { id: 1, isEnabled: true, displayIntervalHours: 24 },
  });

  const wheelItems = [
    {
      id: 201,
      displayName: 'خصم 25% على حلواني الصعيدي',
      rewardType: FortuneWheelRewardType.DISCOUNT,
      rewardValue: 25,
      storeId: 204,
      weight: 15,
      maxDiscount: 60,
      minOrderAmount: 100,
      rewardExpiryHours: 48,
    },
    {
      id: 202,
      displayName: 'خصم 30 جنيه من كشري طنطاوي',
      rewardType: FortuneWheelRewardType.FIXED_AMOUNT,
      rewardValue: 30,
      storeId: 201,
      weight: 20,
      minOrderAmount: 80,
      rewardExpiryHours: 48,
    },
    {
      id: 203,
      displayName: 'توصيل مجاني لطلبك من برجر ستيشن',
      rewardType: FortuneWheelRewardType.FREE_DELIVERY,
      rewardValue: 0,
      storeId: 202,
      weight: 25,
      minOrderAmount: 50,
      rewardExpiryHours: 24,
    },
    {
      id: 204,
      displayName: 'خصم 20% على أسماك طنطا',
      rewardType: FortuneWheelRewardType.DISCOUNT,
      rewardValue: 20,
      storeId: 206,
      weight: 15,
      maxDiscount: 70,
      minOrderAmount: 150,
      rewardExpiryHours: 48,
    },
    {
      id: 205,
      displayName: 'خصم 15% على بيتزا وفطائر السلطان',
      rewardType: FortuneWheelRewardType.DISCOUNT,
      rewardValue: 15,
      storeId: 203,
      weight: 15,
      maxDiscount: 50,
      minOrderAmount: 90,
      rewardExpiryHours: 48,
    },
    {
      id: 206,
      displayName: 'حظ أوفر المرة القادمة',
      rewardType: FortuneWheelRewardType.NONE,
      rewardValue: 0,
      weight: 10,
    },
  ];

  for (const item of wheelItems) {
    await prismaClient.fortuneWheelItem.upsert({
      where: { id: item.id },
      update: {
        displayName: item.displayName,
        rewardType: item.rewardType,
        rewardValue: item.rewardValue,
        storeId: item.storeId,
        weight: item.weight,
        maxDiscount: item.maxDiscount,
        minOrderAmount: item.minOrderAmount,
        rewardExpiryHours: item.rewardExpiryHours,
        isActive: true,
      },
      create: {
        id: item.id,
        displayName: item.displayName,
        rewardType: item.rewardType,
        rewardValue: item.rewardValue,
        storeId: item.storeId,
        weight: item.weight,
        maxDiscount: item.maxDiscount,
        minOrderAmount: item.minOrderAmount,
        rewardExpiryHours: item.rewardExpiryHours,
        isActive: true,
      },
    });
  }
  console.log('  ✔ Fortune Wheel Settings & Tanta Items seeded');

  // 12. Coupons for Tanta
  const now = new Date();
  const nextMonth = new Date();
  nextMonth.setDate(now.getDate() + 45);

  const tantaCoupons = [
    {
      id: 201,
      code: 'TANTA20',
      title: { ar: 'خصم 20% لعملاء طنطا', en: '20% Off for Tanta' },
      type: CouponType.ALL_USERS,
      discountType: DiscountType.PERCENTAGE,
      discountValue: 20,
      maxUsage: 500,
      usageCount: 14,
      minOrderAmount: 80,
      minDiscountValue: 10,
      maxDiscountValue: 50,
    },
    {
      id: 202,
      code: 'WELCOME_TANTA',
      title: { ar: '40 جنيه خصم ترحيبي في طنطا', en: '40 EGP Welcome Discount Tanta' },
      type: CouponType.ALL_USERS,
      discountType: DiscountType.AMOUNT,
      discountValue: 40,
      maxUsage: 300,
      usageCount: 22,
      minOrderAmount: 120,
      minDiscountValue: 40,
      maxDiscountValue: 40,
    },
    {
      id: 203,
      code: 'STAD_FREE',
      title: { ar: 'توصيل مجاني لمنطقة الاستاد', en: 'Free Delivery Stadium' },
      type: CouponType.ALL_USERS,
      discountType: DiscountType.AMOUNT,
      discountValue: 15,
      maxUsage: 200,
      usageCount: 8,
      minOrderAmount: 50,
      minDiscountValue: 15,
      maxDiscountValue: 15,
    },
  ];

  for (const c of tantaCoupons) {
    await prismaClient.coupon.upsert({
      where: { id: c.id },
      update: {
        code: c.code,
        title: c.title,
        type: c.type,
        discountType: c.discountType,
        discountValue: c.discountValue,
        maxUsage: c.maxUsage,
        usageCount: c.usageCount,
        minOrderAmount: c.minOrderAmount,
        minDiscountValue: c.minDiscountValue,
        maxDiscountValue: c.maxDiscountValue,
        active: true,
        startDate: now,
        endDate: nextMonth,
      },
      create: {
        id: c.id,
        code: c.code,
        title: c.title,
        type: c.type,
        discountType: c.discountType,
        discountValue: c.discountValue,
        maxUsage: c.maxUsage,
        usageCount: c.usageCount,
        minOrderAmount: c.minOrderAmount,
        minDiscountValue: c.minDiscountValue,
        maxDiscountValue: c.maxDiscountValue,
        active: true,
        startDate: now,
        endDate: nextMonth,
      },
    });

    // Link coupons to Tanta Zones
    for (const zId of allTantaZoneIds) {
      await prismaClient.couponZones.upsert({
        where: { couponId_zoneId: { couponId: c.id, zoneId: zId } },
        update: {},
        create: { couponId: c.id, zoneId: zId },
      });
    }

    // Link coupons to Tanta Stores
    for (const s of TANTA_STORES) {
      await prismaClient.storeCoupons.upsert({
        where: { couponId_storeId: { couponId: c.id, storeId: s.id } },
        update: {},
        create: { couponId: c.id, storeId: s.id },
      });
    }
  }
  console.log('  ✔ Tanta Coupons & Zone/Store links seeded');

  // 13. Customers with Tanta Addresses
  const customerRole = await prismaClient.role.findFirst({ where: { roleKey: RolesKeys.CUSTOMER } });

  // Customer 1: Primary Tanta Tester (customer_tanta@makanak.com)
  const cust1 = await prismaClient.user.upsert({
    where: { email_roleKey: { email: 'customer_tanta@makanak.com', roleKey: RolesKeys.CUSTOMER } },
    update: { name: 'أحمد محمود (عميل طنطا)', phone: '+201011112222' },
    create: {
      name: 'أحمد محمود (عميل طنطا)',
      email: 'customer_tanta@makanak.com',
      phone: '+201011112222',
      password: hash('Customer@1234'),
      verified: true,
      active: true,
      roleId: customerRole!.id,
      roleKey: RolesKeys.CUSTOMER,
    },
  });
  await prismaClient.details.upsert({
    where: { userId: cust1.id },
    update: { wallet: 850, points: 420 },
    create: { userId: cust1.id, wallet: 850, points: 420 },
  });

  // Customer 1 Addresses in Tanta
  const addr1 = await prismaClient.address.upsert({
    where: { id: 301 },
    update: {
      userId: cust1.id,
      title: 'المنزل - الاستاد',
      adress: 'شارع محب الرئيسي - برج الأمل الدور الرابع - منطقة الاستاد، طنطا',
      lat: 30.8010,
      lng: 30.9980,
      default: true,
    },
    create: {
      id: 301,
      userId: cust1.id,
      title: 'المنزل - الاستاد',
      adress: 'شارع محب الرئيسي - برج الأمل الدور الرابع - منطقة الاستاد، طنطا',
      lat: 30.8010,
      lng: 30.9980,
      default: true,
    },
  });

  const addr2 = await prismaClient.address.upsert({
    where: { id: 302 },
    update: {
      userId: cust1.id,
      title: 'العمل - شارع النحاس',
      adress: 'شارع النحاس برج التجاريين الدور الثاني - طنطا',
      lat: 30.7850,
      lng: 30.9920,
      default: false,
    },
    create: {
      id: 302,
      userId: cust1.id,
      title: 'العمل - شارع النحاس',
      adress: 'شارع النحاس برج التجاريين الدور الثاني - طنطا',
      lat: 30.7850,
      lng: 30.9920,
      default: false,
    },
  });

  // Customer 2: Secondary Customer (customer2_tanta@makanak.com)
  const cust2 = await prismaClient.user.upsert({
    where: { email_roleKey: { email: 'customer2_tanta@makanak.com', roleKey: RolesKeys.CUSTOMER } },
    update: { name: 'سارة إبراهيم (عميلة طنطا)', phone: '+201011113333' },
    create: {
      name: 'سارة إبراهيم (عميلة طنطا)',
      email: 'customer2_tanta@makanak.com',
      phone: '+201011113333',
      password: hash('Customer@1234'),
      verified: true,
      active: true,
      roleId: customerRole!.id,
      roleKey: RolesKeys.CUSTOMER,
    },
  });
  await prismaClient.details.upsert({
    where: { userId: cust2.id },
    update: { wallet: 350, points: 150 },
    create: { userId: cust2.id, wallet: 350, points: 150 },
  });

  const addr3 = await prismaClient.address.upsert({
    where: { id: 303 },
    update: {
      userId: cust2.id,
      title: 'المنزل - شارع سعيد',
      adress: 'شارع سعيد تقاطع حسن رضوان - برج النخيل - طنطا',
      lat: 30.7880,
      lng: 31.0080,
      default: true,
    },
    create: {
      id: 303,
      userId: cust2.id,
      title: 'المنزل - شارع سعيد',
      adress: 'شارع سعيد تقاطع حسن رضوان - برج النخيل - طنطا',
      lat: 30.7880,
      lng: 31.0080,
      default: true,
    },
  });
  console.log('  ✔ Tanta Customers & Addresses seeded (customer_tanta@makanak.com / Customer@1234)');

  // 14. Delivery Drivers in Tanta
  const deliveryRole = await prismaClient.role.findFirst({ where: { roleKey: RolesKeys.DELIVERY } });

  // Driver 1: Al-Stad Captain (driver_tanta@makanak.com)
  const driver1 = await prismaClient.user.upsert({
    where: { email_roleKey: { email: 'driver_tanta@makanak.com', roleKey: RolesKeys.DELIVERY } },
    update: { name: 'كابتن محمد طنطاوي (مندوب الاستاد)', phone: '+201022221111' },
    create: {
      name: 'كابتن محمد طنطاوي (مندوب الاستاد)',
      email: 'driver_tanta@makanak.com',
      phone: '+201022221111',
      password: hash('Driver@1234'),
      verified: true,
      active: true,
      roleId: deliveryRole!.id,
      roleKey: RolesKeys.DELIVERY,
    },
  });
  await prismaClient.deliveryDetails.upsert({
    where: { userId: driver1.id },
    update: {
      lat: 30.8000,
      lng: 30.9970,
      rating: 4.95,
      review: 112,
      bestRated: true,
      availableNow: true,
      forceAvailable: true,
    },
    create: {
      userId: driver1.id,
      lat: 30.8000,
      lng: 30.9970,
      rating: 4.95,
      review: 112,
      bestRated: true,
      availableNow: true,
      forceAvailable: true,
    },
  });

  // Driver 2: Al-Nahas Captain (driver2_tanta@makanak.com)
  const driver2 = await prismaClient.user.upsert({
    where: { email_roleKey: { email: 'driver2_tanta@makanak.com', roleKey: RolesKeys.DELIVERY } },
    update: { name: 'كابتن محمود السيد (مندوب النحاس)', phone: '+201022222222' },
    create: {
      name: 'كابتن محمود السيد (مندوب النحاس)',
      email: 'driver2_tanta@makanak.com',
      phone: '+201022222222',
      password: hash('Driver@1234'),
      verified: true,
      active: true,
      roleId: deliveryRole!.id,
      roleKey: RolesKeys.DELIVERY,
    },
  });
  await prismaClient.deliveryDetails.upsert({
    where: { userId: driver2.id },
    update: {
      lat: 30.7855,
      lng: 30.9935,
      rating: 4.85,
      review: 76,
      bestRated: true,
      availableNow: true,
      forceAvailable: true,
    },
    create: {
      userId: driver2.id,
      lat: 30.7855,
      lng: 30.9935,
      rating: 4.85,
      review: 76,
      bestRated: true,
      availableNow: true,
      forceAvailable: true,
    },
  });
  console.log('  ✔ Tanta Drivers seeded (driver_tanta@makanak.com / Driver@1234)');

  // 15. Orders in Tanta across all statuses
  // Active Orders (Pending, Preparing, Ready Pickup, On the Way)
  const orderConfigs: any[] = [
    {
      id: 201,
      status: OrderStatus.PENDING,
      branchId: 201, // Koshary Tantawy
      zoneId: 202,   // Nahas Zone
      userId: cust1.id,
      addressId: addr1.id,
      paymentMethod: PaymentMethod.CASH,
      paymentStatus: PaymentStatus.UNPAID,
      price: 110,
      shipping: 10,
      discountAmount: 15,
      totalPriceAfterDiscount: 105,
      invoice: { items: 110, shipping: 10, discount: 15, total: 105 },
      items: [
        { serviceId: 20101, quantity: 2, price: 45 },
        { serviceId: 20104, quantity: 1, price: 20 },
      ],
      createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10 mins ago
    },
    {
      id: 202,
      status: OrderStatus.PREPARING,
      branchId: 202, // Burger Station
      zoneId: 201,   // Stad Zone
      userId: cust1.id,
      addressId: addr1.id,
      paymentMethod: PaymentMethod.WALLET,
      paidWithWallet: true,
      paymentStatus: PaymentStatus.PAID,
      price: 160,
      shipping: 12,
      discountAmount: 20,
      totalPriceAfterDiscount: 152,
      invoice: { items: 160, shipping: 12, discount: 20, total: 152 },
      items: [
        { serviceId: 20201, quantity: 1, price: 115 },
        { serviceId: 20204, quantity: 1, price: 45 },
      ],
      createdAt: new Date(Date.now() - 25 * 60 * 1000), // 25 mins ago
      preparingAt: new Date(Date.now() - 20 * 60 * 1000),
    },
    {
      id: 203,
      status: OrderStatus.READY_PICKUP,
      branchId: 203, // Sultan Pizza
      zoneId: 202,
      userId: cust2.id,
      addressId: addr3.id,
      paymentMethod: PaymentMethod.CASH,
      paymentStatus: PaymentStatus.UNPAID,
      price: 235,
      shipping: 15,
      discountAmount: 25,
      totalPriceAfterDiscount: 225,
      invoice: { items: 235, shipping: 15, discount: 25, total: 225 },
      items: [
        { serviceId: 20301, quantity: 1, price: 135 },
        { serviceId: 20303, quantity: 1, price: 100 },
      ],
      createdAt: new Date(Date.now() - 40 * 60 * 1000),
      preparingAt: new Date(Date.now() - 35 * 60 * 1000),
      readyAt: new Date(Date.now() - 10 * 60 * 1000),
    },
    {
      id: 204,
      status: OrderStatus.ON_THE_WAY,
      branchId: 204, // Al-Saidi Sweets
      zoneId: 201,
      userId: cust1.id,
      addressId: addr1.id,
      deliveryId: driver1.id,
      paymentMethod: PaymentMethod.CASH,
      paymentStatus: PaymentStatus.UNPAID,
      price: 215,
      shipping: 10,
      discountAmount: 20,
      totalPriceAfterDiscount: 205,
      invoice: { items: 215, shipping: 10, discount: 20, total: 205 },
      items: [
        { serviceId: 20401, quantity: 1, price: 95 },
        { serviceId: 20402, quantity: 1, price: 120 },
      ],
      createdAt: new Date(Date.now() - 50 * 60 * 1000),
      preparingAt: new Date(Date.now() - 45 * 60 * 1000),
      readyAt: new Date(Date.now() - 25 * 60 * 1000),
    },
  ];

  // Delivered historical orders (past 14 days)
  for (let i = 5; i <= 18; i++) {
    const dayOffset = (i % 12) + 1;
    const branchIdx = i % TANTA_STORES.length;
    const store = TANTA_STORES[branchIdx];
    const pastDate = new Date(Date.now() - dayOffset * 24 * 3600 * 1000 + i * 3600 * 1000);

    orderConfigs.push({
      id: 200 + i,
      status: OrderStatus.DELIVERED,
      branchId: store.id,
      zoneId: store.primaryZoneId,
      userId: i % 2 === 0 ? cust1.id : cust2.id,
      addressId: i % 2 === 0 ? addr1.id : addr3.id,
      deliveryId: i % 2 === 0 ? driver1.id : driver2.id,
      paymentMethod: i % 3 === 0 ? PaymentMethod.WALLET : PaymentMethod.CASH,
      paidWithWallet: i % 3 === 0,
      paymentStatus: PaymentStatus.PAID,
      price: 120 + i * 15,
      shipping: 15,
      discountAmount: i % 4 === 0 ? 25 : 10,
      totalPriceAfterDiscount: 110 + i * 15 + 15 - (i % 4 === 0 ? 25 : 10),
      invoice: { items: 120 + i * 15, shipping: 15, discount: i % 4 === 0 ? 25 : 10, total: 110 + i * 15 + 15 - (i % 4 === 0 ? 25 : 10) },
      items: [
        { serviceId: store.categories[0].services[0].id, quantity: 1, price: 100 },
      ],
      createdAt: pastDate,
      preparingAt: new Date(pastDate.getTime() + 10 * 60 * 1000),
      readyAt: new Date(pastDate.getTime() + 25 * 60 * 1000),
    });
  }

  // Cancelled order
  orderConfigs.push({
    id: 220,
    status: OrderStatus.CANCELLED,
    branchId: 205, // Nahas Grills
    zoneId: 202,
    userId: cust2.id,
    addressId: addr2.id,
    paymentMethod: PaymentMethod.CASH,
    paymentStatus: PaymentStatus.UNPAID,
    price: 340,
    shipping: 15,
    discountAmount: 0,
    totalPriceAfterDiscount: 355,
    invoice: { items: 340, shipping: 15, discount: 0, total: 355 },
    items: [
      { serviceId: 20501, quantity: 1, price: 340 },
    ],
    createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000),
  });

  // Insert all orders
  for (const ord of orderConfigs) {
    await prismaClient.order.upsert({
      where: { id: ord.id },
      update: {
        status: ord.status,
        price: ord.price,
        shipping: ord.shipping,
        discountAmount: ord.discountAmount,
        totalPriceAfterDiscount: ord.totalPriceAfterDiscount,
        paymentMethod: ord.paymentMethod,
        paymentStatus: ord.paymentStatus,
        paidWithWallet: ord.paidWithWallet || false,
        invoice: ord.invoice,
        branchId: ord.branchId,
        zoneId: ord.zoneId,
        userId: ord.userId,
        addressId: ord.addressId,
        deliveryId: ord.deliveryId,
        createdAt: ord.createdAt,
      },
      create: {
        id: ord.id,
        status: ord.status,
        price: ord.price,
        shipping: ord.shipping,
        discountAmount: ord.discountAmount,
        totalPriceAfterDiscount: ord.totalPriceAfterDiscount,
        paymentMethod: ord.paymentMethod,
        paymentStatus: ord.paymentStatus,
        paidWithWallet: ord.paidWithWallet || false,
        type: OrderType.DELIVERY,
        invoice: ord.invoice,
        branchId: ord.branchId,
        zoneId: ord.zoneId,
        userId: ord.userId,
        addressId: ord.addressId,
        deliveryId: ord.deliveryId,
        createdAt: ord.createdAt,
      },
    });

    // Delete existing order items and insert new ones
    await prismaClient.orderItem.deleteMany({ where: { orderId: ord.id } });
    for (let itmIdx = 0; itmIdx < ord.items.length; itmIdx++) {
      const itm = ord.items[itmIdx];
      await prismaClient.orderItem.create({
        data: {
          orderId: ord.id,
          serviceId: itm.serviceId,
          quantity: itm.quantity,
          price: itm.price,
        },
      });
    }

    // Add rating to delivered orders
    if (ord.status === OrderStatus.DELIVERED) {
      await prismaClient.storeRating.upsert({
        where: { orderId_userId: { orderId: ord.id, userId: ord.userId } },
        update: { rating: 5, comment: 'الأكل تحفة والتوصيل سريع جدا في طنطا!' },
        create: {
          storeId: ord.branchId!,
          branchId: ord.branchId!,
          userId: ord.userId,
          orderId: ord.id,
          rating: 5,
          comment: 'الأكل تحفة والتوصيل سريع جدا في طنطا!',
        },
      });
    }
  }
  console.log(`  ✔ ${orderConfigs.length} Orders in Tanta seeded across all statuses (PENDING, PREPARING, READY_PICKUP, ON_THE_WAY, DELIVERED, CANCELLED)`);

  console.log('\n🎉 ALL TANTA ECOSYSTEM SEEDS COMPLETED SUCCESSFULLY!');
  console.log('─────────────────────────────────────────────────────────────────────────────');
  console.log('📍 City: [2] طنطا (Tanta)');
  console.log('📍 Zones: 5 Zones (الاستاد, النحاس والمحطة, سعيد والجمهورية, الكورنيش, سيجر)');
  console.log('🏪 Stores: 10 Authentic Tanta Stores with 24/7 schedules & full menus');
  console.log('🏷️ Delivery Promos: Store, Zone, & Store-Zone promotions');
  console.log('🎡 Fortune Wheel: 6 items linked to Tanta stores');
  console.log('🎟️ Coupons: TANTA20, WELCOME_TANTA, STAD_FREE');
  console.log('👤 Customer: customer_tanta@makanak.com / Customer@1234');
  console.log('🚴 Driver:   driver_tanta@makanak.com   / Driver@1234');
  console.log('👑 Admin:    admin@makanak.com          / Admin@1234');
  console.log('─────────────────────────────────────────────────────────────────────────────\n');
}

// Direct execution support
if (require.main === module) {
  seedTantaFullEcosystem(prisma)
    .catch((e) => {
      console.error('❌ Seed failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
