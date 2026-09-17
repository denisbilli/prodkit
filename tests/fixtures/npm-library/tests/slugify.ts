import { slugify } from '../src/index';
test('lowercases and joins', () => { expect(slugify('Hello World')).toBe('hello-world'); });
