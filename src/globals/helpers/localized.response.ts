export function localizedMessage<Messages>(
  responses: Messages,
  key: keyof Messages,
  locale: Locale | string,
) {
  const targetLanguage = locale?.toLowerCase() == 'ar' ? 'ar' : 'en';

  return responses[key][targetLanguage];
}
