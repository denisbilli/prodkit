import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function mailFrom(requirements: string, code: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-babybuddy-'));
  await fs.writeFile(path.join(root, 'requirements.txt'), requirements);
  await fs.mkdir(path.join(root, 'core'), { recursive: true });
  await fs.writeFile(path.join(root, 'core/storage.py'), code);
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis.detectors['notifications.transactional']?.details?.emailDependency;
}

const S3 = 'import boto3\n\ns3 = boto3.client("s3")\n';

/** babybuddy keeps pictures in S3 through boto3 and was credited with a way to send mail. */
describe('boto3 as a way to send mail', () => {
  it('is not, when it only stores files', async () => {
    expect(await mailFrom('django==5.0\nboto3==1.34\n', S3)).toBe(false);
  });

  it('is, when an SES client is opened', async () => {
    expect(await mailFrom('django==5.0\nboto3==1.34\n', 'import boto3\n\nses = boto3.client("sesv2")\n')).toBe(true);
  });

  it('is only boto3 declared as a dependency', async () => {
    expect(await mailFrom('django==5.0\n', 'ses = session.client("ses")\n')).toBe(false);
  });

  it('is django-ses, the backend Django sends through', async () => {
    expect(await mailFrom('django==5.0\ndjango-ses==3.5\n', S3)).toBe(true);
  });

  /** saleor's email plugins send through Django's own mail module. */
  it('is Django\'s own mail module', async () => {
    expect(await mailFrom('django==5.0\n', 'from django.core.mail import EmailMultiAlternatives, get_connection\n')).toBe(true);
  });
});
