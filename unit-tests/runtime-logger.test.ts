import { writeRuntimeStructuredLog } from '../src/lib/observability/runtime-logger';
import { isCloudflareWorker } from '../src/lib/runtime';
import { writeStructuredLog as writeServerLog } from '../src/lib/observability/server-logger';
import { writeStructuredLog as writeEdgeLog } from '../src/lib/observability/edge-logger';

jest.mock('../src/lib/runtime', () => ({ isCloudflareWorker: jest.fn() }));
jest.mock('../src/lib/observability/server-logger', () => ({ writeStructuredLog: jest.fn().mockResolvedValue({ source: 'server' }) }));
jest.mock('../src/lib/observability/edge-logger', () => ({ writeStructuredLog: jest.fn().mockResolvedValue({ source: 'edge' }) }));

const workerRuntime = isCloudflareWorker as jest.Mock;
const serverLog = writeServerLog as jest.Mock;
const edgeLog = writeEdgeLog as jest.Mock;

describe('runtime structured logger routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses filesystem-capable server logging outside Cloudflare Workers', async () => {
    workerRuntime.mockReturnValue(false);
    await writeRuntimeStructuredLog('error', 'database.read_failed', { tenantId: 'tenant-1' }, 'application');
    expect(serverLog).toHaveBeenCalledWith('error', 'database.read_failed', { tenantId: 'tenant-1' }, 'application', undefined);
    expect(edgeLog).not.toHaveBeenCalled();
  });

  it('uses the filesystem-free edge logger inside Cloudflare Workers', async () => {
    workerRuntime.mockReturnValue(true);
    await writeRuntimeStructuredLog('warn', 'notification.dispatch_deferred', { outboxId: 'outbox-1' }, 'application');
    expect(edgeLog).toHaveBeenCalledWith('warn', 'notification.dispatch_deferred', { outboxId: 'outbox-1' }, 'application', undefined);
    expect(serverLog).not.toHaveBeenCalled();
  });
});
