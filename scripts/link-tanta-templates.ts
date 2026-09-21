import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Linking Tanta Stores to StoreTemplates & TemplateCategories...');

  // 1. Find or Create Restaurant StoreTemplate
  let restaurantTemplate = await prisma.storeTemplate.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { moduleType: 'restaurant' },
        { id: 1 },
      ],
    },
    include: { categories: true },
  });

  if (!restaurantTemplate) {
    console.log('  ➜ Creating new Restaurant StoreTemplate...');
    restaurantTemplate = await prisma.storeTemplate.create({
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
  } else {
    console.log(`  ✔ Found existing Restaurant Template [${restaurantTemplate.id}]: ${JSON.stringify(restaurantTemplate.name)}`);
  }

  // 2. Ensure standard template categories exist
  const standardCategories = [
    { name: { ar: 'وجبات رئيسية', en: 'Main Dishes' }, order: 1, keywords: ['وجبات', 'أطباق', 'صواني', 'محاشي', 'باستا', 'مكرونة'] },
    { name: { ar: 'سندوتشات', en: 'Sandwiches' }, order: 2, keywords: ['سندوتش', 'برجر', 'شاورما', 'تيك أواي'] },
    { name: { ar: 'بيتزا وفطائر', en: 'Pizza & Pies' }, order: 3, keywords: ['بيتزا', 'فطير', 'فطائر'] },
    { name: { ar: 'كشري وطواجن', en: 'Koshary & Casseroles' }, order: 4, keywords: ['كشري', 'طاجن', 'طواجن'] },
    { name: { ar: 'مشويات وكباب', en: 'Grills & Kebab' }, order: 5, keywords: ['مشوي', 'مشويات', 'كباب', 'لحوم'] },
    { name: { ar: 'كريب ووافل', en: 'Crepes & Waffles' }, order: 6, keywords: ['كريب', 'وافل'] },
    { name: { ar: 'حلويات ومشروبات', en: 'Desserts & Drinks' }, order: 7, keywords: ['حلو', 'حلويات', 'عصير', 'مشروب', 'تورت', 'نوتيلا'] },
    { name: { ar: 'مأكولات بحرية', en: 'Seafood' }, order: 8, keywords: ['سمك', 'جمبري', 'بحريات', 'سي فود'] },
  ];

  const templateCategoryMap: { id: number; keywords: string[] }[] = [];
  const existingCategories = (restaurantTemplate as any).categories ?? [];

  for (const catDef of standardCategories) {
    let existing = existingCategories.find((c: any) => {
      const arName = typeof c.name === 'object' ? (c.name as any)?.ar : String(c.name);
      return arName === catDef.name.ar;
    });

    if (!existing) {
      existing = await prisma.templateCategory.create({
        data: {
          name: catDef.name,
          order: catDef.order,
          templateId: restaurantTemplate.id,
        },
      });
      console.log(`    + Created TemplateCategory [${existing.id}]: ${catDef.name.ar}`);
    }

    templateCategoryMap.push({
      id: existing.id,
      keywords: catDef.keywords,
    });
  }

  // 3. Find all Tanta stores (ids 201 to 210 or cityId = 2)
  const tantaStores = await prisma.store.findMany({
    where: {
      OR: [
        { cityId: 2 },
        { id: { in: [201, 202, 203, 204, 205, 206, 207, 208, 209, 210] } },
      ],
    },
    include: {
      SubCategories: true,
    },
  });

  console.log(`  ✔ Found ${tantaStores.length} Tanta stores to link.`);

  for (const store of tantaStores) {
    // 3a. Link Store to Restaurant Template
    await prisma.storeTemplateApplication.upsert({
      where: {
        storeId_templateId: {
          storeId: store.id,
          templateId: restaurantTemplate.id,
        },
      },
      update: {},
      create: {
        storeId: store.id,
        templateId: restaurantTemplate.id,
        order: store.storeOrder ?? 0,
      },
    });

    // 3b. Map store categories to template categories
    for (const cat of store.SubCategories) {
      const arName = typeof cat.name === 'object' ? (cat.name as any)?.ar : String(cat.name);
      
      let matchedTemplateCategoryId = templateCategoryMap[0].id; // Default to first (وجبات رئيسية)
      for (const mapping of templateCategoryMap) {
        if (mapping.keywords.some(k => arName.includes(k))) {
          matchedTemplateCategoryId = mapping.id;
          break;
        }
      }

      await prisma.category.update({
        where: { id: cat.id },
        data: { templateCategoryId: matchedTemplateCategoryId },
      });
    }

    console.log(`    ✔ Linked store [${store.id}] (${typeof store.name === 'object' ? (store.name as any)?.ar : store.name}) -> Template [${restaurantTemplate.id}], ${store.SubCategories.length} categories mapped`);
  }

  console.log('\n🎉 ALL TANTA STORES SUCCESSFULLY LINKED TO RESTAURANT TEMPLATE & CATEGORIES!');
}

main()
  .catch((e) => {
    console.error('❌ Error linking Tanta templates:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
