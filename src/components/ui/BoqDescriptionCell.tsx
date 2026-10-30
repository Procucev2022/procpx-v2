'use client';
// src/components/ui/BoqDescriptionCell.tsx
// Standardized Enterprise Reusable BOQ Description Preview & Tooltip Popover Component
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Copy, Check, Info } from 'lucide-react';
import type { BoqDescriptionCellProps } from "@app-types/components/ui/BoqDescriptionCell.types";
export type { BoqDescriptionCellProps };


export default function BoqDescriptionCell({
  text,
  title = 'BOQ Description',
  contextLabel,
  itemCode,
  itemDescription,
  lineNumber,
  maxWidth = 220,
  clampLines = 2,
  emptyPlaceholder = '—',
  className = '',
  showIcon = false,
}: BoqDescriptionCellProps) {
  const [mounted, setMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; placeAbove: boolean }>({
    top: 0,
    left: 0,
    placeAbove: false,
  });

  const triggerRef = useRef<HTMLDivElement | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  const cleanText = (text || '').trim();

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipWidth = 380;
    const estimatedHeight = 180;
    const margin = 6;

    let left = rect.left;
    if (left + tooltipWidth > window.innerWidth - 16) {
      left = Math.max(16, window.innerWidth - tooltipWidth - 16);
    }
    if (left < 16) left = 16;

    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < estimatedHeight && rect.top > estimatedHeight;

    const top = placeAbove
      ? Math.max(10, rect.top - margin)
      : Math.min(window.innerHeight - 40, rect.bottom + margin);

    setCoords({ top, left, placeAbove });
  }, []);

  // Update position on window scroll or resize when visible
  useEffect(() => {
    if (!isVisible) return;
    const handleScrollOrResize = () => {
      updatePosition();
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isVisible, updatePosition]);

  if (!cleanText || cleanText === '—' || cleanText === '-') {
    return (
      <span className="text-slate-400 italic text-xs select-none">
        {emptyPlaceholder}
      </span>
    );
  }

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    updatePosition();
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 150);
  };

  const handleTooltipMouseEnter = () => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
  };

  const handleTooltipMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 150);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    updatePosition();
    setIsVisible((prev) => !prev);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      updatePosition();
      setIsVisible((prev) => !prev);
    } else if (e.key === 'Escape') {
      setIsVisible(false);
    }
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(cleanText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const maxWidthStyle = typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth;

  return (
    <>
      <div
        ref={triggerRef}
        role="button"
        tabIndex={0}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleMouseEnter}
        onBlur={handleMouseLeave}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-label={`${title}: ${cleanText.slice(0, 60)}...`}
        className={`group inline-flex items-start gap-1 cursor-pointer rounded px-1 py-0.5 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 hover:bg-blue-50/50 ${className}`}
        style={{
          maxWidth: maxWidthStyle,
          width: '100%',
        }}
      >
        {showIcon && (
          <FileText
            size={12}
            className="text-slate-400 group-hover:text-blue-600 shrink-0 mt-0.5 transition-colors"
          />
        )}
        <span
          className="text-[12px] leading-snug text-slate-700 group-hover:text-slate-900 transition-colors w-full font-normal"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: clampLines,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            wordBreak: 'break-word',
          }}
        >
          {cleanText}
        </span>
      </div>

      {mounted &&
        isVisible &&
        createPortal(
          <div
            onMouseEnter={handleTooltipMouseEnter}
            onMouseLeave={handleTooltipMouseLeave}
            className="fixed z-[99999] pointer-events-auto animate-in fade-in zoom-in-95 duration-100"
            style={{
              top: coords.top,
              left: coords.left,
              transform: coords.placeAbove ? 'translateY(-100%)' : 'none',
              width: 'min(420px, calc(100vw - 32px))',
            }}
          >
            <div
              className="bg-white rounded-lg border border-slate-300 p-3.5 text-left text-slate-900"
              style={{
                boxShadow:
                  '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04)',
              }}
            >
              {/* Tooltip Header */}
              <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-100">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                    {title}
                  </span>
                  {contextLabel && (
                    <span className="text-[10px] text-slate-600 font-semibold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 truncate">
                      {contextLabel}
                    </span>
                  )}
                  {lineNumber && (
                    <span className="text-[10px] text-slate-500 font-mono">
                      (Line #{lineNumber})
                    </span>
                  )}
                  {itemCode && (
                    <span className="text-[10px] font-mono font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 truncate">
                      {itemCode}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-blue-700 bg-slate-50 hover:bg-blue-50 px-2 py-0.5 rounded border border-slate-200 transition-colors shrink-0"
                  title={`Copy full ${title.toLowerCase()} to clipboard`}
                >
                  {copied ? (
                    <>
                      <Check size={12} className="text-emerald-600" />
                      <span className="text-emerald-700 font-semibold">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={12} className="text-slate-400" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              {/* Context: Item Description if available */}
              {itemDescription && (
                <div className="text-[11px] text-slate-500 mb-2 truncate" title={itemDescription}>
                  <span className="font-medium text-slate-600">Item:</span> {itemDescription}
                </div>
              )}

              {/* Full Untruncated Body */}
              <div
                tabIndex={0}
                role="region"
                aria-label={`Full ${title}`}
                className="text-[12px] leading-relaxed text-slate-800 whitespace-pre-wrap break-words max-h-60 overflow-y-auto pr-1 select-text font-normal border-l-2 border-blue-400 pl-2.5 my-1"
              >
                {cleanText}
              </div>

              {/* Tooltip Footer */}
              <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 select-none">
                <span className="flex items-center gap-1">
                  <Info size={11} className="text-slate-400" /> Complete untruncated record
                </span>
                <span className="font-mono">{cleanText.length} characters</span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
