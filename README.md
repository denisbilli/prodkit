# ProdKit

ProdKit is a deterministic local CLI that analyzes an existing web application repository and generates a production-readiness report or a remediation plan.

It is designed for early-stage and AI-generated apps where architecture and security quality can vary significantly.

ProdKit is read-only: it never modifies the target repository.

## What ProdKit does

ProdKit inspects a target project and detects:

- Frontend framework signals
- Backend framework signals
- Database technologies
- Package manager
- Docker and Docker Compose presence
- Environment file and env-usage hygiene
- Authentication and authorization signals
- Tenant/organization signals
- GDPR/privacy signals
- Security hardening signals
- Upload exposure signals
- Billing/Stripe signals
- Observability/logging signals
- Background jobs/queue signals
- Deployment readiness signals

Then it builds a structured production-readiness report with:

- Overall score (0-100)
- Maturity level (`prototype`, `early`, `partial`, `production_ready`)
- Findings grouped by category
- Critical issues and warnings
- Passed checks
- Suggested next steps
- Technical evidence for each finding

From the report, ProdKit can also build a deterministic remediation plan with phases, task priorities, effort estimates, and test suggestions.

## Installation

```bash
npm install -g @produtype/core
prodkit analyze .
```

The MCP server needs one extra package, and only if you use it:

```bash
npm install @modelcontextprotocol/sdk   # for prodkit-mcp
```

It is an optional peer dependency rather than a dependency because it brings 164
packages with it — nine tenths of what this package used to install — for a server most
people never run, along with network, shell and eval access that the analyzer itself
does not use. Installing this package alone brings 19.

The command is `prodkit`; the package is `@produtype/core`. They differ on purpose:
`prodkit` on npm is an unrelated and actively maintained package, so this one is
published under the `@produtype` scope. `npm i prodkit` installs somebody else's
project.

### Local development install

1. Install dependencies:

```bash
npm install
```

2. Build CLI:

```bash
npm run build
```

3. Link globally for local usage:

```bash
npm link
```

After linking, use:

```bash
prodkit --help
```

## Local development

```bash
npm install
npm run build
npm test
```

Optional lint:

```bash
npm run lint
```

## Commands

Diagnostic command:

```bash
prodkit analyze <path-to-project>
```

Remediation planning command:

```bash
prodkit plan <path-to-project>
```

Options:

- `--format markdown|json` output format for the report or plan payload
- `--summary` print summary only
- `--output <path>` write output to file
- `--profile <name>` evaluate expected product capabilities (`static-site`, `internal-tool`, `b2c-app`, `b2b-saas`, `ai-saas`, `marketplace`, `game`, `client-app`, `mobile-app`, `auto`, `observed-only`)
- `--fail-under <score>` (analyze only) exit with code 1 if the overall score is below the threshold — useful as a CI quality gate
- `--min-maturity <level>` (analyze only) exit with code 1 if maturity is below `prototype|early|partial|production_ready`
- `--ai` (analyze only) add an AI stack/architecture insight — opt-in, advisory only, does not affect the score
- `--ai-review` (analyze only) add an AI semantic review of fine-grained code issues — opt-in, advisory only, does not affect the score

Optional AI layer:

- **A separate package.** The AI features live in `@produtype/ai`, which is commercial
  and is not a dependency of this package. An open source install runs the
  deterministic analysis only, and `--ai` reports that the package is not installed
  rather than failing. That package brings its own model access; nothing needs to be
  configured here to run the analysis.
- ProdKit stays deterministic, offline, and read-only: nothing here makes a network
  call.
- When `@produtype/ai` is installed, it redacts secrets from repository content before
  sending anything, and its output stays advisory — it never changes the deterministic
  score.

Profile warning:

- Without a product profile, ProdKit only scores observed deterministic findings. Use `--profile` to evaluate expected product capabilities.

Inconclusive assessments:

- If no stack signals and no package manifests are detected, the report is marked **inconclusive** and the score is capped at 39 (`prototype`). An unrecognized project is never scored as production ready.

## Examples

```bash
prodkit analyze ../my-app
prodkit analyze ../my-app --profile b2b-saas
prodkit analyze ../my-app --profile auto
prodkit analyze ../my-app --summary
prodkit analyze ../my-app --format markdown
prodkit analyze ../my-app --format json
prodkit analyze ../my-app --output prodkit-report.md
prodkit analyze tests/fixtures/express-basic --format json --output report.json
prodkit analyze ../my-app --fail-under 65
prodkit analyze ../my-app --min-maturity partial
prodkit plan ../my-app
prodkit plan ../my-app --profile b2b-saas
prodkit plan ../my-app --profile observed-only
prodkit plan ../my-app --format markdown
prodkit plan ../my-app --format json
prodkit plan ../my-app --output prodkit-plan.md
```

## Supported stacks

<!-- stacks:start -->

_Generated from the analyzer itself — run `npm run docs:stacks` after changing a detector._

- **Backend:** Express, Next.js, NestJS, Fastify, Hono, Elysia, Koa, AdonisJS, SvelteKit, Remix, Nuxt, Nitro, Astro, Django, Flask, FastAPI, Litestar, Sanic, Tornado, aiohttp, Starlette, Streamlit, Gradio, Dash, Chainlit, Gin, Echo, Fiber, chi, Gorilla, Beego, Go, Rails, Sinatra, Hanami, Roda, Grape, Ruby, Laravel, Symfony, Slim, CodeIgniter, CakePHP, Yii, PHP, ASP.NET Core, .NET
- **Frontend:** React, Vite, Vue, Nuxt, Svelte, Angular, Astro, Solid, Qwik, Preact, Remix, htmx, Tailwind CSS, Electron
- **Mobile:** Flutter, React Native, iOS (native), Android (native)
- **Databases:** Postgres, MySQL, SQLite, SQL Server, MongoDB, Redis, Firestore, DynamoDB, Convex
- **Hosted data platforms:** Supabase, Firebase, PlanetScale, Neon, Vercel Postgres, Turso, Upstash, DynamoDB, Convex
- **ORMs:** Prisma, Drizzle, TypeORM, Sequelize, Knex, MikroORM, Kysely, SQLAlchemy, Tortoise, Peewee

How some of these are decided:

- **Express** — the dependency, or an import in the source
- **Astro** — counted as a backend only when configured to serve requests
- **Django** — manage.py, settings.py and urls.py together
- **Flask** — the dependency, or an import in the source
- **FastAPI** — the dependency, or an import in the source
- **Go** — a go.mod with no framework in it — net/http is a real answer
- **Ruby** — a Gemfile with no web framework in it
- **PHP** — PHP sources with no framework in composer.json
- **ASP.NET Core** — the Microsoft.NET.Sdk.Web SDK attribute
- **.NET** — a .csproj with no web SDK
- **Flutter** — pubspec.yaml — classified as a client application, not a backend
- **React Native** — the react-native or expo dependency
- **iOS (native)** — Info.plist, Package.swift, a Podfile or an .xcodeproj in the tree
- **Android (native)** — AndroidManifest.xml, or build.gradle in either dialect
- **Supabase** — recorded alongside the engine it is — Postgres
- **Firebase** — Firestore
- **PlanetScale** — MySQL
- **Neon** — Postgres
- **Vercel Postgres** — Postgres
- **Turso** — SQLite
- **Upstash** — Redis

<!-- stacks:end -->

A hosted platform is recorded separately from the engine underneath it, so rules
written about an engine keep working without knowing about the host, while "this data
lives on infrastructure someone else operates" stays a question the report can ask on
its own.

## Current limitations

- Deterministic heuristics only: the AI layer is a separate package (see above)
- Signal-based stack coverage across common Node/Python/JS frameworks + fallback
- Signal-based detection can produce false positives/negatives
- Plan output is deterministic and read-only only
- No cloud dashboard or UI: this package is the CLI and the library

## Verifying what you installed

Every release from 0.3.3 onwards is published with npm provenance: an attestation,
signed during the release workflow, that ties the tarball to the commit and the build
that produced it.

```bash
npm view @produtype/core --json | grep -A5 provenance
```

Releases 0.3.0 to 0.3.2 have no attestation. They were published while this repository
was private, and provenance is only meaningful when anyone can read the commit it
points at.

## Roadmap

Shipped: the deterministic analyzer, deterministic remediation planning, and the
optional AI layer as `@produtype/ai`.

Next: applying fixes as generated pull requests, and a hosted GitHub integration.
