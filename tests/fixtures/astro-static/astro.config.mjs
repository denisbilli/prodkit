import { defineConfig } from 'astro/config';

// The default. A brochure site with no server: nothing here handles a request at
// run time, so this project has no backend to judge.
export default defineConfig({ output: 'static' });
