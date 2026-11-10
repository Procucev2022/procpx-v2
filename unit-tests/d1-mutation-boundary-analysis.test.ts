import path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Load the script-only CommonJS analyzer in Jest.
const { analyzeD1MutationBoundaries } = require('../scripts/d1-mutation-boundary-analysis.cjs') as {
  analyzeD1MutationBoundaries: (
    sourceFiles: Array<{ filePath: string; text: string }>,
    root: string,
  ) => { handlers: Map<string, { mutations: Array<{ display: string }>; nestedMutations: string[] }> };
};

function fixture(root: string, relativePath: string, text: string) {
  return { filePath: path.join(root, relativePath), text };
}

describe('D1 mutation boundary call-graph analysis', () => {
  it('follows aliased imports and local helper chains from a route handler', () => {
    const root = path.resolve('mutation-analysis-fixture');
    const route = fixture(root, 'src/app/api/records/route.ts', `
      import { prisma as db } from '@/lib/prisma';
      import { updateAudit } from '@/lib/audit';
      export async function POST() {
        await db.user.update({ where: { id: 'user-1' }, data: { name: 'Updated' } });
        await updateAudit();
      }
    `);
    const audit = fixture(root, 'src/lib/audit.ts', `
      import { persistAudit } from './persist-audit';
      export async function updateAudit() { await persistAudit(); }
    `);
    const persistAudit = fixture(root, 'src/lib/persist-audit.ts', `
      import { prisma } from './prisma';
      export async function persistAudit() {
        await prisma.auditLog.create({ data: { action: 'UPDATED' } });
      }
    `);
    const prisma = fixture(root, 'src/lib/prisma.ts', 'export const prisma = {};');

    const result = analyzeD1MutationBoundaries([route, audit, persistAudit, prisma], root);
    const handler = result.handlers.get(`${path.resolve(route.filePath)}#POST`);

    expect(handler?.mutations.map(({ display }) => display.replaceAll('\\', '/'))).toEqual([
      'src/app/api/records/route.ts:5 user.update',
      'src/lib/persist-audit.ts:4 auditLog.create',
    ]);
  });

  it('follows route-local helpers and detects nested Prisma writes', () => {
    const root = path.resolve('mutation-local-fixture');
    const route = fixture(root, 'src/app/api/records/route.ts', `
      export async function POST() {
        const saveAudit = async () => prisma.auditLog.create({ data: { actions: { create: { action: 'UPDATED' } } } });
        await prisma.user.update({ where: { id: 'user-1' }, data: { name: 'Updated' } });
        await saveAudit();
      }
    `);

    const result = analyzeD1MutationBoundaries([route], root);
    const handler = result.handlers.get(`${path.resolve(route.filePath)}#POST`);

    expect(handler?.mutations).toHaveLength(2);
    expect(handler?.nestedMutations.map((mutation) => mutation.replaceAll('\\', '/'))).toEqual([
      'src/app/api/records/route.ts:3 create',
    ]);
  });

  it('does not treat reads or a single raw D1 batch call as multiple Prisma mutations', () => {
    const root = path.resolve('mutation-batch-fixture');
    const route = fixture(root, 'src/app/api/records/route.ts', `
      import { prisma } from '@/lib/prisma';
      import { writeD1BatchAtomically } from '@/lib/d1-batch';
      export async function POST() {
        await prisma.user.findMany({ where: { status: 'ACTIVE' } });
        await writeD1BatchAtomically([{ sql: 'UPDATE users SET name = ?', values: ['Updated'] }]);
      }
    `);

    const result = analyzeD1MutationBoundaries([route], root);
    const handler = result.handlers.get(`${path.resolve(route.filePath)}#POST`);

    expect(handler?.mutations).toEqual([]);
    expect(handler?.nestedMutations).toEqual([]);
  });
});
