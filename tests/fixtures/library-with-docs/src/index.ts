export interface Schema<T> {
  parse(value: unknown): T;
}

export function string(): Schema<string> {
  return {
    parse(value) {
      if (typeof value !== 'string') throw new TypeError('expected a string');
      return value;
    },
  };
}
