import { TinyWeb } from '../../src/index';

export const app = new TinyWeb().get('/', () => new Response('node'));
