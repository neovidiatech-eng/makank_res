export const FilterByFromToDate = (
  fromDate?: Date,
  toDate?: Date,
  dateKey = 'createdAt',
) => {
  return {
    [dateKey]: {
      gte: fromDate,
      lte: toDate,
    },
  };
};
