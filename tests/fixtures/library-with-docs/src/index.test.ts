import { describe, expect, it } from 'vitest';
import { string } from './index';

describe('string', () => {
  it('refuses a number', () => {
    expect(() => string().parse(1)).toThrow();
  });
});
