import {
  PermissionMap,
  permissions,
} from 'src/_modules/authorization/providers/permissions.provider';

export function mapPermissionConfigToRole(permMap: PermissionMap) {
  const result: {
    index: number;
    methods: number[];
  }[] = [];

  for (const prefix in permMap) {
    const perm = permissions.find((p) => p.prefix === prefix);
    if (!perm) {
      throw new Error(`Permission prefix "${prefix}" not found`);
    }

    const methodIndexes = permMap[prefix].map((method) => {
      const index = perm.methods.indexOf(method);
      if (index === -1) {
        throw new Error(
          `Method "${method}" not valid for permission "${prefix}"`,
        );
      }
      return index;
    });

    result.push({
      index: permissions.indexOf(perm),
      methods: methodIndexes,
    });
  }

  return result;
}
