export function addIncludeDeletedFlag<T>(args: T, includeDeleted = false): T & { __includeDeleted: boolean } {
  return {
    ...(args as any),
    __includeDeleted: includeDeleted,
  };
}