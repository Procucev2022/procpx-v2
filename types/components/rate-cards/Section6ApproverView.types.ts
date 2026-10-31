/* Shared declarations for components/rate-cards/Section6ApproverView.tsx. */

import type { AgreementDocumentData } from "@/components/rate-cards/AgreementPreviewModal";

export interface Section6Props {
  role?: 'PROJECT_APPROVER' | 'FINANCE_APPROVER' | 'CATEGORY_MANAGER';
  rateCardId?: string;
  vendorName?: string;
  vendorCode?: string;
  category?: string;
  vendorAcceptanceDate?: string;
  projectApproved?: boolean;
  financeApproved?: boolean;
  agreement?: AgreementDocumentData | null;
  items?: Array<{
    id?: string;
    itemCode?: string;
    description: string;
    uom: string;
    qty?: number;
    agreedRate?: number;
    rate?: number;
  }>;
  onApproveProject?: (comments: string) => void;
  onApproveFinance?: (comments: string) => void;
  onReject?: (comments: string) => void;
}
