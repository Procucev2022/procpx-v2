'use client';
// components/ui/SpecificationCell.tsx - Standardised Enterprise Specification Preview with Hover Tooltip Popover
import React from 'react';
import BoqDescriptionCell from '@/components/ui/BoqDescriptionCell';
import type { SpecificationCellProps } from "@app-types/components/ui/SpecificationCell.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";


export default function SpecificationCell({
  specification,
  lineNumber,
  itemDescription,
  maxWidth = 220,
  lineId,
  emptyPlaceholder = UI_STRINGS.common.copy4s9bsz,
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

