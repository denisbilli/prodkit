import { expect, it } from 'vitest';
import { TinyWeb } from './index';

it('routes', async () => {
  const app = new TinyWeb().get('/', () => new Response('ok'));
  expect(await app.fetch(new Request('http://x/')).text()).toBe('ok');
});
