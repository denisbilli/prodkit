import { expect, it } from 'vitest';
import { string } from './index';

it('parses a string', () => expect(string().parse('a')).toBe('a'));
