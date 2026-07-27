export function isOne(id: Id | Id[] | any) {
  if (Array.isArray(id)) {
    return id.length === 1;
  }
  if (id) {
    return true;
  }
  return false;
}

export function firstOrMany(id: Id | Id[] | number | any) {
  return isOne(id) ? 'findFirst' : 'findMany';
}
export function totalOrNot(
  id: Id | Id[] | number | any,
  data: any,
  total?: number,
) {
  return isOne(id) ? data : { data, total };
}
