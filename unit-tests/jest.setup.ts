import '@testing-library/jest-dom';
import os from 'node:os';
import path from 'node:path';

// Unit tests must never reach a real database. Route suites mock Prisma, while
// the singleton suite verifies that missing D1 configuration fails closed.
delete process.env.DATABASE_PROVIDER;

// Routes log handled failures through the shared logger; keep test events out of the
// developer's logs/ folder so log searches only show real application activity.
process.env.APP_LOG_DIR ??= path.join(os.tmpdir(), 'procpx-unit-test-logs');
