export function countArgs(args: any) {
  if (typeof args !== 'object') {
    return {};
  }
  if ('where' in args)
    if (args.where !== undefined) return { where: args.where };
  return {};
}
