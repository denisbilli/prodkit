# ProdKit

ProdKit is a deterministic local CLI that analyzes an existing web application repository and generates a production-readiness report.

It is designed for early-stage and AI-generated apps where architecture and security quality can vary significantly.

ProdKit MVP is read-only: it never modifies the target repository.

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

## Installation

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

Main command:

```bash
prodkit analyze <path-to-project>
```

Options:

- `--format markdown|json` output format for report payload (when explicitly provided)
- `--summary` print summary only
- `--output <path>` write report to file

## Examples

```bash
prodkit analyze ../my-app
prodkit analyze ../my-app --summary
prodkit analyze ../my-app --format markdown
prodkit analyze ../my-app --format json
prodkit analyze ../my-app --output prodkit-report.md
prodkit analyze tests/fixtures/express-basic --format json --output report.json
```

## Supported stacks in MVP

- Express / Node.js
- React / Vite
- Django
- Generic unknown app fallback

## Acceptance commands

```bash
npm install
npm run build
npm test
npm link
prodkit analyze tests/fixtures/express-basic --format markdown
prodkit analyze tests/fixtures/express-basic --format json
prodkit analyze tests/fixtures/express-basic --output report.md
```

## Current limitations

- Deterministic heuristics only (no AI explanation layer)
- Limited stack coverage (Express, React/Vite, Django + fallback)
- Signal-based detection can produce false positives/negatives
- No patch planning or automated remediation in MVP
- No cloud dashboard/UI in MVP

## Roadmap

1. Deterministic analyzer
2. AI-assisted explanation layer
3. Patch planning
4. Patch generation
5. Framework adapters
6. Dashboard

## Project layout

```text
prodkit/
  package.json
  tsconfig.json
  README.md
  src/
    index.ts
    cli.ts
    analyzer/
    rules/
    report/
    utils/
  tests/
    fixtures/
    analyzer.test.ts
    report.test.ts
```

## License

MIT
