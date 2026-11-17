import { DEMO_WORKFLOW_RFQ_HREF } from '../src/app/(app)/dashboard/page.constants';

describe('dashboard demo workflow links', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Reflect.set(process.env, 'NODE_ENV', originalNodeEnv);
    jest.resetModules();
  });

  async function loadShowDemoLinksFor(nodeEnv: string): Promise<boolean> {
    Reflect.set(process.env, 'NODE_ENV', nodeEnv);
    jest.resetModules();
    const constants = await import('../src/app/(app)/dashboard/page.constants');
    return constants.SHOW_DEMO_WORKFLOW_LINKS;
  }

  it('points the demo links at the RFQ fixture route', () => {
    expect(DEMO_WORKFLOW_RFQ_HREF).toBe('/procurement/rfqs/RFQ-DEMO-001?demo=true');
  });

  it('shows the demo links in development and test builds', async () => {
    await expect(loadShowDemoLinksFor('development')).resolves.toBe(true);
    await expect(loadShowDemoLinksFor('test')).resolves.toBe(true);
  });

  it('hides the demo links in production builds, where the fixture is not served', async () => {
    await expect(loadShowDemoLinksFor('production')).resolves.toBe(false);
  });
});
