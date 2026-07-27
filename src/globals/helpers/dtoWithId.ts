export function createWithId<T>(dto: T, id: Id): { id: Id } & T {
  return { id, ...dto };
}
