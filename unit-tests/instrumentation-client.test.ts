jest.mock('../src/lib/observability/client-reporter', () => ({
  installClientErrorReporting: jest.fn(),
}));

import { installClientErrorReporting } from '../src/lib/observability/client-reporter';
import '../src/instrumentation-client';

describe('client instrumentation entry point', () => {
  it('installs browser error reporting before the React tree hydrates', () => {
    expect(installClientErrorReporting).toHaveBeenCalledTimes(1);
  });
});
