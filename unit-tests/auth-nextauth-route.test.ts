import { GET, POST } from '../src/app/api/auth/[...nextauth]/route';
import { handlers } from '../src/lib/auth';

jest.mock('../src/lib/auth', () => ({
  handlers: { GET: jest.fn(), POST: jest.fn() },
}));

describe('NextAuth route forwarding', () => {
  it('exports the GET and POST handlers from the auth module', () => {
    expect(GET).toBe(handlers.GET);
    expect(POST).toBe(handlers.POST);
  });
});
