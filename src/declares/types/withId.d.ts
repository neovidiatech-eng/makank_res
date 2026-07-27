declare global {
  type WithId<T> = T & { id: Id };
}
export {};
