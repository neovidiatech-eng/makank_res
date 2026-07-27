import { Request } from 'express';

export const reqHelper = (
  req: Request,
): { locale: 'ar' | 'en'; user: CurrentUser } => {
  return {
    locale: req.headers.locale == 'ar' ? 'ar' : 'en',
    user: req.user as CurrentUser,
  };
};
