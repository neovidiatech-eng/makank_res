import { Campaign, Language, Prisma } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import {
  filterJsonKeyWithRawSQL,
  filterKey,
} from 'src/globals/helpers/prisma-filters';
import { CampaignDerivedStatus, FilterCampaignDTO } from '../dto/campaign.dto';

// Translate a requested derived status into a Prisma where-fragment, evaluated against `now`.
// Mirrors deriveCampaignStatus() so list filtering and the returned status field stay consistent.
const statusWhere = (
  status: CampaignDerivedStatus,
  now: Date,
): Prisma.CampaignWhereInput | undefined => {
  switch (status) {
    case 'inactive':
      return { manualStatus: 'INACTIVE' };
    case 'scheduled':
      return { manualStatus: 'ACTIVE', startAt: { gt: now } };
    case 'expired':
      return { manualStatus: 'ACTIVE', endAt: { lt: now } };
    case 'active':
      return {
        manualStatus: 'ACTIVE',
        AND: [
          { OR: [{ startAt: null }, { startAt: { lte: now } }] },
          { OR: [{ endAt: null }, { endAt: { gte: now } }] },
        ],
      };
    default:
      return undefined;
  }
};

export const getCampaignArgs = (
  query: FilterCampaignDTO,
  languages: Language[],
) => {
  const { page, limit, ...filter } = query;
  const now = new Date();

  const searchArray = [
    filterKey<Campaign>(filter, 'id'),
    filter?.title && filterJsonKeyWithRawSQL(filter, 'title', languages),
    filterKey<Campaign>(filter, 'type'),
    filter?.status && statusWhere(filter.status, now),
    (filter?.dateFrom || filter?.dateTo) && {
      createdAt: {
        ...(filter?.dateFrom ? { gte: filter.dateFrom } : {}),
        ...(filter?.dateTo ? { lte: filter.dateTo } : {}),
      },
    },
  ].filter(Boolean) as Prisma.CampaignWhereInput[];

  const orderArray = (query?.orderBy ?? [{ id: 'desc' }]) as
    | Prisma.CampaignOrderByWithRelationInput
    | Prisma.CampaignOrderByWithRelationInput[];

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    orderBy: orderArray,
    where: { AND: searchArray },
  } as Prisma.CampaignFindManyArgs;
};

export const selectCampaignOBJ = () => {
  const selectArgs: Prisma.CampaignSelect = {
    id: true,
    type: true,
    title: true,
    description: true,
    featureText: true,
    valueText: true,
    image: true,
    targetType: true,
    targetUserIds: true,
    storeId: true,
    serviceId: true,
    deliveryId: true,
    startAt: true,
    endAt: true,
    displayIntervalHours: true,
    manualStatus: true,
    sentAt: true,
    createdAt: true,
    Store: { select: { id: true, name: true } },
    Service: { select: { id: true, name: true } },
  };
  return selectArgs;
};

export const getCampaignArgsWithSelect = () => {
  return { select: selectCampaignOBJ() } satisfies Prisma.CampaignFindManyArgs;
};

// Customer-facing popup-offer projection. Omits admin-only fields (manualStatus,
// targetUserIds, sentAt). `Views` is scoped to the current user and used only to
// evaluate the display interval — it is stripped from the response in the service.
//
// storeId/serviceId (and the embedded Store/Service) are offer context and
// deep-link targets for the popup ("tap to open this store/service"). In v1 they
// do NOT restrict which customers receive the offer — see matchesTarget().
export const selectActiveOfferOBJ = (userId: Id) => {
  const selectArgs: Prisma.CampaignSelect = {
    id: true,
    type: true,
    title: true,
    description: true,
    featureText: true,
    valueText: true,
    image: true,
    targetType: true,
    targetUserIds: true,
    storeId: true,
    serviceId: true,
    deliveryId: true,
    startAt: true,
    endAt: true,
    displayIntervalHours: true,
    Store: { select: { id: true, name: true, logo: true } },
    Service: { select: { id: true, name: true, image: true, price: true } },
    Views: {
      where: { userId },
      select: { lastShownAt: true },
    },
  };
  return selectArgs;
};

// Derive the lifecycle status shown in the table. Manual disable always wins,
// then schedule window, otherwise active.
export const deriveCampaignStatus = (campaign: {
  manualStatus: string;
  startAt: Date | null;
  endAt: Date | null;
}): CampaignDerivedStatus => {
  const now = Date.now();
  if (campaign.manualStatus === 'INACTIVE') return 'inactive';
  if (campaign.startAt && now < new Date(campaign.startAt).getTime())
    return 'scheduled';
  if (campaign.endAt && now > new Date(campaign.endAt).getTime())
    return 'expired';
  return 'active';
};
