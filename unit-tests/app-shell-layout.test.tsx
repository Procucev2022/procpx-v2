import React from 'react';
import { auth } from '../src/lib/auth';
import { redirect } from 'next/navigation';
import Sidebar from '../src/components/Sidebar';
import TopNav from '../src/components/ui/TopNav';
import { ToastProvider } from '../src/components/ui/Toast';
import AppLayout from '../src/app/(app)/layout';

jest.mock('../src/lib/auth', () => ({ auth: jest.fn() }));
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));
jest.mock('next-auth/react', () => ({ signOut: jest.fn() }));

const authMock = auth as jest.Mock;
const redirectMock = redirect as unknown as jest.Mock;

describe('authenticated app shell layout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('redirects sessions without a user to the login page', async () => {
    authMock.mockResolvedValue({ user: null });
    redirectMock.mockImplementation((location: string) => { throw new Error(`redirect:${location}`); });
    await expect(AppLayout({ children: <p>Private page</p> })).rejects.toThrow('redirect:/login');
    expect(redirectMock).toHaveBeenCalledWith('/login');
  });

  it('composes navigation and page content using the authenticated user fields', async () => {
    const user = { name: 'Ada Lovelace', email: 'ada@example.test', role: 'PROJECT_USER', tenantName: 'Tenant One' };
    authMock.mockResolvedValue({ user });
    const element = await AppLayout({ children: <p>Private page</p> });
    expect(element.type).toBe(ToastProvider);

    const shell = element.props.children;
    expect(shell.type).toBe('div');
    expect(shell.props.className).toBe('app-shell');
    const [topNav, body] = shell.props.children;
    expect(topNav.type).toBe(TopNav);
    expect(topNav.props.user).toEqual(user);
    expect(body.props.className).toBe('app-body');
    const [sidebar, main] = body.props.children;
    expect(sidebar.type).toBe(Sidebar);
    expect(sidebar.props.user).toEqual(user);
    expect(main.type).toBe('main');
    expect(main.props.className).toBe('app-main');
    expect(main.props.children.props.children).toBe('Private page');
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
