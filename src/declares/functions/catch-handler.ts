global.catchHandler = (error: Error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  return error;
};

export {};
