'use client';
// components/ui/SpecificationCell.tsx - Standardised Enterprise Single-Line Specification Preview with Scrollable Detail
import React, { useState } from 'react';
import { FileText, Copy, Check, ExternalLink } from 'lucide-react';
import Modal from '@/components/ui/Modal';

interface SpecificationCellProps {
  specification?: string | null;
  lineNumber?: string | number;
  itemDescription?: string;
  maxWidth?: number | string;
  lineId?: string;
  emptyPlaceholder?: string;
}

export default function SpecificationCell({
  specification,
  lineNumber,
  itemDescription,
  maxWidth = 220,
  lineId,
  emptyPlaceholder = '—',
}: SpecificationCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const cleanSpec = (specification || '').trim();

  if (!cleanSpec || cleanSpec === '—' || cleanSpec === '-') {
    return <span className="text-muted" style={{ fontStyle: 'italic', fontSize: 12 }}>{emptyPlaceholder}</span>;
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(cleanSpec);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(true);
    }
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={handleTriggerClick}
        onKeyDown={handleKeyDown}
        title="Click to view full specification"
        className="spec-preview-trigger"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          cursor: 'pointer',
          maxWidth: typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth,
          padding: '2px 6px',
          borderRadius: 4,
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#93c5fd';
          e.currentTarget.style.background = '#eff6ff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#e2e8f0';
          e.currentTarget.style.background = '#f8fafc';
        }}
      >
        <FileText size={12} style={{ color: '#2563eb', flexShrink: 0 }} />
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 12,
            color: '#334155',
            lineHeight: 1.4,
          }}
        >
          {cleanSpec}
        </span>
      </div>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={lineNumber ? `Specification — Line #${lineNumber}` : 'Technical Specification'}
        subtitle={itemDescription ? itemDescription : 'Complete engineering & material specification requirements'}
        maxWidth={580}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <button
              type="button"
              onClick={handleCopy}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {copied ? <Check size={14} color="#059669" /> : <Copy size={14} />}
              {copied ? 'Copied to Clipboard' : 'Copy Specification'}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              {lineId && (
                <a
                  href={`/boq/line/${lineId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <ExternalLink size={13} /> Full Line Item
                </a>
              )}
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setIsOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            tabIndex={0}
            role="region"
            aria-label="Full Specification Text"
            style={{
              maxHeight: 260,
              overflowY: 'auto',
              padding: 14,
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              fontSize: 13,
              lineHeight: 1.6,
              color: '#0f172a',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'inherit',
            }}
          >
            {cleanSpec}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
            <span>Bounded view preserves table height and layout stability.</span>
            <span>{cleanSpec.length} characters</span>
          </div>
        </div>
      </Modal>
    </>
  );
}
