export function search<T>(
  filters: Partial<{
    [key in keyof T]: any[] | number[] | Id | string | boolean;
  }>,
  key: keyof T,
) {
  if (Array.isArray(filters[key as string])) {
    return filters[key as string]?.map((value: any) => {
      const condition =
        typeof value === 'number' ? { equals: value } : { contains: value };
      return { OR: [{ [key]: condition }] };
    });
  } else {
    const value = filters[key as string];
    if (value !== undefined) {
      const condition =
        typeof value === 'number' ? { equals: value } : { contains: value };
      return [{ [key]: condition }];
    }
    return undefined;
  }
}

export function filterKey<T>(
  filters: Partial<{
    [key in keyof T]: any[] | number[] | Id | string | boolean | Date;
  }>,
  key: keyof T,
) {
  if (Array.isArray(filters[key])) {
    return filters[key]?.length ? { [key]: { in: filters[key] } } : undefined;
  } else {
    return filters[key] !== undefined
      ? { [key]: { equals: filters[key] } }
      : undefined;
  }
}
export function filterJsonKeyWithRawSQL<T>(
  filters: Partial<{
    [key in keyof T]: string | any[] | number | boolean | Date;
  }>,
  key: keyof T,
  languages,
) {
  const filterValue = filters[key];

  if (filterValue === undefined || filterValue === null) {
    return undefined;
  }

  if (typeof filterValue === 'string') {
    const trimmedValue = filterValue.trim();
    if (trimmedValue === '') {
      return undefined;
    }
    // MySQL JSON path string_contains is case-sensitive (uses binary collation).
    // Build case variants so "burger" matches "Burger", "BURGER", etc.
    const variants = new Set([
      trimmedValue,
      trimmedValue.toLowerCase(),
      trimmedValue.toUpperCase(),
      trimmedValue[0].toUpperCase() + trimmedValue.slice(1).toLowerCase(),
    ]);
    const filter = [];
    languages.forEach((element: { key: string }) => {
      variants.forEach((variant) => {
        filter.push({
          [key]: {
            path: `$.${element.key}`,
            string_contains: variant,
          },
        });
      });
    });
    return {
      OR: filter,
    };
  }

  if (Array.isArray(filterValue)) {
    return filterValue.length > 0 ? { [key]: { in: filterValue } } : undefined;
  }

  return { [key]: { equals: filterValue } };
}
export function orderKey<T>(
  flag: string,
  field: string | keyof T,
  body?: any,
):
  | { [key: string]: { [key: string]: 'asc' | 'desc' } }
  | { [key: string]: 'asc' | 'desc' }
  | undefined {
  const parts = String(field).split('.');
  if (
    parts.length > 1 &&
    body?.find((item) => item[flag] !== undefined)?.[flag] !== undefined
  ) {
    const result = parts.reduceRight<{ [key: string]: any } | undefined>(
      (acc, part, index) => {
        if (index === parts.length - 1) {
          return {
            [part]: body?.find((item) => item[flag] !== undefined)?.[flag],
          };
        } else {
          return { [part]: { ...acc } };
        }
      },
      {},
    );

    return result;
  } else {
    const fieldValue = body?.find((item) => item[flag] !== undefined)?.[flag];
    return fieldValue !== undefined
      ? { [String(field)]: fieldValue }
      : undefined;
  }
}

export function composedOrderKey(
  flag: string,
  field: any,
  index: number,
  body?: any,
):
  | { [key: string]: { [key: string]: 'asc' | 'desc' } }
  | { [key: string]: 'asc' | 'desc' }
  | undefined {
  if (typeof field === 'object') {
    const fieldValue = body?.find((item) => item[flag] !== undefined)?.[flag];
    if (fieldValue === undefined) return undefined;

    // Handle nested path case (e.g., Store.{startDate,endDate})
    const [prefix, ...rest] = Object.keys(field)[0].split('.');
    if (rest.length) {
      return {
        [prefix]: Object.keys(field).reduce(
          (acc, key) => ({
            ...acc,
            [key.split('.').pop()!]: fieldValue,
          }),
          {},
        ),
      };
    }

    // Handle flat case (e.g., {startDate,endDate}) - only use first key
    const firstKey = Object.keys(field)[index];
    return {
      [firstKey.split('.').pop()!]: fieldValue,
    };
  }
  const parts = String(field).split('.');
  if (
    parts.length > 1 &&
    body?.find((item) => item[flag] !== undefined)?.[flag] !== undefined
  ) {
    const result = parts.reduceRight<{ [key: string]: any } | undefined>(
      (acc, part, index) => {
        if (index === parts.length - 1) {
          return {
            [part]: body?.find((item) => item[flag] !== undefined)?.[flag],
          };
        } else {
          return { [part]: { ...acc } };
        }
      },
      {},
    );

    return result;
  } else {
    const fieldValue = body?.find((item) => item[flag] !== undefined)?.[flag];
    return fieldValue !== undefined
      ? { [String(field)]: fieldValue }
      : undefined;
  }
}

export function betweenDates<T>(key: keyof T, start?: Date, end?: Date) {
  return {
    [key]: { gte: start, lte: end },
  };
}
export function containsFilter<T>(key: keyof T, value?: string) {
  return value
    ? {
        OR: [{ [key]: { contains: value } }],
      }
    : {};
}
export function containsInFields<T>(fields: (keyof T)[], value?: string) {
  return value
    ? {
        OR: fields.map((field) => ({
          [field]: { contains: value },
        })),
      }
    : {};
}
