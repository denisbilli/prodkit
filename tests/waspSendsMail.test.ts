import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

/** open-saas mails through Wasp's `emailSender` and was told it has no way to reach a user. */
describe("Wasp's email sender", () => {
  it('is a way to send mail', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-open-saas-'));
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'opensaas', dependencies: { wasp: 'file:.wasp/out/sdk/wasp' } }));
    await fs.mkdir(path.join(root, 'src/payment/stripe'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'src/payment/stripe/webhook.ts'),
      'import { emailSender } from "wasp/server/email";\n\nexport async function notify(to: string) {\n  await emailSender.send({ to, subject: "Receipt", text: "Thanks", html: "<p>Thanks</p>" });\n}\n',
    );
    const analysis = await analyzeProject(root);
    await fs.rm(root, { recursive: true, force: true });

    expect(analysis.detectors['notifications.transactional']?.details?.emailDependency).toBe(true);
  });
});
