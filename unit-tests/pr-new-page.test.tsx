/** @jest-environment jsdom */
import { redirect } from 'next/navigation';
import CreatePrPage from '../src/app/(app)/pr/new/page';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

const redirectMock = redirect as unknown as jest.Mock;

describe('CreatePrPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to /dashboard', () => {
    CreatePrPage();
    expect(redirectMock).toHaveBeenCalledWith('/dashboard');
  });
});
