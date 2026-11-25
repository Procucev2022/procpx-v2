import { assertRequiredEnv, getMissingRequiredEnv, getRequiredEnv } from '../src/lib/env';
import { NEXT_BUILD_PHASE, REQUIRED_ENV_VARS } from '../src/lib/env.constants';
import { interpolateUiString } from '../src/lib/i18n';
import { UI_STRINGS } from '../src/lib/ui-strings.constants';

const COMPLETE_ENV = {
  NEXTAUTH_SECRET: 'test-secret',
  NEXTAUTH_URL: 'http://localhost:3000',
  DATABASE_PROVIDER: 'd1',
  UPLOAD_DIR: './uploads',
  GEMINI_API_KEY: 'test-gemini-key',
};

function missingMessage(names: string): string {
  return interpolateUiString(UI_STRINGS.libEnv.missingRequiredSettings, { names });
}

describe('required environment settings', () => {
  it('lists exactly the settings the app cannot run without', () => {
    expect(REQUIRED_ENV_VARS).toEqual(['NEXTAUTH_SECRET', 'NEXTAUTH_URL', 'DATABASE_PROVIDER', 'UPLOAD_DIR', 'GEMINI_API_KEY']);
  });

  it('reports absent and blank settings as missing', () => {
    expect(getMissingRequiredEnv(COMPLETE_ENV)).toEqual([]);
    expect(getMissingRequiredEnv({ ...COMPLETE_ENV, NEXTAUTH_SECRET: '   ', GEMINI_API_KEY: undefined }))
      .toEqual(['NEXTAUTH_SECRET', 'GEMINI_API_KEY']);
    expect(getMissingRequiredEnv({})).toEqual([...REQUIRED_ENV_VARS]);
  });

  it('reads process.env by default', () => {
    const original = process.env.UPLOAD_DIR;
    process.env.UPLOAD_DIR = 'from-process-env';
    try {
      expect(getRequiredEnv('UPLOAD_DIR')).toBe('from-process-env');
      expect(getMissingRequiredEnv()).not.toContain('UPLOAD_DIR');
    } finally {
      if (original === undefined) delete process.env.UPLOAD_DIR;
      else process.env.UPLOAD_DIR = original;
    }
  });

  it('stops startup with every missing name, and passes a complete configuration', () => {
    expect(() => assertRequiredEnv(COMPLETE_ENV)).not.toThrow();
    expect(() => assertRequiredEnv({ NEXTAUTH_URL: 'http://localhost:3000', DATABASE_PROVIDER: 'd1' }))
      .toThrow(missingMessage('NEXTAUTH_SECRET, UPLOAD_DIR, GEMINI_API_KEY'));
  });

  it('skips the startup check while next build runs', () => {
    expect(() => assertRequiredEnv({ NEXT_PHASE: NEXT_BUILD_PHASE })).not.toThrow();
  });

  it('returns a single setting or fails without a fallback', () => {
    expect(getRequiredEnv('GEMINI_API_KEY', COMPLETE_ENV)).toBe('test-gemini-key');
    expect(() => getRequiredEnv('GEMINI_API_KEY', {})).toThrow(missingMessage('GEMINI_API_KEY'));
  });
});
