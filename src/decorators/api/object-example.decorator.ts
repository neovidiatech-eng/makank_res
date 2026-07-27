/**
 * Transforms a DTO class to a plain data object by creating an instance and extracting its properties
 * Useful for creating examples and documentation
 *
 * @param dtoClass - The DTO class to transform
 * @param options - Optional configuration
 * @returns Plain object representation of the DTO
 */
export function transformDtoToData<T extends new (...args: any[]) => any>(
  dtoClass: T,
  options: {
    excludeUndefined?: boolean;
    excludePrivate?: boolean;
    mockData?: boolean;
  } = {},
): Record<string, any> {
  const {
    excludeUndefined = true,
    excludePrivate = true,
    mockData = true,
  } = options;

  // Create an instance of the DTO class
  const instance = new dtoClass();

  // Get metadata from the class if available (using reflect-metadata if configured)
  const metadata = Reflect.getMetadata
    ? Reflect.getMetadata('dto:properties', dtoClass)
    : null;

  // Get all property names from the instance
  const data: Record<string, any> = {};

  // Process the properties
  for (const key of Object.getOwnPropertyNames(instance)) {
    // Skip private properties if configured to exclude them
    if (excludePrivate && key.startsWith('_')) {
      continue;
    }

    let value = instance[key];

    // Generate mock data if configured and metadata is available
    if (mockData && metadata && metadata[key]) {
      value = generateMockValueFromMetadata(metadata[key], key);
    }

    // Skip undefined values if configured to exclude them
    if (excludeUndefined && value === undefined) {
      continue;
    }

    data[key] = value;
  }

  // Process nested objects that might be specified with @ValidateObject
  if (metadata) {
    for (const key in metadata) {
      if (metadata[key].isNested && metadata[key].nestedType) {
        // For arrays of nested objects
        if (metadata[key].isArray) {
          data[key] = [transformDtoToData(metadata[key].nestedType, options)];
        }
        // For single nested objects
        else {
          data[key] = transformDtoToData(metadata[key].nestedType, options);
        }
      }
    }
  }

  return data;
}

/**
 * Generates mock values based on property metadata
 */
function generateMockValueFromMetadata(
  metadata: any,
  propertyName: string,
): any {
  if (!metadata) return undefined;

  // Handle different types based on decorators and validation rules
  if (metadata.isEnum && metadata.enumType) {
    // Get first value from enum
    const enumValues = Object.values(metadata.enumType);
    return enumValues[0];
  }

  if (metadata.isDate) {
    return new Date().toISOString();
  }

  if (metadata.isNumber) {
    return metadata.min !== undefined ? metadata.min : 1;
  }

  if (metadata.isBoolean) {
    return true;
  }

  if (metadata.isString) {
    // Generate sensible mock strings based on property name
    if (propertyName.toLowerCase().includes('name')) {
      return 'Example Name';
    } else if (propertyName.toLowerCase().includes('id')) {
      return '12345';
    } else if (propertyName.toLowerCase().includes('email')) {
      return 'example@example.com';
    } else {
      return 'Example string';
    }
  }

  if (metadata.isArray) {
    if (metadata.arrayItemType === String) {
      return ['Example item'];
    }
    return [];
  }

  // Handle file uploads
  if (metadata.isFile) {
    return 'example-file.pdf';
  }

  return undefined;
}

/**
 * Extract example data from a DTO for use in Swagger documentation
 *
 * @param dtoClass - The DTO class to transform
 * @returns Plain object representation with example data
 */
export function generateDtoExample<T extends new (...args: any[]) => any>(
  dtoClass: T,
): Record<string, any> {
  return transformDtoToData(dtoClass, {
    excludeUndefined: true,
    mockData: true,
  });
}
