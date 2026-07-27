export const globalValidationPipeOptions = {
  transform: true,
  stopAtFirstError: true,
  errorHttpStatusCode: 400,
  whitelist: true,
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
};
