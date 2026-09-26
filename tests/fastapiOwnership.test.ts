import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeProject } from '../src/analyzer/analyzeProject';

async function ownershipIn(routes: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prodkit-fastapi-'));
  const files: Record<string, string> = {
    'backend/pyproject.toml': '[project]\nname = "app"\ndependencies = ["fastapi[standard]>=0.114", "sqlmodel>=0.0.21"]\n',
    'backend/app/api/deps.py': 'from typing import Annotated\n\nfrom fastapi import Depends\n\nCurrentUser = Annotated[User, Depends(get_current_user)]\n',
    'backend/app/api/routes/items.py': routes,
  };
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(root, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content);
  }
  const analysis = await analyzeProject(root);
  await fs.rm(root, { recursive: true, force: true });
  return analysis.detectors['authz.resourceLevel']?.present;
}

const route = (signature: string, check: string) =>
  `from fastapi import APIRouter, Depends, HTTPException\n\nrouter = APIRouter()\n\n@router.get("/{id}")\ndef read_item(${signature}, id: int):\n    item = session.get(Item, id)\n    ${check}\n    return item\n`;

/**
 * FastAPI's template matches every item to its caller with `item.owner_id !=
 * current_user.id` and was told it has no ownership check.
 */
describe('a row matched to what FastAPI injected', () => {
  it('reads the caller from an Annotated alias', async () => {
    expect(await ownershipIn(route('current_user: CurrentUser', 'if item.owner_id != current_user.id:\n        raise HTTPException(status_code=403)'))).toBe(true);
  });

  it('reads the caller from Depends on the parameter', async () => {
    expect(await ownershipIn(route('me: User = Depends(get_current_user)', 'if item.owner_id != me.id:\n        raise HTTPException(status_code=403)'))).toBe(true);
  });

  it('reads the comparison either way round', async () => {
    expect(await ownershipIn(route('current_user: CurrentUser', 'if current_user.id != item.owner_id:\n        raise HTTPException(status_code=403)'))).toBe(true);
  });

  it('is not a parameter FastAPI does not fill', async () => {
    expect(await ownershipIn(route('current_user: User', 'if item.owner_id != current_user.id:\n        raise HTTPException(status_code=403)'))).toBe(false);
  });
});
