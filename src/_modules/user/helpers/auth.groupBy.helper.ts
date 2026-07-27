type GroupedItem = {
  name: any;
  prefix: string;
  method: any[];
  id?: number;
};

export const grouped = (data: any) =>
  Object.values(
    data?.reduce((acc: Record<string, GroupedItem>, item: any) => {
      const key = JSON.stringify(item.prefix); // group by name (en + ar)

      if (!acc[key]) {
        acc[key] = {
          id: item.id,
          name: item.name,
          prefix: item.prefix,
          method: [],
        };
      }

      acc[key].method.push(item.method);
      return acc;
    }, {}),
  );
