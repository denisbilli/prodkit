import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeProject } from '../analyzer/analyzeProject';
import { buildReport } from '../report/buildReport';
import { buildPlan } from '../planner/buildPlan';
import { productProfiles } from '../expectations/productProfiles';
import type { ProductProfile } from '../expectations/types';
import { PRODKit_VERSION } from '../version';

/**
 * ProdKit as an MCP server.
 *
 * This exposes the deterministic analysis only. The AI layer is not reachable from
 * here by design: the deterministic core is free and runs locally, and the AI review
 * is the paid, hosted part of the product.
 *
 * Nothing in this server makes a network call. That is the point — the code being
 * analysed never leaves the machine, which is the privacy position the product
 * promises and the reason this surface can be pointed at a private repository.
 */

const PROFILE_IDS = Object.keys(productProfiles) as Array<Exclude<ProductProfile, 'auto' | 'observed-only'>>;
const PROFILE_ARG = z
  .enum(['observed-only', 'auto', ...PROFILE_IDS] as [string, ...string[]])
  .describe('Product profile to evaluate against. "observed-only" scores the code alone.');

const PATH_ARG = z.string().min(1).describe('Absolute path to the repository to analyse.');

function textResult(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: 'text' as const, text: `ProdKit could not analyse that path: ${message}` }],
  };
}

/**
 * The MCP SDK, loaded when the server starts rather than when this package is imported.
 *
 * It was a plain dependency, and it brought 164 of this package's 183 installed
 * packages with it — so everyone installing the analyzer as a library or a CLI paid
 * for a server they may never run, and inherited its supply-chain surface: network,
 * shell and eval, none of which the analyzer itself does.
 *
 * The same shape the AI layer uses for the Anthropic SDK: a variable specifier so the
 * TypeScript build does not need it, a webpackIgnore hint so a bundler does not try to
 * resolve it, and an error that says exactly what to install when it is absent.
 */
const SDK_MCP = '@modelcontextprotocol/sdk/server/mcp.js';
const SDK_STDIO = '@modelcontextprotocol/sdk/server/stdio.js';

async function loadMcpSdk(): Promise<{
  McpServer: new (info: { name: string; version: string }) => McpServer;
  StdioServerTransport: new () => object;
}> {
  try {
    const [mcp, stdio] = await Promise.all([
      import(/* webpackIgnore: true */ SDK_MCP),
      import(/* webpackIgnore: true */ SDK_STDIO),
    ]);

    return { McpServer: mcp.McpServer, StdioServerTransport: stdio.StdioServerTransport };
  } catch {
    throw new Error(
      'The MCP server needs the optional @modelcontextprotocol/sdk package. '
        + 'Install it alongside this one: npm install @modelcontextprotocol/sdk',
    );
  }
}

export async function createProdkitMcpServer(): Promise<McpServer> {
  const { McpServer: Server } = await loadMcpSdk();
  const server = new Server({ name: 'prodkit', version: PRODKit_VERSION });

  server.registerTool(
    'list_profiles',
    {
      title: 'List product profiles',
      description:
        'Lists the product profiles ProdKit can evaluate a repository against, with the capabilities each one expects.',
      inputSchema: {},
    },
    async () =>
      textResult(
        Object.values(productProfiles).map((profile) => ({
          id: profile.id,
          title: profile.title,
          description: profile.description,
          expects: profile.capabilities
            .filter((capability) => capability.importance !== 'not_applicable')
            .map((capability) => ({ id: capability.id, importance: capability.importance })),
        })),
      ),
  );

  server.registerTool(
    'analyze_project',
    {
      title: 'Analyze production readiness',
      description:
        'Analyses a repository and returns its production-readiness report: score, maturity, executive summary, ' +
        'per-area readiness, findings with their business impact, and compliance exposure.',
      inputSchema: { path: PATH_ARG, profile: PROFILE_ARG.optional() },
    },
    async ({ path, profile }) => {
      try {
        const analysis = await analyzeProject(path);
        const report = buildReport(analysis, profile ? { profile: profile as ProductProfile } : undefined);

        return textResult({
          overallScore: report.overallScore,
          observedScore: report.observedScore,
          expectedCapabilityScore: report.expectedCapabilityScore,
          maturityLevel: report.maturityLevel,
          inconclusive: report.inconclusive,
          inconclusiveReasons: report.inconclusiveReasons,
          executiveSummary: report.executiveSummary,
          categoryScores: report.categoryScores,
          compliance: report.compliance,
          detectedStack: report.detectedStack,
          /**
           * Every finding, not only the critical ones.
           *
           * This returned `criticalIssues` alone, and most repositories have none — so an
           * assistant asking for a report was handed a score, a summary and an empty
           * list, while the category table beside it showed six areas with work
           * outstanding. The findings are what the report is; the rest describes them.
           */
          findings: report.findings
            .filter((finding) => finding.status !== 'passed' && finding.status !== 'unknown')
            .map((finding) => ({
              id: finding.id,
              title: finding.title,
              category: finding.category,
              severity: finding.severity,
              status: finding.status,
              confidence: finding.confidence,
              description: finding.description,
              businessImpact: finding.businessImpact,
              recommendation: finding.recommendation,
              /**
               * The lines behind the claim, which is the thing this product is for.
               *
               * Nothing on this surface could show one: an assistant could say "your
               * secrets have a fallback" and not where. Trimmed to three, because a
               * model reading twenty-five copies of the same import learns nothing the
               * first one did not tell it.
               */
              evidence: finding.evidence.slice(0, 3).map((item) => ({
                type: item.type,
                value: item.value,
                ...(item.file ? { file: item.file } : {}),
                ...(item.line ? { line: item.line } : {}),
              })),
            })),
          gap: report.productProfile?.gap,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'plan_remediation',
    {
      title: 'Plan remediation',
      description:
        'Returns an ordered remediation plan for a repository. Tasks are ranked by urgency and sorted so that no task ' +
        'appears before a task it depends on, so the list can be worked top to bottom.',
      inputSchema: { path: PATH_ARG, profile: PROFILE_ARG.optional() },
    },
    async ({ path, profile }) => {
      try {
        const analysis = await analyzeProject(path);
        const report = buildReport(analysis, profile ? { profile: profile as ProductProfile } : undefined);
        const plan = buildPlan(report);

        return textResult({
          summary: plan.summary,
          score: plan.score,
          maturityLevel: plan.maturityLevel,
          tasks: plan.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            priority: task.priority,
            effort: task.effort,
            risk: task.risk,
            why: task.why,
            dependencies: task.dependencies,
            acceptanceCriteria: task.acceptanceCriteria,
          })),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    'compare_profiles',
    {
      title: 'Compare product profiles',
      description:
        'Scores the same repository against every product profile in one call. This is the question ProdKit exists to ' +
        'answer: a repository can look healthy as a static site and be far from ready as a B2B SaaS, because the two ' +
        'expect different capabilities.',
      inputSchema: { path: PATH_ARG },
    },
    async ({ path }) => {
      try {
        const analysis = await analyzeProject(path);
        const observed = buildReport(analysis);

        const comparison = PROFILE_IDS.map((profile) => {
          const report = buildReport(analysis, { profile });
          return {
            profile,
            title: productProfiles[profile].title,
            overallScore: report.overallScore,
            expectedCapabilityScore: report.expectedCapabilityScore,
            launchReady: report.executiveSummary.launchReady,
            requiredMissing: report.productProfile?.gap.requiredMissing ?? 0,
            requiredTotal: report.productProfile?.gap.requiredTotal ?? 0,
            verdict: report.executiveSummary.verdict,
          };
        }).sort((left, right) => right.overallScore - left.overallScore);

        return textResult({
          observedOnlyScore: observed.observedScore,
          detectedStack: observed.detectedStack,
          profiles: comparison,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return server;
}

export async function startProdkitMcpServer(): Promise<void> {
  const { StdioServerTransport } = await loadMcpSdk();
  const server = await createProdkitMcpServer();

  await server.connect(new StdioServerTransport() as never);
}
