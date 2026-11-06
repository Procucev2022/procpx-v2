'use client';
// src/components/ApprovalChatDrawer.tsx - Interactive Communication & Enquiry Drawer
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  MessageSquare,
  HelpCircle,
  Clock,
  User,
  Shield,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type { ApprovalChatDrawerProps } from "@app-types/components/ApprovalChatDrawer.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";

export type { ApprovalChatDrawerProps };


export default function ApprovalChatDrawer({
  isOpen,
  onClose,
  entityType,
  entityId,
  entityCode,
  title,
  costCentre,
  category,
  amount,
  initialEnquiryMode = false,
  onMessageSent,
}: ApprovalChatDrawerProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [olderMessagesCursor, setOlderMessagesCursor] = useState<{ id: string; timestamp: string } | null>(null);
  const [inputText, setInputText] = useState('');
  const [isEnquiry, setIsEnquiry] = useState(initialEnquiryMode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const skipNextAutoScrollRef = useRef(false);

  useEffect(() => {
    if (isOpen && entityId) {
      loadMessages();
      setIsEnquiry(initialEnquiryMode);
    }
  }, [isOpen, entityId, initialEnquiryMode]);

  useEffect(() => {
    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false;
      return;
    }
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const loadMessages = async (
    cursor?: { id: string; timestamp: string },
    prepend = false,
  ) => {
    if (prepend) setLoadingOlder(true);
    else setLoading(true);
    setError('');
    try {
      const param = entityType === 'PR' ? `prId=${entityId}` : `contributionId=${entityId}`;
      const cursorParams = cursor
        ? `&beforeId=${encodeURIComponent(cursor.id)}&beforeTimestamp=${encodeURIComponent(cursor.timestamp)}`
        : '';
      const res = await fetch(`/api/approvals/messages?${param}${cursorParams}`);
      if (res.ok) {
        const data = await res.json();
        const pageMessages = data.messages || [];
        setMessages((current) => prepend ? [...pageMessages, ...current] : pageMessages);
        setHasOlderMessages(Boolean(data.hasMore));
        setOlderMessagesCursor(data.nextCursor || null);
      } else {
        const err = await res.json();
        setError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToLoadMessageHistory }));
      }
    } catch (e: any) {
      setError(interpolateUiString(UI_STRINGS.common.value1, { "value1": e.message || UI_STRINGS.common.userMessages.networkErrorFetchingMessages }));
    } finally {
      if (prepend) setLoadingOlder(false);
      else setLoading(false);
    }
  };

  const loadOlderMessages = async () => {
    if (!olderMessagesCursor || loadingOlder) return;
    skipNextAutoScrollRef.current = true;
    await loadMessages(olderMessagesCursor, true);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    setSubmitting(true);
    setError('');

    try {
      const payload: any = {
        message: inputText.trim(),
        type: isEnquiry ? 'ENQUIRY' : 'MESSAGE',
      };
      if (entityType === 'PR') payload.prId = entityId;
      else payload.contributionId = entityId;

      const res = await fetch('/api/approvals/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToSendMessage2 }));
      }

      setInputText('');
      await loadMessages();
      if (onMessageSent) onMessageSent();
    } catch (err: any) {
      setError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.failedToSendMessage2 }));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(3px)',
        zIndex: 1050,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 520,
          maxWidth: '100vw',
          height: '100vh',
          background: '#ffffff',
          boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 1051,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e2e8f0',
            background: '#f8fafc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: entityType === 'PR' ? '#eff6ff' : '#ecfdf5',
                  color: entityType === 'PR' ? '#1d4ed8' : '#047857',
                  border: `1px solid ${entityType === 'PR' ? '#bfdbfe' : '#a7f3d0'}`,
                }}
              >
                {entityType === 'PR' ? UI_STRINGS.componentsApprovalChatDrawer.pREnquiryMessages : UI_STRINGS.componentsApprovalChatDrawer.budgetEnquiryMessages}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                {entityCode}
              </span>
            </div>
            {title && (
              <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                {title}
              </div>
            )}
            <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {costCentre && <span>{UI_STRINGS.componentsApprovalChatDrawer.costCentre}<strong>{costCentre}</strong></span>}
              {category && <span>{UI_STRINGS.componentsApprovalChatDrawer.category}<strong>{category}</strong></span>}
              {amount !== undefined && (
                <span>{UI_STRINGS.componentsApprovalChatDrawer.value}<strong style={{ color: '#047857' }}>{UI_STRINGS.common.copytfdhmk}{amount.toLocaleString(I18N_CONFIG.defaultLocale)}</strong></span>
              )}
            </div>
          </div>
          <button
            type="button"
            title={UI_STRINGS.componentsApprovalChatDrawer.closePanel}
            aria-label={UI_STRINGS.componentsApprovalChatDrawer.closePanel}
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              padding: 4,
              borderRadius: 4,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Message Stream */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            background: '#f8fafc',
          }}
        >
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', gap: 8 }}>
              <Loader2 size={20} className="spin" />
              <span>{UI_STRINGS.common.loadingMessages}</span>
            </div>
          ) : messages.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b', textAlign: 'center' }}>
              <MessageSquare size={36} style={{ color: '#cbd5e1', marginBottom: 12 }} />
              <div style={{ fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.componentsApprovalChatDrawer.noMessagesOrEnquiriesYet}</div>
              <p style={{ fontSize: 12, maxWidth: 300, margin: 0 }}>{UI_STRINGS.componentsApprovalChatDrawer.useTheBoxBelowToAskTheRequesterOrSubmitterForClarificationsOrToLogCommunicationNotes}</p>
            </div>
          ) : (
            <>
              {hasOlderMessages && (
                <button
                  type="button"
                  onClick={loadOlderMessages}
                  disabled={loadingOlder}
                  style={{ alignSelf: 'center', border: '1px solid #cbd5e1', borderRadius: 6, background: '#ffffff', color: '#334155', padding: '6px 10px', cursor: loadingOlder ? 'wait' : 'pointer' }}
                >
                  {loadingOlder ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}
                </button>
              )}
              {messages.map((m, idx) => {
              const isEnquiryMsg = m.type === 'ENQUIRY';
              const isDecisionMsg = m.type === 'APPROVED' || m.type === 'REJECTED';

              return (
                <div
                  key={m.id || idx}
                  style={{
                    background: isEnquiryMsg ? '#fffbeb' : isDecisionMsg ? '#f0fdf4' : '#ffffff',
                    border: `1px solid ${isEnquiryMsg ? '#fde68a' : isDecisionMsg ? '#bbf7d0' : '#e2e8f0'}`,
                    borderRadius: 8,
                    padding: '12px 16px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>
                        {m.senderName}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: '#f1f5f9',
                          color: '#475569',
                          border: '1px solid #cbd5e1',
                        }}
                      >
                        {m.senderRole}
                      </span>
                      {isEnquiryMsg && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: '#fef3c7',
                            color: '#92400e',
                            border: '1px solid #fde68a',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          <HelpCircle size={10} />{UI_STRINGS.componentsApprovalChatDrawer.clarificationEnquiry}</span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} />
                      {new Date(m.timestamp).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <div style={{ fontSize: 13, color: '#1e293b', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {m.content}
                  </div>
                </div>
              );
              })}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#ffffff' }}>
          {error && (
            <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSendMessage}>
            {/* Mode Selector */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => setIsEnquiry(false)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid',
                  background: !isEnquiry ? '#1e40af' : '#ffffff',
                  color: !isEnquiry ? '#ffffff' : '#475569',
                  borderColor: !isEnquiry ? '#1e40af' : '#cbd5e1',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <MessageSquare size={12} />{UI_STRINGS.componentsApprovalChatDrawer.messageNote}</button>
              <button
                type="button"
                onClick={() => setIsEnquiry(true)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid',
                  background: isEnquiry ? '#d97706' : '#ffffff',
                  color: isEnquiry ? '#ffffff' : '#475569',
                  borderColor: isEnquiry ? '#d97706' : '#cbd5e1',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <HelpCircle size={12} />{UI_STRINGS.componentsApprovalChatDrawer.requestClarificationEnquiry}</button>
            </div>

            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={
                isEnquiry
                  ? UI_STRINGS.componentsApprovalChatDrawer.askForClarificationRegardingLineItemsRatesSpecsOrDocuments
                  : UI_STRINGS.componentsApprovalChatDrawer.typeAMessageOrNoteRetainedAgainstThisApproval
              }
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 13,
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                outline: 'none',
                resize: 'none',
                marginBottom: 10,
                fontFamily: 'inherit',
              }}
              disabled={submitting}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                {isEnquiry ? UI_STRINGS.componentsApprovalChatDrawer.flagsItemAsClarificationRequested : UI_STRINGS.componentsApprovalChatDrawer.retainedInChronologicalConversation}
              </span>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={submitting || !inputText.trim()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: isEnquiry ? '#d97706' : '#1e40af',
                  borderColor: isEnquiry ? '#d97706' : '#1e40af',
                  padding: '6px 14px',
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 size={13} className="spin" />
                    <span>{UI_STRINGS.common.sending}</span>
                  </>
                ) : (
                  <>
                    <Send size={13} />
                    <span>{isEnquiry ? UI_STRINGS.componentsApprovalChatDrawer.sendEnquiry : UI_STRINGS.componentsApprovalChatDrawer.sendMessage}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
