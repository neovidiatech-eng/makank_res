/**
 * Function to exclude specific values from a Prisma enum type
 * and return a new object with only the remaining values
 *
 * @param enumType The Prisma enum object
 * @param valuesToExclude Array of enum values to exclude
 * @returns Object containing only the non-excluded enum values
 */
export function excludeType<
  T extends Record<string, string>,
  K extends T[keyof T],
>(enumType: T, valuesToExclude: K[]): Record<string, K> {
  const result: Record<string, K> = {};

  // Loop through all enum entries
  Object.entries(enumType).forEach(([key, value]) => {
    // Only add key-value pairs that aren't in the excluded list
    if (!valuesToExclude.includes(value as K)) {
      result[key] = value as K;
    }
  });

  return result;
}
