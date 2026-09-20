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

/**
 * Rust frameworks, read from Cargo.toml.
 *
 * windmill serves its requests from 547 Rust files and was reported as a Go backend,
 * because a client SDK in the same repository carries a go.mod and Rust was not read
 * at all.
 */
export const RUST_BACKEND_FRAMEWORKS: Array<[string, string[]]> = [
  ['axum', ['axum']],
  ['actix-web', ['actix-web']],
  ['rocket', ['rocket']],
  ['warp', ['warp']],
  ['tide', ['tide']],
  ['poem', ['poem']],
  ['salvo', ['salvo']],
  ['tower-http', ['tower-http']],
  // What a Rust service uses when it uses no framework: the HTTP layer itself.
  ['hyper', ['hyper']],
];

/**
 * JVM frameworks, read from pom.xml and build.gradle alike.
 *
 * A Spring Boot REST API with Spring Security and PostgreSQL reported no backend at
 * all: the coordinates were never read, and no JVM server framework was ever named.
 * Coordinates are `group:artifact` in both build systems, so one table serves both.
 *
 * `spring-boot-starter-parent` earns its place beside the starters: it is how a Maven
 * project declares itself a Spring Boot project, and the starters under it inherit
 * their version from it rather than stating one.
 */
export const JVM_BACKEND_FRAMEWORKS: Array<[string, string[]]> = [
  ['spring-boot', [
    'org.springframework.boot:spring-boot-starter-web',
    'org.springframework.boot:spring-boot-starter-webflux',
    'org.springframework.boot:spring-boot-starter-parent',
    'org.springframework.boot:spring-boot-starter',
  ]],
  ['quarkus', ['io.quarkus:quarkus-resteasy', 'io.quarkus:quarkus-resteasy-reactive', 'io.quarkus:quarkus-bom']],
  ['micronaut', ['io.micronaut:micronaut-http-server-netty', 'io.micronaut:micronaut-inject']],
  ['ktor', ['io.ktor:ktor-server-core', 'io.ktor:ktor-server-netty', 'io.ktor:ktor-server-cio']],
  ['javalin', ['io.javalin:javalin']],
  ['vertx', ['io.vertx:vertx-web', 'io.vertx:vertx-core']],
  ['dropwizard', ['io.dropwizard:dropwizard-core']],
  ['helidon', ['io.helidon.webserver:helidon-webserver']],
];

/**
 * Databases a JVM project declares by driver.
 *
 * The same manifest that names the framework names the database, and a Spring Boot
 * project with `org.postgresql:postgresql` was reported as having no data layer.
 */
export const JVM_DATABASES: Array<[string, string[]]> = [
  ['postgres', ['org.postgresql:postgresql', 'io.r2dbc:r2dbc-postgresql']],
  ['mysql', ['mysql:mysql-connector-java', 'com.mysql:mysql-connector-j']],
  ['mariadb', ['org.mariadb.jdbc:mariadb-java-client']],
  ['sqlite', ['org.xerial:sqlite-jdbc']],
  ['mongodb', ['org.mongodb:mongodb-driver-sync', 'org.mongodb:mongo-java-driver']],
  ['redis', ['redis.clients:jedis', 'io.lettuce:lettuce-core']],
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
  'spring-boot': 'Spring Boot',
  quarkus: 'Quarkus',
  micronaut: 'Micronaut',
  ktor: 'Ktor',
  javalin: 'Javalin',
  vertx: 'Vert.x',
  dropwizard: 'Dropwizard',
  helidon: 'Helidon',
  axum: 'Axum',
  'actix-web': 'Actix Web',
  rocket: 'Rocket',
  warp: 'Warp',
  tide: 'Tide',
  poem: 'Poem',
  salvo: 'Salvo',
  'tower-http': 'Tower HTTP',
  hyper: 'Hyper',
  rust: 'Rust',
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
  swiftui: 'SwiftUI',
  uikit: 'UIKit',
  'jetpack compose': 'Jetpack Compose',
  'android views': 'Android views',
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
      {
        id: 'aiohttp',
        label: 'aiohttp',
        /**
         * Listed separately because the dependency alone does not settle it: aiohttp is
         * a client as often as a server, and thousands of packages depend on it to make
         * requests. `aiohttp.web` is what says it is being served.
         */
        detectedFrom: 'aiohttp.web in the source — the dependency alone is a client',
      },
      ...entries(PYTHON_BACKEND_FRAMEWORKS.map(([id]) => id)),
      ...entries(GO_BACKEND_FRAMEWORKS.map(([id]) => id)),
      { id: 'go', label: 'Go', detectedFrom: 'a go.mod with no framework in it — net/http is a real answer' },
      ...entries(RUST_BACKEND_FRAMEWORKS.map(([id]) => id)),
      ...entries(JVM_BACKEND_FRAMEWORKS.map(([id]) => id)),
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
      { id: 'swiftui', label: 'SwiftUI', detectedFrom: 'import SwiftUI' },
      { id: 'uikit', label: 'UIKit', detectedFrom: 'import UIKit' },
      { id: 'jetpack compose', label: 'Jetpack Compose', detectedFrom: 'import androidx.compose' },
      { id: 'android views', label: 'Android views', detectedFrom: 'import androidx.appcompat, or android.app.Activity' },
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
