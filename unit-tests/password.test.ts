import bcrypt from 'bcryptjs';
import { hashPassword, passwordNeedsRehash, verifyPassword } from '../src/lib/password';
import { PASSWORD_HASH_ROUNDS } from '../src/lib/password.constants';

jest.mock('bcryptjs', () => ({
  __esModule: true,
  default: { hash: jest.fn(), compare: jest.fn(), getRounds: jest.fn() },
}));

const hash = bcrypt.hash as unknown as jest.Mock;
const compare = bcrypt.compare as jest.Mock;
const getRounds = bcrypt.getRounds as jest.Mock;

describe('password hashing', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps the bcrypt cost low enough for the Workers CPU budget', () => {
    expect(PASSWORD_HASH_ROUNDS).toBe(10);
  });

  it('hashes with the configured cost and verifies against the stored hash', async () => {
    hash.mockResolvedValue('hashed');
    compare.mockResolvedValue(true);

    await expect(hashPassword('secret')).resolves.toBe('hashed');
    expect(hash).toHaveBeenCalledWith('secret', PASSWORD_HASH_ROUNDS);
    await expect(verifyPassword('secret', 'hashed')).resolves.toBe(true);
    expect(compare).toHaveBeenCalledWith('secret', 'hashed');
  });

  it('flags only hashes with more rounds than the configured cost', () => {
    getRounds.mockReturnValueOnce(12).mockReturnValueOnce(10).mockReturnValueOnce(8);

    expect(passwordNeedsRehash('cost-12')).toBe(true);
    expect(passwordNeedsRehash('cost-10')).toBe(false);
    expect(passwordNeedsRehash('cost-8')).toBe(false);
  });

  it('does not flag hashes that bcrypt cannot read', () => {
    getRounds.mockImplementation(() => {
      throw new Error('Illegal hash');
    });

    expect(passwordNeedsRehash('not-a-bcrypt-hash')).toBe(false);
  });
});
