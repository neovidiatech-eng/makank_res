import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

export async function cleanOrphanedUserImages() {
  console.log('🔍 Fetching active user images from database...');
  const users = await prisma.user.findMany({
    select: { image: true },
  });

  const activeFilenames = new Set(
    users
      .map((u) => (u.image ? path.basename(u.image) : null))
      .filter((name): name is string => Boolean(name) && !name.includes('default')),
  );

  const uploadsRoot = process.env.UPLOADS_PATH || 'uploads';
  const uploadDir = path.isAbsolute(uploadsRoot)
    ? path.join(uploadsRoot, 'user')
    : path.join(process.cwd(), uploadsRoot, 'user');

  if (!fs.existsSync(uploadDir)) {
    console.log(`ℹ️ Directory ${uploadDir} does not exist. Nothing to clean.`);
    return;
  }

  console.log(`📁 Scanning directory: ${uploadDir}`);
  const files = fs.readdirSync(uploadDir);

  let deletedCount = 0;
  let keptCount = 0;

  for (const file of files) {
    if (!activeFilenames.has(file)) {
      try {
        const fullPath = path.join(uploadDir, file);
        if (fs.statSync(fullPath).isFile()) {
          fs.unlinkSync(fullPath);
          deletedCount++;
        }
      } catch (err: any) {
        console.error(`Failed to delete ${file}: ${err.message}`);
      }
    } else {
      keptCount++;
    }
  }

  console.log(`✅ Orphaned uploads cleanup complete!`);
  console.log(`🗑️ Deleted orphaned image files: ${deletedCount}`);
  console.log(`📸 Retained active user images: ${keptCount}`);
}

if (require.main === module) {
  cleanOrphanedUserImages()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
