export const paginationParams = (params: PaginationParams) => {
  const { page, limit } = params;
  const parsedPage = page || 1;
  let parsedLimit = limit || 10;
  if (parsedLimit > +env('MAX_PAGE_LIMIT'))
    parsedLimit = +env('MAX_PAGE_LIMIT');

  return parsedLimit !== -1
    ? { page: parsedPage, limit: parsedLimit }
    : undefined;
};

export const prismaPagination = (params: PaginationParams) => {
  const parsed = paginationParams(params);
  return {
    take: parsed?.limit,
    skip: (parsed?.page - 1) * parsed?.limit,
  };
};

export const paginateOrNot = (params: PaginationParams, isOne: unknown) => {
  if (isOne) return;
  return prismaPagination(params);
};

export function extractPaginationAndFilters<Type extends PaginationParams>(
  query: Type,
) {
  const { page, limit, ...filters } = query;
  const paginationParams = { page, limit };
  return { paginationParams, filters };
}
