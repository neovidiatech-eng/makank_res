import { Prisma } from '@prisma/client';

export const JoinedUserDataSelect = {
  id: true,
  name: true,
} satisfies Prisma.UserSelect;

export const UserDataSelect = {
  ...JoinedUserDataSelect,
} satisfies Prisma.UserSelect;

export const PlainUserSelect = {
  ...UserDataSelect,
  image: true,

  // acceptNotification: true,
} satisfies Prisma.UserSelect;

export const UsersSelect = {
  ...PlainUserSelect,
};

export const UserSelect = {
  ...UsersSelect,
} satisfies Prisma.UserSelect;

export const joinedUserArgs = {
  select: JoinedUserDataSelect,
} satisfies Prisma.UserFindManyArgs;

export const OrderUserDataArgs = {
  select: {
    id: true,
    name: true,
    image: true,
  },
} satisfies Prisma.UserFindManyArgs;

export const JoinedChatRoomDataSelect = {
  id: true,
  name: true,
} satisfies Prisma.UserSelect;
