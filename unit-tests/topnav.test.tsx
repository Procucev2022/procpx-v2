/** @jest-environment jsdom */
import { interpolateUiString, uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { signOut } from 'next-auth/react';
import TopNav from '../src/components/ui/TopNav';
import { NOTIFICATION_POLL_INTERVAL_MS } from '../src/components/ui/TopNav.constants';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('next-auth/react', () => ({ signOut: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: (props: Record<string, unknown> & { children?: React.ReactNode; onClick?: (event: React.MouseEvent) => void }) =>
    require('react').createElement('a', {
      ...props,
      onClick: (event: React.MouseEvent) => {
        event.preventDefault();
        props.onClick?.(event);
      },
    }, props.children),
}));

const signOutMock = signOut as unknown as jest.Mock;
const originalFetch = global.fetch;
const fetchMock = () => global.fetch as jest.Mock;
const baseUser = { name: 'Ada Lovelace', email: 'ada@example.test', role: 'PROJECT_USER', tenantName: 'Tenant One' };
const jsonResponse = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

describe('TopNav', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn() as unknown as typeof fetch;
    signOutMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it('loads notifications, marks all read, refreshes, and controls the user menu', async () => {
    const notifications = [
      {
        id: 'n-1', title: 'PR needs approval', message: 'Review the scope', recordNumber: 'PR-17',
        createdAt: '2026-01-01T12:00:00.000Z', isRead: false, link: '/pr/17',
      },
      {
        id: 'n-2', title: 'Rate locked', message: 'The vendor accepted the rate',
        createdAt: '2026-01-01T13:00:00.000Z', isRead: true,
      },
    ];
    fetchMock()
      .mockResolvedValueOnce(jsonResponse({ notifications, unreadCount: 12 }))
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValueOnce(jsonResponse({ notifications: [], unreadCount: 0 }));
    render(<TopNav user={baseUser} />);

    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('/api/notifications?limit=10'));
    expect(screen.getByText('Tenant One')).toBeInTheDocument();
    expect(screen.getByText('AL')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search RFQs/)).toBeInTheDocument();
    const search = screen.getByPlaceholderText(/Search RFQs/);
    fireEvent.focus(search);
    expect(search).toHaveStyle({ border: '1px solid rgb(30, 64, 175)' });
    fireEvent.blur(search);
    expect(search).toHaveStyle({ border: '1px solid rgb(203, 213, 225)' });

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsUiTopNav.notifications) }));
    expect(screen.getByText(interpolateUiString(UI_STRINGS.componentsUiTopNav.workflowNotificationsWithUnreadCount, { unreadCount: 12 }))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsUiTopNav.copyatifd9))).toBeInTheDocument();
    expect(screen.getByText('PR-17')).toBeInTheDocument();
    expect(screen.getByText('Review the scope')).toBeInTheDocument();
    expect(screen.getByText('Rate locked').parentElement?.parentElement).toHaveStyle({ background: 'rgb(255, 255, 255)' });
    fireEvent.click(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.common.view) }));
    expect(screen.queryByText(interpolateUiString(UI_STRINGS.componentsUiTopNav.workflowNotificationsWithUnreadCount, { unreadCount: 12 }))).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsUiTopNav.notifications) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsUiTopNav.markAllAsRead) }));
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('/api/notifications', expect.objectContaining({ method: 'PUT' })));
    await waitFor(() => expect(screen.queryByRole('button', { name: uiStringPattern(UI_STRINGS.componentsUiTopNav.markAllAsRead) })).not.toBeInTheDocument());
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsUiTopNav.workflowNotifications))).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(NOTIFICATION_POLL_INTERVAL_MS));
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsUiTopNav.noNotificationsYetWorkflowUpdatesWillAppearHere))).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Ada Lovelace/ }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsUiTopNav.signedInAs))).toBeInTheDocument();
    expect(screen.getByText('ada@example.test')).toBeInTheDocument();
    expect(screen.getByText('PROJECT USER')).toBeInTheDocument();
    const profile = screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.common.profile) });
    fireEvent.mouseOver(profile);
    expect(profile).toHaveStyle({ background: 'rgb(248, 250, 252)' });
    fireEvent.mouseOut(profile);
    expect(profile).toHaveStyle({ background: 'transparent' });
    fireEvent.click(profile);
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.componentsUiTopNav.signedInAs))).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ada Lovelace/ }));
    const auditLink = screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.componentsUiTopNav.securityAudit) });
    fireEvent.mouseOver(auditLink);
    fireEvent.mouseOut(auditLink);
    fireEvent.click(auditLink);
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.componentsUiTopNav.signedInAs))).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ada Lovelace/ }));
    const signOutButton = screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsUiTopNav.signOut) });
    fireEvent.mouseOver(signOutButton);
    fireEvent.mouseOut(signOutButton);
    fireEvent.click(signOutButton);
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: UI_STRINGS.libAuth.login });
  });

  it('uses fallback initials and ignores failed notification requests', async () => {
    fetchMock()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce(jsonResponse({ notifications: null, unreadCount: 0 }))
      .mockResolvedValueOnce(jsonResponse({}, false));
    const { rerender } = render(<TopNav user={{ role: 'VENDOR', tenantName: 'Vendor Tenant' }} />);
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(1));
    expect(screen.getByText('CP')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsUiTopNav.notifications) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsUiTopNav.noNotificationsYetWorkflowUpdatesWillAppearHere))).toBeInTheDocument();

    rerender(<TopNav user={{ name: '', role: 'VENDOR', tenantName: 'Vendor Tenant' }} />);
    act(() => jest.advanceTimersByTime(NOTIFICATION_POLL_INTERVAL_MS));
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(2));
    expect(screen.getByText('CP')).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(NOTIFICATION_POLL_INTERVAL_MS));
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(3));
  });

  it('skips polls while the tab is hidden and refreshes when it is shown again', async () => {
    fetchMock().mockResolvedValue(jsonResponse({ notifications: [], unreadCount: 0 }));
    const visibility = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      const { unmount } = render(<TopNav user={baseUser} />);
      await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(1));
      act(() => jest.advanceTimersByTime(NOTIFICATION_POLL_INTERVAL_MS));
      expect(fetchMock()).toHaveBeenCalledTimes(1);

      visibility.mockReturnValue('visible');
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });
      await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(2));

      unmount();
      act(() => { document.dispatchEvent(new Event('visibilitychange')); });
      expect(fetchMock()).toHaveBeenCalledTimes(2);
    } finally {
      visibility.mockRestore();
    }
  });

  it('keeps local read state when the mark-all request fails', async () => {
    fetchMock()
      .mockResolvedValueOnce(jsonResponse({
        notifications: [{ id: 'n-3', title: 'Awaiting review', message: 'Review required', isRead: false, createdAt: '2026-02-01T10:00:00Z' }],
        unreadCount: 1,
      }))
      .mockRejectedValueOnce(new Error('network unavailable'));
    render(<TopNav user={baseUser} />);
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsUiTopNav.notifications) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsUiTopNav.markAllAsRead) }));
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(2));
    expect(screen.getByText(interpolateUiString(UI_STRINGS.componentsUiTopNav.workflowNotificationsWithUnreadCount, { unreadCount: 1 }))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsUiTopNav.markAllAsRead) })).toBeInTheDocument();
  });
});
