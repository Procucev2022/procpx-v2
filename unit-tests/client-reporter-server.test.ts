import { installClientErrorReporting, reportClientEvent } from '../src/lib/observability/client-reporter';

// Runs in the node environment: server rendering imports the reporter without a window.
describe('client error reporter during server rendering', () => {
  it('does nothing without a window', () => {
    expect(() => reportClientEvent('error', 'browser.example')).not.toThrow();
    expect(installClientErrorReporting()()).toBeUndefined();
  });
});
