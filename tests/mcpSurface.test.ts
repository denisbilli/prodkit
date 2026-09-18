import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { createProdkitMcpServer } from '../src/mcp/server';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * The MCP server had no tests at all — two hundred lines of a shipped surface that
 * nothing asserted, which is how it came to answer "analyse this project" with an empty
 * list of findings for every repository that has no critical.
 *
 * Calling the registered tools directly rather than over a transport: what is worth
 * asserting is what the tools answer, and a stdio round trip would test the SDK.
 */
type ToolHandler = (args: Record<string, unknown>, extra: never) => Promise<unknown>;

async function callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const server = await createProdkitMcpServer();
  // The SDK keeps registered tools on the server instance; this reaches the callback the
  // way the transport would, without one.
  const registered = (server as unknown as { _registeredTools: Record<string, { handler: ToolHandler }> })._registeredTools;
  const tool = registered[name];
  expect(tool, `tool ${name} is registered`).toBeTruthy();

  const result = await tool.handler(args, {} as never);
  return JSON.parse((result as { content: Array<{ text: string }> }).content[0].text);
}

describe('what an assistant is told about a repository', () => {
  it('returns the findings, not only the critical ones', async () => {
    /**
     * Most repositories have no critical finding. This one has none either, and there is
     * plenty wrong with it.
     */
    const report = await callTool('analyze_project', { path: fixture('django-security-headers'), profile: 'b2c-app' });
    const findings = report.findings as Array<Record<string, unknown>>;

    expect(Array.isArray(findings)).toBe(true);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.status !== 'passed')).toBe(true);
  });

  it('shows the line behind a claim', async () => {
    // A report that cannot point at a line is the thing this product exists not to be.
    const report = await callTool('analyze_project', { path: fixture('express-basic'), profile: 'auto' });
    const findings = report.findings as Array<{ id: string; evidence: Array<{ type: string; file?: string }> }>;
    const weakSecret = findings.find((finding) => finding.id === 'security.weak-secret');

    expect(weakSecret?.evidence.some((item) => item.type === 'snippet' && Boolean(item.file))).toBe(true);
  });

  it('does not hand over an unbounded pile of evidence', async () => {
    // A model reading twenty-five copies of the same import learns nothing the first one
    // did not tell it, and pays for all of them.
    const report = await callTool('analyze_project', { path: fixture('django-basic'), profile: 'b2c-app' });
    const findings = report.findings as Array<{ evidence: unknown[] }>;

    expect(findings.every((finding) => finding.evidence.length <= 3)).toBe(true);
  });

  it('answers a bad path with an error rather than a crash', async () => {
    const server = await createProdkitMcpServer();
    const registered = (server as unknown as { _registeredTools: Record<string, { handler: ToolHandler }> })._registeredTools;

    const result = await registered.analyze_project.handler({ path: '/nope/not/here' }, {} as never);

    expect((result as { isError?: boolean }).isError).toBe(true);
  });

  it('ranks the same repository against every profile', async () => {
    const comparison = await callTool('compare_profiles', { path: fixture('express-basic') });
    const profiles = comparison.profiles as Array<{ profile: string; overallScore: number }>;

    expect(profiles.length).toBeGreaterThan(5);
    // Sorted best first, which is what makes the list readable as an answer.
    expect([...profiles].sort((a, b) => b.overallScore - a.overallScore)).toEqual(profiles);
  });
});

/**
 * The existence check lived in the command-line tool alone.
 */
describe('a path that is not there', () => {
  it('is refused by the analyzer itself, not only by the CLI', async () => {
    const { analyzeProject } = await import('../src/analyzer/analyzeProject');

    await expect(analyzeProject('/nope/not/here')).rejects.toThrow(/does not exist/);
  });

  it('is not reported as an empty repository', async () => {
    // It used to come back as a report: score 39, "no frontend, backend or database
    // stack signals were detected" — a verdict on a repository, for a typo in a path.
    const { analyzeProject } = await import('../src/analyzer/analyzeProject');

    await expect(analyzeProject(fixture('express-basic') + '/package.json')).rejects.toThrow(/not a directory/);
  });
});
