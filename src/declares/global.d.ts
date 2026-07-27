declare global {
  function env(key: keyof typeof process.env);
}

export {};
