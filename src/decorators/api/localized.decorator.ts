// Global Symbols for Metadata
const LOCALIZED_PROPS = Symbol('localizedProperties');

// Decorator to Mark Localized Properties
export function LocalizedProperty() {
  return (target: any, propertyKey: string) => {
    const localizedProps =
      Reflect.getMetadata(LOCALIZED_PROPS, target.constructor) ||
      new Set<string>();
    localizedProps.add(propertyKey);
    Reflect.defineMetadata(LOCALIZED_PROPS, localizedProps, target.constructor);
  };
}

// Base DTO Class with Dynamic Handling
export class LocalizedDTO {
  constructor(data: Record<string, any>) {
    const localizedProps =
      (Reflect.getMetadata(
        LOCALIZED_PROPS,
        this.constructor as any,
      ) as Set<string>) || new Set();

    // Process all localized properties
    localizedProps.forEach((prop) => {
      const pattern = new RegExp(`^${prop}_(\\w{2})$`, 'i');
      const translations: Array<{ lg: string; value: any }> = [];

      for (const key in data) {
        const match = key.match(pattern);
        if (match) {
          translations.push({
            lg: match[1].toLowerCase(),
            value: data[key],
          });
        }
      }

      // Assign to instance property
      if (translations.length > 0) {
        (this as any)[prop] = translations;
      }
    });

    // Assign non-localized properties
    Object.assign(this, data);
  }

  // Optional: Static method to get all translations
  static getTranslations<T extends LocalizedDTO>(
    data: Record<string, any>,
    DTOClass: new (data: Record<string, any>) => T,
  ): T {
    return new DTOClass(data);
  }
}
