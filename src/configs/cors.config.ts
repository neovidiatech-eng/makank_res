export const corsConfig = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    const isAllowed =
      /^https?:\/\/(.*\.)?makanak-app\.com$/.test(origin) ||
      /^http:\/\/localhost(:\d+)?$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);

    callback(null, isAllowed);
  },
  methods: '*',
  credentials: true,
  allowedHeaders:
    'Content-Type, Accept, Authorization, Locale, isLocalized, X-Requested-With, Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
};
