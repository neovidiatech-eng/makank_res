global.env = (key: keyof typeof process.env): string | undefined => {
  const value = process.env[key];
  // eslint-disable-next-line no-console
  if (!value) console.error(`The env ${key} is not defined`);
  return value;
};

export {};
