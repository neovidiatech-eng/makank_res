import { PrismaClient } from '@prisma/client';
import { CustomerNotification } from 'src/_modules/user/_modules/customer/providers/notification.customer.provider';

const SystemNotificationData = [...CustomerNotification];

export async function seedNotification(prisma: PrismaClient) {
  for (const item of SystemNotificationData) {
 
  }
  console.log('✅ Notification seeded');
}
