import '@testing-library/jest-dom';
import os from 'node:os';
import path from 'node:path';

// next/jest loads .env, which may point `next dev` at remote D1. Unit tests must
// never reach a real database, so pin them to the default SQLite client.
process.env.DATABASE_PROVIDER = 'sqlite';

// Routes log handled failures through the shared logger; keep test events out of the
// developer's logs/ folder so log searches only show real application activity.
process.env.APP_LOG_DIR ??= path.join(os.tmpdir(), 'procpx-unit-test-logs');
