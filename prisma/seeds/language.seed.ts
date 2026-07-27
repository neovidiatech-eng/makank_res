import { PrismaClient } from '@prisma/client';
const languagesToSeed = [
  {
    key: 'en',
    name: 'English',
    file: 'uploads/i18n/en.json',
    frontFile: 'uploads/i18n/front/en.json',
  },
  {
    key: 'ar',
    name: 'Arabic',
    file: 'uploads/i18n/ar.json',
    frontFile: 'uploads/i18n/front/en.json',
  },
];

export async function seedLanguage(prisma: PrismaClient) {
  for (const lang of languagesToSeed) {
    await prisma.language.upsert({
      where: {
        key: lang.key,
      },
      update: lang,
      create: lang,
    });
  }
  console.log('✅ Languages seeded');
}
