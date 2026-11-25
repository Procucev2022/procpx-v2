/** @jest-environment jsdom */
import { redirect } from 'next/navigation';
import MyPrsPage from '../src/app/(app)/pr/page';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

const redirectMock = redirect as unknown as jest.Mock;

describe('MyPrsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects to /dashboard', () => {
    MyPrsPage();
    expect(redirectMock).toHaveBeenCalledWith('/dashboard');
  });
});
