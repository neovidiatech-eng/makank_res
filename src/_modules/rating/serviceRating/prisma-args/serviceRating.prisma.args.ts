// import { Prisma, Language, ServiceRating } from '@prisma/client';
// import { paginateOrNot } from 'src/globals/helpers/pagination-params';
// import {
//   filterJsonKeyWithRawSQL,
//   filterKey,
//   orderKey,
// } from 'src/globals/helpers/prisma-filters';
// import { FilterServiceRatingDTO } from '../dto/serviceRating.dto';

// export const getServiceRatingArgs = (
//   query: FilterServiceRatingDTO,
//   languages: Language[],
// ) => {
//   const {  page, limit, ...filter } = query;
//   const searchArray = [
//     filterKey<ServiceRating>(filter, 'id'),
//     filterKey<ServiceRating>(filter, 'serviceId'),
//     filterKey<ServiceRating>(filter, 'userId'),
//   ].filter(Boolean) as Prisma.ServiceRatingWhereInput[];
//   return {
//     ...paginateOrNot({ limit, page }, query?.id),
//     where: {
//       AND: searchArray,
//     },
//   } as Prisma.ServiceRatingFindManyArgs;
// };

// export const selectServiceRatingOBJ = () => {
//   const selectArgs: Prisma.ServiceRatingSelect = {
//     id: true,
//     rating:true,
//     serviceId:true,
//     userId:true,
//     Service:true,
//     Customer:true,
//   };
//   return selectArgs;
// };
// export const getServiceRatingArgsWithSelect = () => {
//   return {
//     select: selectServiceRatingOBJ(),
//   } satisfies Prisma.ServiceRatingFindManyArgs;
// };
