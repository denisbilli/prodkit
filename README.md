# ProdKit

ProdKit is a deterministic local CLI that analyzes an existing web application repository and generates a production-readiness report or a remediation plan.

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

From the report, ProdKit can also build a deterministic remediation plan with phases, task priorities, effort estimates, and test suggestions.

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
- `--profile <name>` evaluate expected product capabilities (`static-site`, `internal-tool`, `b2c-app`, `b2b-saas`, `ai-saas`, `marketplace`, `auto`, `observed-only`)
- `--fail-under <score>` (analyze only) exit with code 1 if the overall score is below the threshold — useful as a CI quality gate
- `--min-maturity <level>` (analyze only) exit with code 1 if maturity is below `prototype|early|partial|production_ready`
- `--ai` (analyze only) add an AI stack/architecture insight — opt-in, advisory only, does not affect the score
- `--ai-review` (analyze only) add an AI semantic review of fine-grained code issues — opt-in, advisory only, does not affect the score

Optional AI layer:

- The AI features are entirely opt-in and off by default: ProdKit stays deterministic, offline, and read-only unless you pass `--ai`/`--ai-review`.
- They require an `ANTHROPIC_API_KEY` and the optional `@anthropic-ai/sdk` package (`npm install @anthropic-ai/sdk`). Without them, the deterministic analysis is unaffected.
- Repository content is redacted of secrets before anything is sent, and AI output is advisory only — it never changes the deterministic score.

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

## Supported stacks in MVP

- Backend: Express, NestJS, Fastify, Next.js (Node); Django, FastAPI, Flask (Python)
- Frontend: React, Vue, Svelte, Angular, Nuxt, Vite
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
prodkit plan tests/fixtures/express-basic
prodkit plan tests/fixtures/express-basic --format json
prodkit plan tests/fixtures/express-basic --output prodkit-plan.md
```

## Current limitations

- Deterministic heuristics only, with no AI explanation layer yet
- Signal-based stack coverage across common Node/Python/JS frameworks + fallback
- Signal-based detection can produce false positives/negatives
- Plan output is deterministic and read-only only
- No cloud dashboard/UI in MVP

## Roadmap

1. Deterministic analyzer
2. Deterministic remediation planning
3. AI explanation layer
4. Apply/generate PRs
5. Cloud GitHub integration
6. Framework adapters
7. Dashboard

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
    planner/
    rules/
    report/
    utils/
  tests/
    fixtures/
    analyzer.test.ts
    report.test.ts
    planner.test.ts
```

## MCP server

ProdKit ships an MCP server so an agent can assess a repository without leaving the
editor. It exposes the deterministic analysis only, makes no network calls, and the
code being analysed never leaves the machine.

Tools: `analyze_project`, `plan_remediation`, `compare_profiles`, `list_profiles`.

Claude Code:

```bash
claude mcp add prodkit -- npx -y prodkit-mcp
```

Or, in a client that reads a JSON config:

```json
{
  "mcpServers": {
    "prodkit": {
      "command": "npx",
      "args": ["-y", "prodkit-mcp"]
    }
  }
}
```

`compare_profiles` is the one to reach for first: it scores the same repository
against every product profile in a single call, which is the question ProdKit exists
to answer.

## License


MIT