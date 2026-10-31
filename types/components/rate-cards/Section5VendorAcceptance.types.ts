/* Shared declarations for components/rate-cards/Section5VendorAcceptance.tsx. */

import type { AgreementDocumentData } from "@/components/rate-cards/AgreementPreviewModal";

export interface VendorAcceptanceItem {
  id: string;
  itemCode: string;
  description: string;
  specification?: string;
  uom: string;
  qty: number;
  agreedRate: number;
}

export interface Section5Props {
  rateCardId?: string;
  category?: string;
  validity?: string;
  buyerAcceptanceDate?: string;
  vendorName?: string;
  vendorCode?: string;
  items?: VendorAcceptanceItem[];
  agreement?: AgreementDocumentData | null;
  onAccept?: (
    remarks: string,
    signature?: {
      signedBy: string;
      designation: string;
      signatureEvidenceId: string;
      signatureType: 'DIGITAL_VERIFIED' | 'AADHAAR_ESIGN' | 'DSC';
      signedAt: string;
      verified: boolean;
    } | null
  ) => void;
  onReject?: (remarks: string) => void;
}
