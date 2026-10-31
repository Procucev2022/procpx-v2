import '@testing-library/jest-dom';

// next/jest loads .env, which may point `next dev` at remote D1. Unit tests must
// never reach a real database, so pin them to the default SQLite client.
process.env.DATABASE_PROVIDER = 'sqlite';
