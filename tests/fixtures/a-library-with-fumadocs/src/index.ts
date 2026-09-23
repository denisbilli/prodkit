export type Schema<T> = { parse(input: unknown): T };

export const string = (): Schema<string> => ({
  parse(input) {
    if (typeof input !== 'string') throw new Error('Expected string');
    return input;
  },
});
