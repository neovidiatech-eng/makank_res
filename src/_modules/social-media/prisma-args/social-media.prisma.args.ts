import { Prisma, SocialMedia } from '@prisma/client';
import { paginateOrNot } from 'src/globals/helpers/pagination-params';
import { filterKey } from 'src/globals/helpers/prisma-filters';
import { FilterSocialMediaDTO } from '../dto/social-media.dto';

export const getSocialMediaArgs = (query: FilterSocialMediaDTO) => {
  const { page, limit, ...filter } = query;
  const searchArray = [
    filterKey<SocialMedia>(filter, 'id'),
    filterKey<SocialMedia>(filter, 'platform'),
    filterKey<SocialMedia>(filter, 'link'),
    filterKey<SocialMedia>(filter, 'isActive'),
  ].filter(Boolean) as Prisma.SocialMediaWhereInput[];

  return {
    ...paginateOrNot({ limit, page }, query?.id),
    where: {
      AND: searchArray,
    },
  } as Prisma.SocialMediaFindManyArgs;
};

export const selectSocialMediaOBJ = () => {
  const selectArgs: Prisma.SocialMediaSelect = {
    id: true,
    platform: true,
    link: true,
    image: true,
    isActive: true,
    createdAt: true,
  };
  return selectArgs;
};
export const getSocialMediaArgsWithSelect = () => {
  return {
    select: selectSocialMediaOBJ(),
  } satisfies Prisma.SocialMediaFindManyArgs;
};
