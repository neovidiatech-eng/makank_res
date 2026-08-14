export const corsConfig = {
  origin: true,          // allow ALL origins (development/staging)
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
