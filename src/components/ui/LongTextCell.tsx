'use client';
// src/components/ui/LongTextCell.tsx
// Standardized Enterprise Reusable Long-Text Preview & Detail Inspection Component
import React, { useState } from 'react';
import { Eye, Copy, Check, FileText } from 'lucide-react';
import Modal from '@/components/ui/Modal';

export interface LongTextCellProps {
  /** The full text content to display */
  text?: string | null;
  /** Modal header title */
  title?: string;
  /** Modal subtitle or context label (e.g., Item Code / Description) */
  subtitle?: string;
  /** Preview maximum width in pixels or Tailwind class (default: 260) */
  maxWidth?: number | string;
  /** Placeholder when text is empty (default: '—') */
  emptyPlaceholder?: string;
  /** Whether to show a subtle icon next to preview (default: true) */
  showIcon?: boolean;
  /** Highlight color/accent (default: 'slate') */
  accent?: 'slate' | 'blue' | 'amber';
  /** Max lines to clamp in table preview (default: 1) */
  clampLines?: 1 | 2;
  /** Optional extra action in modal footer */
  extraFooterAction?: React.ReactNode;
}

export default function LongTextCell({
  text,
  title = 'Full Details',
  subtitle,
  maxWidth = 260,
  emptyPlaceholder = '—',
  showIcon = true,
  accent = 'slate',
  clampLines = 1,
  extraFooterAction,
}: LongTextCellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const cleanText = (text || '').trim();

  if (!cleanText || cleanText === '—' || cleanText === '-') {
    return <span className="text-slate-400 italic text-xs select-none">{emptyPlaceholder}</span>;
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(cleanText);
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

  const maxWidthStyle = typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={handleTriggerClick}
        onKeyDown={handleKeyDown}
        title="Click or press Enter to view full details"
        aria-label={`View full details for: ${cleanText.slice(0, 40)}...`}
        className={`group inline-flex items-center gap-1.5 cursor-pointer rounded px-1.5 py-0.5 text-xs transition-colors select-text ${
          accent === 'blue'
            ? 'text-blue-900 bg-blue-50/60 hover:bg-blue-100 hover:border-blue-300 border border-blue-200/60'
            : accent === 'amber'
            ? 'text-amber-900 bg-amber-50/60 hover:bg-amber-100 hover:border-amber-300 border border-amber-200/60'
            : 'text-slate-800 bg-slate-50/80 hover:bg-slate-100 hover:border-slate-300 border border-slate-200/80'
        }`}
        style={{ maxWidth: maxWidthStyle }}
      >
        {showIcon && (
          <FileText
            size={13}
            className="text-slate-400 group-hover:text-blue-600 shrink-0 transition-colors"
          />
        )}
        <span
          className={`truncate leading-snug font-normal text-slate-800 ${
            clampLines === 2 ? 'line-clamp-2 whitespace-normal' : 'whitespace-nowrap'
          }`}
        >
          {cleanText}
        </span>
        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[11px] text-blue-600 font-medium shrink-0 ml-auto">
          View
        </span>
      </div>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={title}
        subtitle={subtitle}
        maxWidth={620}
        footer={
          <div className="flex items-center justify-between w-full">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {copied ? (
                <>
                  <Check size={14} className="text-emerald-600" />
                  <span className="text-emerald-700">Copied to Clipboard</span>
                </>
              ) : (
                <>
                  <Copy size={14} className="text-slate-500" />
                  <span>Copy Text</span>
                </>
              )}
            </button>
            <div className="flex items-center gap-2">
              {extraFooterAction}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex items-center justify-center px-4 py-1.5 text-xs font-semibold rounded-md bg-[#0f52ba] hover:bg-blue-800 text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-3">
          <div
            tabIndex={0}
            role="region"
            aria-label="Full Text Viewer"
            className="max-h-72 overflow-y-auto p-3.5 bg-slate-50 border border-slate-200 rounded-md text-[13px] leading-relaxed text-slate-900 whitespace-pre-wrap break-words font-normal focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {cleanText}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Preserves complete formatting, line breaks, and whitespace.</span>
            <span className="font-mono">{cleanText.length} characters</span>
          </div>
        </div>
      </Modal>
    </>
  );
}
