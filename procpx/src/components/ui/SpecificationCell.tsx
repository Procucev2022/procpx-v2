'use client';
// components/ui/SpecificationCell.tsx - Standardised Enterprise Specification Preview with Hover Tooltip Popover
import React from 'react';
import BoqDescriptionCell from '@/components/ui/BoqDescriptionCell';

interface SpecificationCellProps {
  specification?: string | null;
  lineNumber?: string | number;
  itemDescription?: string;
  maxWidth?: number | string;
  lineId?: string;
  emptyPlaceholder?: string;
  clampLines?: 1 | 2 | 3;
}

export default function SpecificationCell({
  specification,
  lineNumber,
  itemDescription,
  maxWidth = 220,
  lineId,
  emptyPlaceholder = '—',
  clampLines = 2,
}: SpecificationCellProps) {
  return (
    <BoqDescriptionCell
      text={specification}
      lineNumber={lineNumber}
      itemDescription={itemDescription}
      maxWidth={maxWidth}
      emptyPlaceholder={emptyPlaceholder}
      clampLines={clampLines}
    />
  );
}

