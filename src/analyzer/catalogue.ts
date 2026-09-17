/**
 * What the analyzer recognises, in one place, as data.
 *
 * These tables used to live inside the detector functions, and the documentation of
 * them lived in a README and on a website — three copies of the same list, two of them
 * maintained by hand. They had already drifted apart. Anything that answers "does it
 * work on my stack?" now reads this, and the detectors iterate the same arrays, so a
 * framework cannot be recognised without being listed or listed without being
 * recognised.
 *
 * Entries whose detection is not a dependency lookup are still listed here, with
 * `detectedFrom` saying what actually settles it, because a catalogue that quietly
 * omitted Express or Django would be answering the question wrongly in the direction
 * that loses users.
 */

/** Node backend frameworks, each conclusive from one dependency. */
export const NODE_BACKEND_FRAMEWORKS: Array<[string, string]> = [
  ['next', 'next'],
  ['nestjs', '@nestjs/core'],
  ['fastify', 'fastify'],
  ['hono', 'hono'],
  ['elysia', 'elysia'],
  ['koa', 'koa'],
  ['adonis', '@adonisjs/core'],
  ['sveltekit', '@sveltejs/kit'],
  ['remix', '@remix-run/node'],
  ['remix', '@remix-run/server-runtime'],
  ['nuxt', 'nuxt'],
  ['nitro', 'nitropack'],
];

/** Go frameworks, read from go.mod. */
export const GO_BACKEND_FRAMEWORKS: Array<[string, string[]]> = [
  ['gin', ['gin-gonic/gin']],
  ['echo', ['labstack/echo', 'labstack/echo/v4']],
  ['fiber', ['gofiber/fiber', 'gofiber/fiber/v2']],
  ['chi', ['go-chi/chi', 'go-chi/chi/v5']],
  ['gorilla', ['gorilla/mux']],
  ['beego', ['beego/beego']],
];

/** Ruby frameworks, read from the Gemfile. */
export const RUBY_BACKEND_FRAMEWORKS: Array<[string, string[]]> = [
  ['rails', ['rails']],
  ['sinatra', ['sinatra']],
  ['hanami', ['hanami']],
  ['roda', ['roda']],
  ['grape', ['grape']],
];

/** PHP frameworks, read from composer.json. */
export const PHP_BACKEND_FRAMEWORKS: Array<[string, string[]]> = [
  ['laravel', ['laravel/framework', 'laravel/laravel']],
  ['symfony', ['symfony/framework-bundle', 'symfony/symfony']],
  ['slim', ['slim/slim']],
  ['codeigniter', ['codeigniter4/framework']],
  ['cakephp', ['cakephp/cakephp']],
  ['yii', ['yiisoft/yii2']],
];

/**
 * Python frameworks settled by a dependency alone. Django, Flask and FastAPI are not
 * here: each also has a source-level fallback, so each has its own block in the
 * detector and its own entry in the catalogue below.
 */
export const PYTHON_BACKEND_FRAMEWORKS: Array<[string, string]> = [
  ['litestar', 'litestar'],
  ['sanic', 'sanic'],
  ['tornado', 'tornado'],
  ['aiohttp', 'aiohttp'],
  ['starlette', 'starlette'],
  /**
   * These serve an application over HTTP without calling themselves web frameworks,
   * and a repository built on one was reported as having no backend at all.
   */
  ['streamlit', 'streamlit'],
  ['gradio', 'gradio'],
  ['dash', 'dash'],
  ['chainlit', 'chainlit'],
];

/** Frontend frameworks settled by their signature dependency. */
export const FRONTEND_FRAMEWORKS: Array<[string, string[]]> = [
  ['vue', ['vue']],
  ['nuxt', ['nuxt']],
  ['svelte', ['svelte', '@sveltejs/kit']],
  ['angular', ['@angular/core']],
  ['astro', ['astro']],
  ['solid', ['solid-js']],
  ['qwik', ['@builder.io/qwik']],
  ['preact', ['preact']],
  ['remix', ['@remix-run/react']],
  ['htmx', ['htmx.org']],
];

/**
 * Source languages, and the extensions that say so.
 *
 * `deriveLanguages` knew about TypeScript, JavaScript and Python, so a Go service or a
 * Kotlin app reported `languages: []` while the README and the website both claimed
 * twelve. One table, read by the detector and by the catalogue, is what stops the
 * claim and the code disagreeing again.
 */
export const LANGUAGES: Array<{ id: string; label: string; extensions: RegExp }> = [
  { id: 'typescript', label: 'TypeScript', extensions: /\.(ts|tsx)$/ },
  { id: 'javascript', label: 'JavaScript', extensions: /\.(js|jsx|mjs|cjs)$/ },
  { id: 'python', label: 'Python', extensions: /\.py$/ },
  { id: 'php', label: 'PHP', extensions: /\.php$/ },
  { id: 'go', label: 'Go', extensions: /\.go$/ },
  { id: 'ruby', label: 'Ruby', extensions: /\.rb$/ },
  { id: 'java', label: 'Java', extensions: /\.java$/ },
  { id: 'csharp', label: 'C#', extensions: /\.cs$/ },
  { id: 'rust', label: 'Rust', extensions: /\.rs$/ },
  { id: 'kotlin', label: 'Kotlin', extensions: /\.(kt|kts)$/ },
  { id: 'swift', label: 'Swift', extensions: /\.swift$/ },
  { id: 'dart', label: 'Dart', extensions: /\.dart$/ },
];

export interface CatalogueEntry {
  /** The identifier the report uses. */
  id: string;
  /** What a person calls it. */
  label: string;
  /** What settles it, for the cases a dependency name does not. */
  detectedFrom?: string;
}

export interface StackCatalogue {
  backend: CatalogueEntry[];
  frontend: CatalogueEntry[];
  mobile: CatalogueEntry[];
  databases: CatalogueEntry[];
  dataPlatforms: CatalogueEntry[];
  orms: CatalogueEntry[];
  languages: CatalogueEntry[];
}

/** Display names for ids the tables above produce. */
const LABELS: Record<string, string> = {
  streamlit: 'Streamlit',
  gradio: 'Gradio',
  dash: 'Dash',
  chainlit: 'Chainlit',
  html: 'HTML (no framework)',
  next: 'Next.js',
  nestjs: 'NestJS',
  fastify: 'Fastify',
  hono: 'Hono',
  elysia: 'Elysia',
  koa: 'Koa',
  adonis: 'AdonisJS',
  sveltekit: 'SvelteKit',
  remix: 'Remix',
  nuxt: 'Nuxt',
  nitro: 'Nitro',
  gin: 'Gin',
  echo: 'Echo',
  fiber: 'Fiber',
  chi: 'chi',
  gorilla: 'Gorilla',
  beego: 'Beego',
  rails: 'Rails',
  sinatra: 'Sinatra',
  hanami: 'Hanami',
  roda: 'Roda',
  grape: 'Grape',
  laravel: 'Laravel',
  symfony: 'Symfony',
  slim: 'Slim',
  codeigniter: 'CodeIgniter',
  cakephp: 'CakePHP',
  yii: 'Yii',
  litestar: 'Litestar',
  sanic: 'Sanic',
  tornado: 'Tornado',
  aiohttp: 'aiohttp',
  starlette: 'Starlette',
  vue: 'Vue',
  svelte: 'Svelte',
  angular: 'Angular',
  astro: 'Astro',
  solid: 'Solid',
  qwik: 'Qwik',
  preact: 'Preact',
  htmx: 'htmx',
  react: 'React',
  vite: 'Vite',
  tailwindcss: 'Tailwind CSS',
  electron: 'Electron',
  flutter: 'Flutter',
  'react-native': 'React Native',
  ios: 'iOS (native)',
  android: 'Android (native)',
  express: 'Express',
  flask: 'Flask',
  fastapi: 'FastAPI',
  django: 'Django',
  'aspnet-core': 'ASP.NET Core',
  dotnet: '.NET',
  go: 'Go',
  ruby: 'Ruby',
  php: 'PHP',
  postgres: 'Postgres',
  mysql: 'MySQL',
  sqlite: 'SQLite',
  sqlserver: 'SQL Server',
  mongodb: 'MongoDB',
  redis: 'Redis',
  firestore: 'Firestore',
  dynamodb: 'DynamoDB',
  convex: 'Convex',
  supabase: 'Supabase',
  firebase: 'Firebase',
  planetscale: 'PlanetScale',
  neon: 'Neon',
  'vercel-postgres': 'Vercel Postgres',
  turso: 'Turso',
  upstash: 'Upstash',
  prisma: 'Prisma',
  drizzle: 'Drizzle',
  typeorm: 'TypeORM',
  sequelize: 'Sequelize',
  knex: 'Knex',
  'mikro-orm': 'MikroORM',
  kysely: 'Kysely',
  sqlalchemy: 'SQLAlchemy',
  tortoise: 'Tortoise',
  peewee: 'Peewee',
};

export function labelFor(id: string): string {
  return LABELS[id] ?? id;
}

/**
 * Whether this id has a name written for it, rather than falling back to itself.
 *
 * Exists for the test: several of these are genuinely lowercase — aiohttp, chi, htmx —
 * so "the label looks like an id" cannot tell a missing name from a correct one. A new
 * framework added to a table with no label is the drift worth catching, and this is
 * what catches it.
 */
export function hasLabel(id: string): boolean {
  return id in LABELS;
}

function entries(ids: string[]): CatalogueEntry[] {
  // Deduplicated because a framework can be reached by more than one dependency:
  // Remix is two packages, and the catalogue is a list of frameworks, not of packages.
  const seen = new Set<string>();

  return ids
    .filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
    .map((id) => ({ id, label: labelFor(id) }));
}

/**
 * Everything the analyzer can name, as a catalogue meant to be read by a person.
 *
 * Built from the same arrays the detectors iterate, plus explicit entries for the
 * frameworks whose detection is not a dependency lookup.
 */
export function supportedStacks(): StackCatalogue {
  return {
    backend: [
      { id: 'express', label: 'Express', detectedFrom: 'the dependency, or an import in the source' },
      ...entries(NODE_BACKEND_FRAMEWORKS.map(([id]) => id)),
      {
        id: 'astro',
        label: 'Astro',
        detectedFrom: 'counted as a backend only when configured to serve requests',
      },
      { id: 'django', label: 'Django', detectedFrom: 'manage.py, settings.py and urls.py together' },
      { id: 'flask', label: 'Flask', detectedFrom: 'the dependency, or an import in the source' },
      { id: 'fastapi', label: 'FastAPI', detectedFrom: 'the dependency, or an import in the source' },
      ...entries(PYTHON_BACKEND_FRAMEWORKS.map(([id]) => id)),
      ...entries(GO_BACKEND_FRAMEWORKS.map(([id]) => id)),
      { id: 'go', label: 'Go', detectedFrom: 'a go.mod with no framework in it — net/http is a real answer' },
      ...entries(RUBY_BACKEND_FRAMEWORKS.map(([id]) => id)),
      { id: 'ruby', label: 'Ruby', detectedFrom: 'a Gemfile with no web framework in it' },
      ...entries(PHP_BACKEND_FRAMEWORKS.map(([id]) => id)),
      { id: 'php', label: 'PHP', detectedFrom: 'PHP sources with no framework in composer.json' },
      { id: 'aspnet-core', label: 'ASP.NET Core', detectedFrom: 'the Microsoft.NET.Sdk.Web SDK attribute' },
      { id: 'dotnet', label: '.NET', detectedFrom: 'a .csproj with no web SDK' },
    ],
    frontend: [
      { id: 'react', label: 'React' },
      { id: 'vite', label: 'Vite' },
      ...entries(FRONTEND_FRAMEWORKS.map(([id]) => id)),
      { id: 'tailwindcss', label: 'Tailwind CSS' },
      { id: 'electron', label: 'Electron' },
    ],
    mobile: [
      {
        id: 'flutter',
        label: 'Flutter',
        detectedFrom: 'pubspec.yaml — classified as a client application, not a backend',
      },
      { id: 'react-native', label: 'React Native', detectedFrom: 'the react-native or expo dependency' },
      {
        id: 'ios',
        label: 'iOS (native)',
        detectedFrom: 'Info.plist, Package.swift, a Podfile or an .xcodeproj in the tree',
      },
      {
        id: 'android',
        label: 'Android (native)',
        detectedFrom: 'AndroidManifest.xml, or build.gradle in either dialect',
      },
    ],
    databases: entries(['postgres', 'mysql', 'sqlite', 'sqlserver', 'mongodb', 'redis', 'firestore', 'dynamodb', 'convex']),
    dataPlatforms: [
      { id: 'supabase', label: 'Supabase', detectedFrom: 'recorded alongside the engine it is — Postgres' },
      { id: 'firebase', label: 'Firebase', detectedFrom: 'Firestore' },
      { id: 'planetscale', label: 'PlanetScale', detectedFrom: 'MySQL' },
      { id: 'neon', label: 'Neon', detectedFrom: 'Postgres' },
      { id: 'vercel-postgres', label: 'Vercel Postgres', detectedFrom: 'Postgres' },
      { id: 'turso', label: 'Turso', detectedFrom: 'SQLite' },
      { id: 'upstash', label: 'Upstash', detectedFrom: 'Redis' },
      { id: 'dynamodb', label: 'DynamoDB' },
      { id: 'convex', label: 'Convex' },
    ],
    orms: entries([
      'prisma',
      'drizzle',
      'typeorm',
      'sequelize',
      'knex',
      'mikro-orm',
      'kysely',
      'sqlalchemy',
      'tortoise',
      'peewee',
    ]),
    languages: LANGUAGES.map(({ id, label }) => ({ id, label })),
  };
}
