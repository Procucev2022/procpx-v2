import '@testing-library/jest-dom';

// Unit tests must never reach a real database. Route suites mock Prisma, while
// the singleton suite verifies that missing D1 configuration fails closed.
delete process.env.DATABASE_PROVIDER;
