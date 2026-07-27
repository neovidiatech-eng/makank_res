// Scans every DB column that stores an uploaded image path and reports which
// files are missing from disk or truncated/corrupted (same trailing-byte
// check used by MapUploadsInterceptor for new uploads). Run this once after
// deploying the upload-integrity fix to find pre-existing broken images that
// need to be re-uploaded manually — the fix only prevents NEW corruption, it
// does not repair files that were already saved incomplete.
//
// Usage (from the backend container or any host with DATABASE_URL set):
//   npx ts-node -r tsconfig-paths/register scripts/find-corrupt-images.ts

import { PrismaClient } from '@prisma/client';
import { existsSync } from 'fs';
import * as path from 'path';
import { isImageFileIntact } from '../src/_modules/media/helpers/validate-image-integrity';

const prisma = new PrismaClient();

function mimetypeFromExtension(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  return undefined; // no trailer check implemented for this format — skip
}

type Target = {
  label: string;
  rows: () => Promise<{ id: number | string; field: string; value: string | null }[]>;
};

const targets: Target[] = [
  {
    label: 'Store.logo / Store.cover',
    rows: async () => {
      const stores = await prisma.store.findMany({
        select: { id: true, logo: true, cover: true },
      });
      return stores.flatMap((s) => [
        { id: s.id, field: 'logo', value: s.logo },
        { id: s.id, field: 'cover', value: s.cover },
      ]);
    },
  },
  {
    label: 'Service.image',
    rows: async () => {
      const rows = await prisma.service.findMany({
        select: { id: true, image: true },
      });
      return rows.map((r) => ({ id: r.id, field: 'image', value: r.image }));
    },
  },
  {
    label: 'Category.image',
    rows: async () => {
      const rows = await prisma.category.findMany({
        where: { image: { not: null } },
        select: { id: true, image: true },
      });
      return rows.map((r) => ({ id: r.id, field: 'image', value: r.image }));
    },
  },
  {
    label: 'Banner.image',
    rows: async () => {
      const rows = await prisma.banner.findMany({
        select: { id: true, image: true },
      });
      return rows.map((r) => ({ id: r.id, field: 'image', value: r.image }));
    },
  },
  {
    label: 'Bundle.image',
    rows: async () => {
      const rows = await prisma.bundle.findMany({
        select: { id: true, image: true },
      });
      return rows.map((r) => ({ id: r.id, field: 'image', value: r.image }));
    },
  },
  {
    label: 'Campaign.image',
    rows: async () => {
      const rows = await prisma.campaign.findMany({
        where: { image: { not: null } },
        select: { id: true, image: true },
      });
      return rows.map((r) => ({ id: r.id, field: 'image', value: r.image }));
    },
  },
  {
    label: 'AdminNotification.image',
    rows: async () => {
      const rows = await prisma.adminNotification.findMany({
        where: { image: { not: null } },
        select: { id: true, image: true },
      });
      return rows.map((r) => ({ id: r.id, field: 'image', value: r.image }));
    },
  },
  {
    label: 'StoreTemplate.image',
    rows: async () => {
      const rows = await prisma.storeTemplate.findMany({
        where: { image: { not: null } },
        select: { id: true, image: true },
      });
      return rows.map((r) => ({ id: r.id, field: 'image', value: r.image }));
    },
  },
  {
    label: 'TemplateCategory.image',
    rows: async () => {
      const rows = await prisma.templateCategory.findMany({
        where: { image: { not: null } },
        select: { id: true, image: true },
      });
      return rows.map((r) => ({ id: r.id, field: 'image', value: r.image }));
    },
  },
  {
    label: 'TemplateService.image',
    rows: async () => {
      const rows = await prisma.templateService.findMany({
        select: { id: true, image: true },
      });
      return rows.map((r) => ({ id: r.id, field: 'image', value: r.image }));
    },
  },
  {
    label: 'User.image (excluding default avatar)',
    rows: async () => {
      const rows = await prisma.user.findMany({
        where: { image: { not: 'uploads/default.png' } },
        select: { id: true, image: true },
      });
      return rows.map((r) => ({ id: r.id, field: 'image', value: r.image }));
    },
  },
];

async function main() {
  let missingCount = 0;
  let corruptCount = 0;
  let okCount = 0;

  for (const target of targets) {
    const rows = await target.rows();

    for (const row of rows) {
      if (!row.value || row.value.startsWith('http')) continue; // external URL — nothing to check on disk

      const fullPath = path.join(process.cwd(), row.value);

      if (!existsSync(fullPath)) {
        missingCount++;
        console.log(
          `[MISSING] ${target.label} — id=${row.id} field=${row.field} path=${row.value}`,
        );
        continue;
      }

      const mimetype = mimetypeFromExtension(row.value);
      if (!mimetype) {
        okCount++; // format we don't have a trailer check for — assume fine
        continue;
      }

      if (!isImageFileIntact(fullPath, mimetype)) {
        corruptCount++;
        console.log(
          `[CORRUPT] ${target.label} — id=${row.id} field=${row.field} path=${row.value}`,
        );
      } else {
        okCount++;
      }
    }
  }

  console.log('\n--- Summary ---');
  console.log(`OK:      ${okCount}`);
  console.log(`Missing: ${missingCount}`);
  console.log(`Corrupt: ${corruptCount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
