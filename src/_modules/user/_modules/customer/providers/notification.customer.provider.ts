import { SystemNotificationStatus } from '@prisma/client';
import { RolesKeys } from 'src/_modules/authorization/providers/roles';

export const CustomerNotification = [
  {
    id: 1,
    title: { en: 'Welcome to Bookspa', ar: 'مرحبا بكم في بوك سبا' },
    body: {
      en: 'Thank you for joining Bookspa. We are excited to have you on board!',
      ar: 'شكرا لانضمامك إلى بوك سبا. نحن متحمسون لوجودك معنا!',
    },
    event: 'authentication/verify_post',
    receiverId: RolesKeys.CUSTOMER,
    senderId: RolesKeys.CUSTOMER,
    email: SystemNotificationStatus.ACTIVE,
    sms: SystemNotificationStatus.ACTIVE,
    notification: SystemNotificationStatus.ACTIVE,
    group: false,
  },
  {
    id: 2,
    title: { en: 'New Customer', ar: 'عميل جديد' },
    body: {
      en: 'New customer has joined Bookspa.',
      ar: 'عميل جديد انضم إلى بوك سبا.',
    },
    senderId: RolesKeys.CUSTOMER,
    email: SystemNotificationStatus.ACTIVE,
    sms: SystemNotificationStatus.ACTIVE,
    notification: SystemNotificationStatus.ACTIVE,
    event: 'authentication/verify_post',
    receiverId: RolesKeys.ADMIN,
    group: true,
  },
  {
    id: 3,
    title: { en: 'Status Updated', ar: 'تم تحديث الحالة' },
    body: {
      en: 'Your account status has been updated.',
      ar: 'تم تحديث حالة حسابك.',
    },
    senderId: RolesKeys.ADMIN,
    email: SystemNotificationStatus.ACTIVE,
    sms: SystemNotificationStatus.ACTIVE,
    notification: SystemNotificationStatus.ACTIVE,
    event: 'customers_patch',
    receiverId: RolesKeys.CUSTOMER,
    group: false,
  },
];
