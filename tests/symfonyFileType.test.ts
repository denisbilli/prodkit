import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function uploads(form: string, entity?: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-koillection-'));
  await fs.writeFile(path.join(root, 'composer.json'), '{"require":{"symfony/framework-bundle":"^7.1","symfony/form":"^7.1"}}\n');
  await fs.mkdir(path.join(root, 'src/Form/Type/Entity'), { recursive: true });
  await fs.writeFile(path.join(root, 'src/Form/Type/Entity/TagType.php'), form);
  if (entity) {
    await fs.mkdir(path.join(root, 'src/Entity'), { recursive: true });
    await fs.writeFile(path.join(root, 'src/Entity/Tag.php'), entity);
  }
  const detector = (await analyzeProject(root)).detectors['uploads.exposure'];
  const found = entity ? detector?.details?.validation : detector?.present;
  await fs.rm(root, { recursive: true, force: true });
  return found;
}

/** Koillection takes every image through Symfony's FileType and read as taking none. */
describe("Symfony's FileType", () => {
  it('is an upload', async () => {
    expect(await uploads("<?php\n\nnamespace App\\Form\\Type\\Entity;\n\nuse Symfony\\Component\\Form\\AbstractType;\nuse Symfony\\Component\\Form\\Extension\\Core\\Type\\FileType;\n\nclass TagType extends AbstractType\n{\n    public function buildForm($builder, array $options): void\n    {\n        $builder->add('file', FileType::class, ['required' => false]);\n    }\n}\n")).toBe(true);
  });

  it('is not a form of text fields', async () => {
    expect(await uploads("<?php\n\nnamespace App\\Form\\Type\\Entity;\n\nuse Symfony\\Component\\Form\\AbstractType;\nuse Symfony\\Component\\Form\\Extension\\Core\\Type\\TextType;\n\nclass TagType extends AbstractType\n{\n    public function buildForm($builder, array $options): void\n    {\n        $builder->add('label', TextType::class);\n    }\n}\n")).toBe(false);
  });

  const form = "<?php\n\nuse Symfony\\Component\\Form\\Extension\\Core\\Type\\FileType;\n\nclass TagType\n{\n    public function buildForm($builder, array $options): void\n    {\n        $builder->add('file', FileType::class);\n    }\n}\n";

  it('is validated by an Image constraint', async () => {
    expect(await uploads(form, "<?php\n\nuse Symfony\\Component\\Validator\\Constraints as Assert;\n\nclass Tag\n{\n    #[Assert\\Image(mimeTypes: ['image/png', 'image/jpeg'])]\n    private ?File $file = null;\n}\n")).toBe(true);
  });

  it('is validated by a File constraint', async () => {
    expect(await uploads(form, "<?php\n\nuse Symfony\\Component\\Validator\\Constraints as Assert;\n\nclass Tag\n{\n    #[Assert\\File(maxSize: '5M')]\n    private ?File $file = null;\n}\n")).toBe(true);
  });

  it('is not validated by a constraint on text', async () => {
    expect(await uploads(form, "<?php\n\nuse Symfony\\Component\\Validator\\Constraints as Assert;\n\nclass Tag\n{\n    #[Assert\\NotBlank]\n    private ?string $label = null;\n}\n")).toBe(false);
  });
});
