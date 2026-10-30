/* Shared declarations for components/rate-cards/BuyerAcceptanceWorkspace.tsx. */

import type { AgreementDocumentData } from "@/components/rate-cards/AgreementPreviewModal";

export interface BuyerAcceptanceItem {
  id: string;
  itemCode: string;
  description: string;
  specification?: string;
  uom: string;
  qty: number;
  vendorQuoteRate: number;
}

export type AgreementPreparationMode = 'NONE' | 'TEMPLATE' | 'UPLOAD';

export interface BuyerAcceptanceWorkspaceProps {
  rateCardId?: string;
  vendorName?: string;
  vendorCode?: string;
  category?: string;
  round?: string;
  vendorQuoteTotal?: number;
  receivedDate?: string;
  items?: BuyerAcceptanceItem[];
  onAccept: (remarks: string, agreementData?: AgreementDocumentData | null) => void;
  onCancel: () => void;
}
