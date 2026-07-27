import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from 'src/globals/services/prisma.service';

// Shared gate for catalog-building actions (categories, services, bundles,
// coupons): a self-registered store can't touch these until an admin approves it
// via PATCH /stores/:id/approval. Admin-created stores are accepted immediately
// (see StoreService.create), so this never blocks them.
export async function assertStoreAccepted(prisma: PrismaService, storeId: Id) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { isStoreAccepted: true },
  });
  if (!store?.isStoreAccepted) {
    throw new ForbiddenException('Your store is still pending admin review');
  }
}
