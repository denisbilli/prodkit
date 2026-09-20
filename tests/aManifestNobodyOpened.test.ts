import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';
import { buildReport } from '../src/report/buildReport';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures', name);

/**
 * A Spring Boot REST API with Spring Security and PostgreSQL reported no backend, no
 * database, and no score at all.
 *
 * The manifest was recognised well enough to name the package manager "maven" and then
 * never opened — the same shape of gap Rust had one release ago, in the larger
 * ecosystem. Nothing read pom.xml for its coordinates, and no JVM server framework was
 * named anywhere in the analyzer, so a Java backend could only ever come back empty.
 */
describe('a manifest that is recognised is a manifest that gets read', () => {
  it('names the framework a Maven project is built on', async () => {
    const analysis = await analyzeProject(fixture('maven-spring-api'));

    expect(analysis.stack.backend).toContain('spring-boot');
  });

  it('reads the database out of the same manifest', async () => {
    const analysis = await analyzeProject(fixture('maven-spring-api'));

    expect(analysis.stack.databases).toContain('postgres');
  });

  it('can characterise the project at all now', async () => {
    // Before this it was inconclusive with no score: nothing had been learned about a
    // repository whose every dependency was written down in a file we had opened.
    const report = buildReport(await analyzeProject(fixture('maven-spring-api')), { profile: 'auto' });

    expect(report.inconclusive).toBe(false);
    expect(typeof report.overallScore).toBe('number');
  });

  it('reads the parent, which is where Spring Boot declares itself', async () => {
    // `spring-boot-starter-parent` is the single line that makes a Maven project a
    // Spring Boot project; the starters below it inherit their version from it and
    // state none of their own.
    const analysis = await analyzeProject(fixture('maven-spring-api'));
    const evidence = analysis.detectors['stack.backend']?.evidence ?? [];

    expect(evidence.some((item) => String(item.value).includes('spring-boot-starter'))).toBe(true);
  });
})
