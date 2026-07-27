declare global {
  function env(key: keyof typeof process.env);
  function catchHandler(error: Error);
}

export {};
