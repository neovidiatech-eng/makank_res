export const enumToArray = <T>(enumObj: T): Array<string> => {
  return Object.keys(enumObj).map((key) => enumObj[key]);
};
