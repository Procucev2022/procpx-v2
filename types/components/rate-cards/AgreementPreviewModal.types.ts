/* Shared declarations for components/rate-cards/AgreementPreviewModal.tsx. */

export interface AgreementDocumentData {
  required: boolean;
  type: 'NONE' | 'TEMPLATE' | 'UPLOAD';
  templateId?: string;
  documentTitle?: string;
  documentNumber?: string;
  fileName?: string;
  fileSize?: string;
  version?: number;
  generatedAt?: string;
  uploadedAt?: string;
  governingLaw?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  paymentTerms?: string;
  defectLiabilityMonths?: number;
  signatureRequired?: boolean;
  status?: 'DRAFT' | 'SENT_TO_VENDOR' | 'VENDOR_ACCEPTED' | 'SIGNED' | 'REJECTED';
  signature?: {
    signedBy: string;
    designation: string;
    signedAt: string;
    signatureType: 'DIGITAL_VERIFIED' | 'AADHAAR_ESIGN' | 'DSC';
    signatureEvidenceId: string;
    verified: boolean;
  } | null;
}

export interface AgreementPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  rateCardId: string;
  vendorName: string;
  vendorCode?: string;
  category: string;
  validity?: string;
  items?: Array<{
    id?: string;
    itemCode?: string;
    description: string;
    uom: string;
    qty?: number;
    agreedRate?: number;
    rate?: number;
    vendorQuoteRate?: number;
  }>;
  agreement?: AgreementDocumentData | null;
}
