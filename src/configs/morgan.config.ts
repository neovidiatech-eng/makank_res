import * as morgan from 'morgan';

morgan.format('custom-professional', function (tokens, req, res) {
  const status = tokens.status(req, res);
  const color =
    +status >= 500
      ? 31 // red
      : +status >= 400
        ? 33 // yellow
        : +status >= 300
          ? 36 // cyan
          : +status >= 200
            ? 32 // green
            : +status >= 100
              ? 90 // gray for 1xx
              : 0;

  return [
    `\x1b[90m[${tokens.date(req, res, 'iso')}]\x1b[0m`,
    `\x1b[34m${req.ip}\x1b[0m`,
    tokens.method(req, res),
    tokens.url(req, res),
    `\x1b[${color}m${status}\x1b[0m`,
    `${tokens['response-time'](req, res)} ms`,
    `- ${tokens.res(req, res, 'content-length') || 0} bytes`,
    `\x1b[90m"${req.headers['user-agent']}"\x1b[0m`,
  ].join(' ');
});

export const morganMiddleware = morgan('custom-professional');
