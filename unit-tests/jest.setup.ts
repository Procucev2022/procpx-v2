import '@testing-library/jest-dom';

process.env.CLOUDFLARE_ACCOUNT_ID ??= 'jest-account-id';
process.env.CLOUDFLARE_API_TOKEN ??= 'jest-api-token';
process.env.CLOUDFLARE_DATABASE_ID ??= 'jest-database-id';
