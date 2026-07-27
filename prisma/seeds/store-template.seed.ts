import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Required fields per schema:
//   StoreTemplate    : name (Json), active, order
//   TemplateCategory : name (Json), order, templateId
//   TemplateService  : name (Json), description (Json), image (String, non-empty),
//                      durationMinutes (Int), price (Float), templateCategoryId
//   TemplateServiceSize: name (Json), price (Float), isDefault (Boolean), templateServiceId
//   TemplateServiceAddon: name (Json), price (Float), templateServiceId
// ---------------------------------------------------------------------------

const PLACEHOLDER_IMAGE = 'https://placehold.co/400x300/png';

type TemplateDefinition = {
  name: { ar: string; en: string };
  description?: { ar: string; en: string };
  moduleType: string;
  order: number;
  categories: {
    name: { ar: string; en: string };
    order: number;
    services: {
      name: { ar: string; en: string };
      description: { ar: string; en: string };
      image: string;
      durationMinutes: number;
      price: number;
      priceAfterDiscount?: number;
      available: boolean;
      bestRated?: boolean;
      mostSeller?: boolean;
      sizes: {
        name: { ar: string; en: string };
        price: number;
        priceAfterDiscount?: number;
        isDefault: boolean;
      }[];
      addons?: {
        name: { ar: string; en: string };
        price: number;
      }[];
    }[];
  }[];
};

const templates: TemplateDefinition[] = [
  // -------------------------------------------------------------------------
  // 1. Restaurant
  // -------------------------------------------------------------------------
  {
    name: { ar: 'قالب مطعم أساسي', en: 'Basic Restaurant Template' },
    description: { ar: 'قائمة طعام نموذجية لمطعم', en: 'Standard food menu for a restaurant' },
    moduleType: 'restaurant',
    order: 1,
    categories: [
      {
        name: { ar: 'وجبات رئيسية', en: 'Main Dishes' },
        order: 1,
        services: [
          {
            name: { ar: 'كباب مشوي', en: 'Grilled Kebab' },
            description: { ar: 'كباب لحم مشوي طازج', en: 'Fresh grilled meat kebab' },
            image: PLACEHOLDER_IMAGE,
            durationMinutes: 20,
            price: 80,
            available: true,
            bestRated: true,
            mostSeller: true,
            sizes: [
              { name: { ar: 'حصة فردية', en: 'Single' }, price: 80, isDefault: true },
              { name: { ar: 'حصة عائلية', en: 'Family' }, price: 150, isDefault: false },
            ],
            addons: [
              { name: { ar: 'صلصة ثوم', en: 'Garlic Sauce' }, price: 5 },
              { name: { ar: 'خبز إضافي', en: 'Extra Bread' }, price: 5 },
            ],
          },
          {
            name: { ar: 'فراخ مشوية', en: 'Grilled Chicken' },
            description: { ar: 'دجاجة كاملة مشوية بالتوابل', en: 'Whole spiced grilled chicken' },
            image: PLACEHOLDER_IMAGE,
            durationMinutes: 30,
            price: 120,
            priceAfterDiscount: 100,
            available: true,
            sizes: [
              { name: { ar: 'نص فرخة', en: 'Half Chicken' }, price: 65, isDefault: true },
              { name: { ar: 'فرخة كاملة', en: 'Whole Chicken' }, price: 120, priceAfterDiscount: 100, isDefault: false },
            ],
          },
        ],
      },
      {
        name: { ar: 'مشروبات', en: 'Drinks' },
        order: 2,
        services: [
          {
            name: { ar: 'عصير طازج', en: 'Fresh Juice' },
            description: { ar: 'عصير فواكه طازج', en: 'Freshly squeezed fruit juice' },
            image: PLACEHOLDER_IMAGE,
            durationMinutes: 5,
            price: 25,
            available: true,
            sizes: [
              { name: { ar: 'صغير', en: 'Small' }, price: 20, isDefault: true },
              { name: { ar: 'كبير', en: 'Large' }, price: 35, isDefault: false },
            ],
          },
          {
            name: { ar: 'مياه معدنية', en: 'Mineral Water' },
            description: { ar: 'زجاجة مياه معدنية', en: 'Mineral water bottle' },
            image: PLACEHOLDER_IMAGE,
            durationMinutes: 1,
            price: 10,
            available: true,
            sizes: [
              { name: { ar: '330ml', en: '330ml' }, price: 10, isDefault: true },
              { name: { ar: '600ml', en: '600ml' }, price: 15, isDefault: false },
            ],
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 2. Grocery / Market
  // -------------------------------------------------------------------------
  {
    name: { ar: 'قالب ماركت أساسي', en: 'Basic Grocery Template' },
    description: { ar: 'منتجات بقالة أساسية', en: 'Essential grocery products' },
    moduleType: 'grocery',
    order: 2,
    categories: [
      {
        name: { ar: 'ألبان وبيض', en: 'Dairy & Eggs' },
        order: 1,
        services: [
          {
            name: { ar: 'حليب طازج', en: 'Fresh Milk' },
            description: { ar: 'حليب طازج كامل الدسم', en: 'Full-fat fresh milk' },
            image: PLACEHOLDER_IMAGE,
            durationMinutes: 5,
            price: 30,
            available: true,
            mostSeller: true,
            sizes: [
              { name: { ar: '500ml', en: '500ml' }, price: 18, isDefault: true },
              { name: { ar: '1 لتر', en: '1 Litre' }, price: 30, isDefault: false },
            ],
          },
          {
            name: { ar: 'بيض بلدي', en: 'Farm Eggs' },
            description: { ar: 'بيض بلدي طازج', en: 'Fresh farm eggs' },
            image: PLACEHOLDER_IMAGE,
            durationMinutes: 5,
            price: 60,
            available: true,
            sizes: [
              { name: { ar: '6 بيضات', en: '6 Eggs' }, price: 35, isDefault: true },
              { name: { ar: '12 بيضة', en: '12 Eggs' }, price: 60, isDefault: false },
            ],
          },
        ],
      },
      {
        name: { ar: 'خضروات وفاكهة', en: 'Vegetables & Fruits' },
        order: 2,
        services: [
          {
            name: { ar: 'طماطم', en: 'Tomatoes' },
            description: { ar: 'طماطم طازجة مصرية', en: 'Fresh Egyptian tomatoes' },
            image: PLACEHOLDER_IMAGE,
            durationMinutes: 3,
            price: 15,
            available: true,
            sizes: [
              { name: { ar: 'كيلو', en: 'Kilogram' }, price: 15, isDefault: true },
            ],
          },
          {
            name: { ar: 'موز', en: 'Bananas' },
            description: { ar: 'موز طازج', en: 'Fresh bananas' },
            image: PLACEHOLDER_IMAGE,
            durationMinutes: 3,
            price: 30,
            available: true,
            sizes: [
              { name: { ar: 'كيلو', en: 'Kilogram' }, price: 30, isDefault: true },
            ],
          },
        ],
      },
      {
        name: { ar: 'مواد غذائية', en: 'Pantry' },
        order: 3,
        services: [
          {
            name: { ar: 'أرز', en: 'Rice' },
            description: { ar: 'أرز مصري بالوزن', en: 'Egyptian rice by weight' },
            image: PLACEHOLDER_IMAGE,
            durationMinutes: 5,
            price: 40,
            available: true,
            sizes: [
              { name: { ar: 'كيلو', en: 'Kilogram' }, price: 20, isDefault: true },
              { name: { ar: '2 كيلو', en: '2 Kilograms' }, price: 38, isDefault: false },
            ],
          },
          {
            name: { ar: 'زيت نباتي', en: 'Vegetable Oil' },
            description: { ar: 'زيت طهي نباتي', en: 'Vegetable cooking oil' },
            image: PLACEHOLDER_IMAGE,
            durationMinutes: 3,
            price: 45,
            available: true,
            sizes: [
              { name: { ar: '750ml', en: '750ml' }, price: 45, isDefault: true },
              { name: { ar: '1.5 لتر', en: '1.5 Litre' }, price: 80, isDefault: false },
            ],
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 3. Pharmacy
  // -------------------------------------------------------------------------
  {
    name: { ar: 'قالب صيدلية أساسي', en: 'Basic Pharmacy Template' },
    description: { ar: 'أدوية ومستلزمات صيدلانية شائعة', en: 'Common medicines and pharmacy essentials' },
    moduleType: 'pharmacy',
    order: 3,
    categories: [
      {
        name: { ar: 'مسكنات ألم', en: 'Pain Relievers' },
        order: 1,
        services: [
          {
            name: { ar: 'باراسيتامول 500mg', en: 'Paracetamol 500mg' },
            description: { ar: 'مسكن ألم وخافض حرارة', en: 'Pain reliever and fever reducer' },
            image: PLACEHOLDER_IMAGE,
            durationMinutes: 3,
            price: 15,
            available: true,
            mostSeller: true,
            sizes: [
              { name: { ar: '10 أقراص', en: '10 Tablets' }, price: 8, isDefault: true },
              { name: { ar: '20 قرص', en: '20 Tablets' }, price: 15, isDefault: false },
            ],
          },
          {
            name: { ar: 'إيبوبروفين 400mg', en: 'Ibuprofen 400mg' },
            description: { ar: 'مضاد للالتهاب ومسكن ألم', en: 'Anti-inflammatory pain reliever' },
            image: PLACEHOLDER_IMAGE,
            durationMinutes: 3,
            price: 20,
            available: true,
            sizes: [
              { name: { ar: '10 أقراص', en: '10 Tablets' }, price: 12, isDefault: true },
              { name: { ar: '20 قرص', en: '20 Tablets' }, price: 20, isDefault: false },
            ],
          },
        ],
      },
      {
        name: { ar: 'فيتامينات ومكملات', en: 'Vitamins & Supplements' },
        order: 2,
        services: [
          {
            name: { ar: 'فيتامين C', en: 'Vitamin C' },
            description: { ar: 'مكمل فيتامين C لتقوية المناعة', en: 'Vitamin C supplement for immunity' },
            image: PLACEHOLDER_IMAGE,
            durationMinutes: 3,
            price: 50,
            available: true,
            sizes: [
              { name: { ar: '10 أكياس', en: '10 Sachets' }, price: 30, isDefault: true },
              { name: { ar: '30 كبسولة', en: '30 Capsules' }, price: 50, isDefault: false },
            ],
          },
          {
            name: { ar: 'زنك', en: 'Zinc' },
            description: { ar: 'مكمل زنك لدعم المناعة', en: 'Zinc supplement for immune support' },
            image: PLACEHOLDER_IMAGE,
            durationMinutes: 3,
            price: 45,
            available: true,
            sizes: [
              { name: { ar: '30 قرص', en: '30 Tablets' }, price: 45, isDefault: true },
            ],
          },
        ],
      },
      {
        name: { ar: 'عناية شخصية', en: 'Personal Care' },
        order: 3,
        services: [
          {
            name: { ar: 'كمامة طبية', en: 'Medical Mask' },
            description: { ar: 'كمامة طبية للوقاية', en: 'Protective medical mask' },
            image: PLACEHOLDER_IMAGE,
            durationMinutes: 2,
            price: 15,
            available: true,
            sizes: [
              { name: { ar: '5 قطع', en: '5 Pieces' }, price: 10, isDefault: true },
              { name: { ar: '10 قطع', en: '10 Pieces' }, price: 18, isDefault: false },
            ],
          },
          {
            name: { ar: 'جل تعقيم يدين', en: 'Hand Sanitizer Gel' },
            description: { ar: 'جل كحولي لتعقيم اليدين', en: 'Alcohol-based hand sanitizer gel' },
            image: PLACEHOLDER_IMAGE,
            durationMinutes: 2,
            price: 25,
            available: true,
            sizes: [
              { name: { ar: '100ml', en: '100ml' }, price: 15, isDefault: true },
              { name: { ar: '500ml', en: '500ml' }, price: 45, isDefault: false },
            ],
          },
        ],
      },
    ],
  },
];

export async function seedStoreTemplates(prisma: PrismaClient) {
  const count = await prisma.storeTemplate.count();
  if (count > 0) return;

  for (const [i, tmpl] of templates.entries()) {
    await prisma.storeTemplate.create({
      data: {
        name: tmpl.name,
        description: tmpl.description ?? null,
        moduleType: tmpl.moduleType,
        active: true,
        order: tmpl.order,
        categories: {
          create: tmpl.categories.map((cat) => ({
            name: cat.name,
            order: cat.order,
            services: {
              create: cat.services.map((svc) => ({
                name: svc.name,
                description: svc.description,
                image: svc.image,
                durationMinutes: svc.durationMinutes,
                price: svc.price,
                priceAfterDiscount: svc.priceAfterDiscount ?? null,
                available: svc.available,
                bestRated: svc.bestRated ?? false,
                mostSeller: svc.mostSeller ?? false,
                sizes: {
                  create: svc.sizes.map((sz) => ({
                    name: sz.name,
                    price: sz.price,
                    priceAfterDiscount: sz.priceAfterDiscount ?? null,
                    isDefault: sz.isDefault,
                  })),
                },
                addons: svc.addons?.length
                  ? {
                      create: svc.addons.map((ad) => ({
                        name: ad.name,
                        price: ad.price,
                      })),
                    }
                  : undefined,
              })),
            },
          })),
        },
      },
    });

    // eslint-disable-next-line no-console
    console.log(`  ✅ Template ${i + 1}/${templates.length}: ${tmpl.name.en}`);
  }

  // eslint-disable-next-line no-console
  console.log('✅ StoreTemplate seeded (3 templates: Restaurant, Grocery, Pharmacy)');
}
