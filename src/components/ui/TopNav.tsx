'use client';
// components/ui/TopNav.tsx - Professional Enterprise Top Navigation
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import {
  Search,
  Bell,
  HelpCircle,
  Building2,
  ChevronDown,
  User,
  Settings,
  Shield,
  LogOut,
} from 'lucide-react';
import type { TopNavProps } from "@app-types/components/ui/TopNav.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";



export default function TopNav({ user }: TopNavProps) {
  const [searchFocused, setSearchFocused] = useState(false);
  const [userDropdown, setUserDropdown] = useState(false);

  // Workflow Notifications State
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications?limit=10');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {
      // silently ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllAsRead: true }),
      });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // silently ignore
    }
  };

  const initials =
    user.name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'CP';

  return (
    <header className="app-topbar">
      {/* ── Left: Brand & Product ────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 10C6 7.79086 7.79086 6 10 6H16C20.4183 6 24 9.58172 24 14C24 18.4183 20.4183 22 16 22H11V26H6V10Z" fill="#0284c7" />
            <path d="M11 11H16C17.6569 11 19 12.3431 19 14C19 15.6569 17.6569 17 16 17H11V11Z" fill="#ffffff" />
            <circle cx="23" cy="9" r="4" fill="#0f52ba" />
          </svg>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0284c7', letterSpacing: -0.5, lineHeight: 1 }}>{UI_STRINGS.componentsUiTopNav.procucev}</div>
        </Link>
      </div>

      {/* ── Center: Global Search Bar ────────────────────────── */}
      <div
        style={{
          flex: '0 1 480px',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: 12,
            color: searchFocused ? '#1e40af' : '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            pointerEvents: 'none',
            transition: 'color 0.15s',
          }}
        >
          <Search size={15} strokeWidth={2} />
        </span>
        <input
          type="text"
          placeholder={UI_STRINGS.componentsUiTopNav.searchRFQsBOQsProjectsVendorsKOr}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          style={{
            width: '100%',
            height: 36,
            padding: '0 40px 0 36px',
            borderRadius: 6,
            border: searchFocused ? '1px solid #1e40af' : '1px solid #cbd5e1',
            background: searchFocused ? '#ffffff' : '#f8fafc',
            boxShadow: searchFocused ? '0 0 0 3px rgba(30, 64, 175, 0.12)' : 'none',
            fontSize: 13,
            color: '#0f172a',
            outline: 'none',
            transition: 'all 0.15s ease-in-out',
          }}
        />
        <span
          style={{
            position: 'absolute',
            right: 10,
            padding: '2px 5px',
            background: '#e2e8f0',
            borderRadius: 4,
            fontSize: 10,
            color: '#64748b',
            fontFamily: 'monospace',
            pointerEvents: 'none',
            fontWeight: 600,
          }}
        >{UI_STRINGS.componentsUiTopNav.k}</span>
      </div>

      {/* ── Right: Tenant, Notifications, Help & User Profile ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Subtle Tenant Indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            background: '#f8fafc',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            color: '#334155',
            border: '1px solid #e2e8f0',
          }}
        >
          <Building2 size={13} color="#64748b" strokeWidth={2} />
          <span style={{ maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.tenantName}
          </span>
        </div>

        {/* Notifications Icon Button with Live Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            aria-label={UI_STRINGS.componentsUiTopNav.notifications}
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            style={{
              width: 34,
              height: 34,
              borderRadius: 6,
              border: '1px solid #e2e8f0',
              background: notificationsOpen ? '#f1f5f9' : '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              position: 'relative',
              color: '#475569',
              transition: 'background 0.15s',
            }}
          >
            <Bell size={16} strokeWidth={1.8} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  minWidth: 16,
                  height: 16,
                  padding: '0 4px',
                  borderRadius: 8,
                  background: '#ef4444',
                  color: '#ffffff',
                  fontSize: 10,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1.5px solid #ffffff',
                }}
              >
                {unreadCount > 9 ? UI_STRINGS.componentsUiTopNav.copyatifd9 : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown Panel */}
          {notificationsOpen && (
            <div
              style={{
                position: 'absolute',
                top: 42,
                right: 0,
                width: 360,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.15), 0 8px 10px -6px rgba(15, 23, 42, 0.1)',
                zIndex: 1000,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #f1f5f9',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#f8fafc',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{unreadCount > 0
                  ? interpolateUiString(UI_STRINGS.componentsUiTopNav.workflowNotificationsWithUnreadCount, { unreadCount })
                  : UI_STRINGS.componentsUiTopNav.workflowNotifications}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563eb',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >{UI_STRINGS.componentsUiTopNav.markAllAsRead}</button>
                )}
              </div>

              <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>{UI_STRINGS.componentsUiTopNav.noNotificationsYetWorkflowUpdatesWillAppearHere}</div>
                ) : (
                  notifications.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #f8fafc',
                        background: item.isRead ? '#ffffff' : '#f0fdf4',
                        transition: 'background 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ fontWeight: 600, fontSize: 12, color: '#0f172a' }}>{item.title}</div>
                        {item.recordNumber && (
                          <span
                            className="font-mono"
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              background: '#e2e8f0',
                              color: '#334155',
                              padding: '1px 5px',
                              borderRadius: 4,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {item.recordNumber}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 3, lineHeight: 1.4 }}>
                        {item.message}
                      </div>
                      <div
                        style={{
                          marginTop: 6,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: 11,
                          color: '#94a3b8',
                        }}
                      >
                        <span>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {item.link && (
                          <Link
                            href={item.link}
                            onClick={() => setNotificationsOpen(false)}
                            style={{
                              color: '#2563eb',
                              textDecoration: 'none',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: 2,
                            }}
                          >{UI_STRINGS.componentsUiTopNav.view}</Link>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Help / Docs */}
        <button
          type="button"
          aria-label={UI_STRINGS.componentsUiTopNav.documentationAndHelp}
          style={{
            width: 34,
            height: 34,
            borderRadius: 6,
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#475569',
          }}
        >
          <HelpCircle size={16} strokeWidth={1.8} />
        </button>

        <span style={{ height: 20, width: 1, background: '#e2e8f0', margin: '0 2px' }} />

        {/* User Card & Dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setUserDropdown(!userDropdown)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '3px 6px 3px 3px',
              borderRadius: 6,
              border: '1px solid transparent',
              background: userDropdown ? '#f1f5f9' : 'transparent',
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: 11,
              }}
            >
              {initials}
            </div>
            <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{user.name}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{user.role.replace(/_/g, ' ')}</div>
            </div>
            <ChevronDown size={14} color="#94a3b8" />
          </button>

          {userDropdown && (
            <div
              style={{
                position: 'absolute',
                top: 42,
                right: 0,
                width: 230,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.03)',
                padding: '6px 0',
                zIndex: 100,
              }}
            >
              <div style={{ padding: '8px 16px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>{UI_STRINGS.componentsUiTopNav.signedInAs}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{user.email}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{user.tenantName}</div>
              </div>

              <div style={{ padding: '4px 0' }}>
                <Link
                  href="/dashboard"
                  onClick={() => setUserDropdown(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 16px',
                    fontSize: 13,
                    color: '#334155',
                    textDecoration: 'none',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <User size={15} color="#64748b" />{UI_STRINGS.common.profile}</Link>

                <Link
                  href="/audit"
                  onClick={() => setUserDropdown(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 16px',
                    fontSize: 13,
                    color: '#334155',
                    textDecoration: 'none',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <Shield size={15} color="#64748b" />{UI_STRINGS.componentsUiTopNav.securityAudit}</Link>
              </div>

              <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 4, paddingTop: 4 }}>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 16px',
                    fontSize: 13,
                    color: '#dc2626',
                    background: 'none',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = '#fef2f2')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <LogOut size={15} color="#dc2626" />{UI_STRINGS.componentsUiTopNav.signOut}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
