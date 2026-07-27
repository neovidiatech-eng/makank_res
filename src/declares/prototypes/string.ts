String.prototype.capitalFirstLetter = function () {
  return this.charAt(0).toUpperCase() + this.slice(1);
};

String.prototype.latLongSeparator = function () {
  return this.split(', ');
};

String.prototype.toCamelCase = function toCamelCase() {
  const str = this.toLowerCase();
  const words = str.split(/[^a-zA-Z0-9]+|[\s]+/);

  for (let i = 1; i < words.length; i++) {
    words[i] = words[i][0].toUpperCase() + words[i].slice(1);
  }

  return words.join('');
};

String.prototype.toSnakeCase = function (): string {
  let str = this.replace(/([a-z])([A-Z])/g, '$1_$2');
  str = str.replace(/[-\s]+/g, '_');

  return str.toLowerCase();
};

String.prototype.toPascalCase = function toPascalCase() {
  const str = this.toLowerCase();
  const words = str.split(/[^a-zA-Z0-9]+|[\s]+/);

  for (let i = 0; i < words.length; i++) {
    words[i] = words[i][0].toUpperCase() + words[i].slice(1);
  }

  return words.join('');
};

String.prototype.quatIt = function () {
  return `"${this}"`;
};

String.prototype.toKebabCase = function (): string {
  return this.replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
};

export {};
