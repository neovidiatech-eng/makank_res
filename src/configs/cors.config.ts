export const corsConfig = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    const allowedOrigins = [
      'https://newmakank-dashboard.vercel.app',
      'https://makank-dashboard.vercel.app',
    ];

    const isAllowed =
      allowedOrigins.includes(origin) ||
      /^https?:\/\/(.*\.)?makanak-app\.com$/.test(origin) ||
      /^https?:\/\/(.*\.)?vercel\.app$/.test(origin) ||
      /^http:\/\/localhost(:\d+)?$/.test(origin) ||
      /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);

    callback(null, isAllowed);
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  credentials: true,
  allowedHeaders: [
    'Content-Type',
    'Accept',
    'Authorization',
    'Locale',
    'isLocalized',
    'X-Requested-With',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
    'refreshtoken',
    'refresh-token',
    'x-custom-lang',
  ].join(', '),
};
