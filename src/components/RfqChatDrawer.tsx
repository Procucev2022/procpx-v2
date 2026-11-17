'use client';
// src/components/RfqChatDrawer.tsx - Persistent RFQ & Negotiation Clarification Drawer
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import {
  X,
  Send,
  MessageSquare,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type { RfqChatDrawerProps } from "@app-types/components/RfqChatDrawer.types";
import type { RfqMessageCreateRequest } from '@app-types/app/api/procurement/rfq-messages.types';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";

export type { RfqChatDrawerProps };


export default function RfqChatDrawer({
  isOpen,
  onClose,
  rfqId,
  rfqNumber,
  title,
  vendorId,
  vendorName,
  isVendorUser = false,
}: RfqChatDrawerProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [nextMessageCursor, setNextMessageCursor] = useState<string | null>(null);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const shouldScrollToEndRef = useRef(true);
  const pendingScrollAdjustmentRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  // Identifies the thread that is on screen. Replies that were requested for an earlier RFQ or vendor are discarded.
  const messageRequestSequence = useRef(0);

  useEffect(() => {
    // Replies requested before this point belong to the previous RFQ or vendor thread.
    messageRequestSequence.current += 1;
    if (isOpen && rfqId) {
      loadMessages({ startThread: true });
    }
  }, [isOpen, rfqId, vendorId]);

  useLayoutEffect(() => {
    const list = messageListRef.current;
    const pendingAdjustment = pendingScrollAdjustmentRef.current;
    if (list && pendingAdjustment) {
      list.scrollTop = pendingAdjustment.scrollTop + list.scrollHeight - pendingAdjustment.scrollHeight;
      pendingScrollAdjustmentRef.current = null;
    } else if (shouldScrollToEndRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      shouldScrollToEndRef.current = false;
    }
  }, [messages]);

  const loadMessages = async (options: { startThread?: boolean } = {}) => {
    const sequence = ++messageRequestSequence.current;
    const isCurrentRequest = () => sequence === messageRequestSequence.current;
    if (options.startThread) {
      // The new thread starts empty, so nothing from the previous RFQ or vendor stays on screen.
      setMessages([]);
      setHasMoreMessages(false);
      setNextMessageCursor(null);
      setLoadingOlderMessages(false);
    }
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams();
      if (vendorId) query.set('vendorId', vendorId);
      const param = query.size > 0 ? `?${query.toString()}` : '';
      const res = await fetch(`/api/procurement/rfqs/${rfqId}/messages${param}`);
      if (!isCurrentRequest()) return;
      if (res.ok) {
        const data = await res.json();
        if (!isCurrentRequest()) return;
        shouldScrollToEndRef.current = true;
        setHasMoreMessages(Boolean(data.hasMore ?? data.data?.hasMore));
        setNextMessageCursor(data.nextCursor ?? data.data?.nextCursor ?? null);
        setMessages(data.messages || data.data?.messages || []);
      } else {
        const err = await res.json();
        if (!isCurrentRequest()) return;
        setError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToLoadMessageHistory }));
      }
    } catch (e: any) {
      if (!isCurrentRequest()) return;
      setError(interpolateUiString(UI_STRINGS.common.value1, { "value1": e.message || UI_STRINGS.common.userMessages.networkErrorFetchingMessages }));
    } finally {
      if (isCurrentRequest()) setLoading(false);
    }
  };

  const loadOlderMessages = async () => {
    if (!nextMessageCursor || loadingOlderMessages) return;
    const thread = messageRequestSequence.current;
    const isSameThread = () => thread === messageRequestSequence.current;
    setLoadingOlderMessages(true);
    setError('');
    try {
      const query = new URLSearchParams({ cursor: nextMessageCursor });
      if (vendorId) query.set('vendorId', vendorId);
      const res = await fetch(`/api/procurement/rfqs/${rfqId}/messages?${query.toString()}`);
      if (!isSameThread()) return;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || UI_STRINGS.common.userMessages.failedToLoadMessageHistory);
      }
      const data = await res.json();
      if (!isSameThread()) return;
      const olderMessages = data.messages || data.data?.messages || [];
      const list = messageListRef.current;
      pendingScrollAdjustmentRef.current = list ? { scrollHeight: list.scrollHeight, scrollTop: list.scrollTop } : null;
      shouldScrollToEndRef.current = false;
      setMessages((current) => [...olderMessages, ...current]);
      setHasMoreMessages(Boolean(data.hasMore ?? data.data?.hasMore));
      setNextMessageCursor(data.nextCursor ?? data.data?.nextCursor ?? null);
    } catch (e: any) {
      if (!isSameThread()) return;
      setError(interpolateUiString(UI_STRINGS.common.value1, { value1: e.message || UI_STRINGS.common.userMessages.networkErrorFetchingMessages }));
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    setSubmitting(true);
    setError('');

    try {
      const payload: RfqMessageCreateRequest = {
        message: inputText.trim(),
        isVendorSent: isVendorUser,
        vendorId: vendorId || null,
        senderRole: isVendorUser ? 'VENDOR' : 'BUYER',
        senderName: isVendorUser ? vendorName || 'Vendor Representative' : 'Procurement Manager',
      };

      const res = await fetch(`/api/procurement/rfqs/${rfqId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setInputText('');
        await loadMessages();
      } else {
        const err = await res.json();
        setError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToSendMessage2 }));
      }
    } catch (e: any) {
      setError(interpolateUiString(UI_STRINGS.common.value1, { "value1": e.message || UI_STRINGS.common.userMessages.networkErrorSendingMessage }));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 460,
        maxWidth: '92vw',
        background: '#ffffff',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Drawer Header */}
      <div
        ref={messageListRef}
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e2e8f0',
          background: '#0f172a',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageSquare size={18} className="text-blue-400" />
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#ffffff' }}>{UI_STRINGS.componentsRfqChatDrawer.rFQClarificationsQueries}</h3>
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{UI_STRINGS.common.ref}<span className="font-mono text-white font-semibold">{rfqNumber}</span>
            {title && interpolateUiString(UI_STRINGS.componentsRfqChatDrawer.title, { "title": title })}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 4,
          }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Messages List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 20px',
          background: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {hasMoreMessages && (
          <button type="button" onClick={loadOlderMessages} disabled={loadingOlderMessages} className="btn btn-secondary" style={{ alignSelf: 'center' }}>
            {loadingOlderMessages ? UI_STRINGS.common.loadingMessages : UI_STRINGS.common.loadMore}
          </button>
        )}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, color: '#64748b' }}>
            <Loader2 size={24} className="animate-spin" />
            <span style={{ marginLeft: 8, fontSize: 13 }}>{UI_STRINGS.common.loadingMessages}</span>
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
            <MessageSquare size={36} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
            <div style={{ fontWeight: 600, fontSize: 13, color: '#475569' }}>{UI_STRINGS.componentsRfqChatDrawer.noQueriesOrClarificationsYet}</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>{UI_STRINGS.componentsRfqChatDrawer.communicateCommercialOrTechnicalQueriesWithFullAuditPersistence}</div>
          </div>
        ) : (
          messages.map((m) => {
            const isVendor = m.isVendorSent || m.senderRole === 'VENDOR';
            const isMe = isVendorUser ? isVendor : !isVendor;

            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isMe ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    color: '#64748b',
                    marginBottom: 3,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ fontWeight: 600, color: isVendor ? '#059669' : '#1e40af' }}>
                    {m.senderName}{UI_STRINGS.common.copy1b3t0c5}{m.senderRole}{UI_STRINGS.common.copyc7zu6c}</span>
                  <span>{UI_STRINGS.common.copyaw0l2d}</span>
                  <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    fontSize: 13,
                    lineHeight: 1.45,
                    background: isMe ? '#2563eb' : '#ffffff',
                    color: isMe ? '#ffffff' : '#0f172a',
                    border: isMe ? 'none' : '1px solid #e2e8f0',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  {m.message}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error message */}
      {error && (
        <div
          style={{
            padding: '8px 16px',
            background: '#fef2f2',
            borderTop: '1px solid #fee2e2',
            color: '#b91c1c',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Input Form */}
      <form
        onSubmit={handleSendMessage}
        style={{
          padding: '14px 16px',
          borderTop: '1px solid #e2e8f0',
          background: '#ffffff',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={UI_STRINGS.componentsRfqChatDrawer.typeQueryOrClarification}
          disabled={submitting}
          style={{
            flex: 1,
            padding: '9px 12px',
            borderRadius: 6,
            border: '1px solid #cbd5e1',
            fontSize: 13,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={submitting || !inputText.trim()}
          style={{
            background: '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: 6,
            padding: '9px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: submitting || !inputText.trim() ? 'not-allowed' : 'pointer',
            opacity: submitting || !inputText.trim() ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}{UI_STRINGS.componentsRfqChatDrawer.send}</button>
      </form>
    </div>
  );
}
