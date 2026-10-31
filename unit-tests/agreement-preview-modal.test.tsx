/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AgreementPreviewModal from '../src/components/rate-cards/AgreementPreviewModal';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


const onClose = jest.fn();
const originalPrint = window.print;

describe('rate card agreement preview modal', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => Object.defineProperty(window, 'print', { configurable: true, value: originalPrint }));

  it('renders nothing while closed', () => {
    const { container } = render(<AgreementPreviewModal isOpen={false} onClose={onClose} rateCardId="RC-1" vendorName="Acme" category="Electrical" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the default formal template, calculates rate precedence and prints or closes', () => {
    const print = jest.fn();
    Object.defineProperty(window, 'print', { configurable: true, value: print });
    render(<AgreementPreviewModal
      isOpen onClose={onClose} rateCardId="RC-1" vendorName="Acme Electrical" category="Electrical"
      items={[
        { description: 'Cable tray', uom: 'm', qty: 2, agreedRate: 10, rate: 20, vendorQuoteRate: 30 },
        { id: 'item-2', itemCode: 'WIRE', description: 'Copper wire', uom: 'm', qty: 0, rate: 5 },
        { description: 'Switchgear', uom: 'set', qty: 3, vendorQuoteRate: 3 },
        { description: 'No rate item', uom: 'ea' },
      ]}
    />);

    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.masterRateAgreement))).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.mRARateCardId))).toHaveLength(2);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsAgreementPreviewModal.signaturePending))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.vendorCode2))).toBeInTheDocument();
    expect(screen.getByText('01 Oct 2026 - 30 Sep 2027')).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.componentsRateCardsAgreementPreviewModal.iTEMValue1)).length).toBeGreaterThan(0);
    expect(screen.getByText('WIRE')).toBeInTheDocument();
    expect(screen.getByText('Cable tray').parentElement).toHaveTextContent(uiStringPattern(UI_STRINGS.common.copyf9vgt1));
    expect(screen.getByText('Copper wire').parentElement).toHaveTextContent(uiStringPattern(UI_STRINGS.common.copyefwnq4));
    expect(screen.getByText('Switchgear').parentElement).toHaveTextContent(uiStringPattern(UI_STRINGS.common.copyezvv42));
    expect(screen.getByText('No rate item').parentElement).toHaveTextContent(uiStringPattern(UI_STRINGS.common.copyefwnq4));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsAgreementPreviewModal.totalReferenceValue)).parentElement).toHaveTextContent('34');

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsAgreementPreviewModal.print) }));
    expect(print).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsAgreementPreviewModal.closeViewer) }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders custom signed template details and signature fallbacks', () => {
    render(<AgreementPreviewModal
      isOpen onClose={onClose} rateCardId="RC-2026-10" vendorName="North Star" vendorCode="VND-42"
      category="HVAC" validity="Custom term" agreement={{
        required: true, type: 'TEMPLATE', documentTitle: 'Executed HVAC Agreement', documentNumber: 'DOC-42',
        signature: { signedBy: 'Asha Rao', designation: 'Director', signedAt: '29 Oct 2026', signatureType: 'DSC', signatureEvidenceId: 'EVID-42', verified: true },
      }}
    />);

    expect(screen.getByText('Executed HVAC Agreement')).toBeInTheDocument();
    expect(screen.getAllByText('DOC-42')).toHaveLength(2);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsAgreementPreviewModal.digitallySigned))).toBeInTheDocument();
    expect(screen.getByText('North Star')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.vendorCode2))).toBeInTheDocument();
    expect(screen.getByText('Custom term')).toBeInTheDocument();
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('Director')).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.ref), { selector: 'div.font-mono' }).some((element) => element.textContent?.includes('EVID-42'))).toBe(true);
    expect(screen.getByText('29 Oct 2026')).toBeInTheDocument();

    render(<AgreementPreviewModal
      isOpen onClose={onClose} rateCardId="RC-FALLBACK" vendorName="Fallback Vendor" category="HVAC"
      agreement={{ required: true, type: 'TEMPLATE', signature: { signedBy: '', designation: '', signedAt: '', signatureType: 'DSC', signatureEvidenceId: '', verified: true } }}
    />);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsAgreementPreviewModal.kRamakrishna))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsAgreementPreviewModal.managingPartnerAuthorizedSignatory))).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.ref), { selector: 'div.font-mono' }).some((element) => element.textContent?.includes('DSC-2026-VND-0006-8848'))).toBe(true);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsAgreementPreviewModal.copy1seojss))).toBeInTheDocument();
  });

  it('uses uploaded document defaults and shows pending signature for an unsigned upload', () => {
    render(<AgreementPreviewModal
      isOpen onClose={onClose} rateCardId="RC-UPLOAD" vendorName="Uploaded Vendor" category="Civil"
      agreement={{ required: true, type: 'UPLOAD', documentTitle: '', documentNumber: '', fileName: '', fileSize: '', uploadedAt: '', signature: { verified: false } as any }}
    />);

    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.masterRateAgreement))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.mRARateCardId))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsAgreementPreviewModal.signaturePending))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsAgreementPreviewModal.executedAgreementDocumentPdf))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.copyy2zker))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsAgreementPreviewModal.uploadedFormalDocumentVerifiedAgainstRateCard))).toBeInTheDocument();
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.componentsRateCardsAgreementPreviewModal.mASTERRATECARDAGREEMENT))).not.toBeInTheDocument();
  });

  it('renders uploaded file metadata and a verified signature badge', () => {
    render(<AgreementPreviewModal
      isOpen onClose={onClose} rateCardId="RC-UPLOAD-2" vendorName="Vendor Two" category="Plumbing"
      agreement={{ required: true, type: 'UPLOAD', documentTitle: 'Signed file', documentNumber: 'SIGNED-2', fileName: 'contract.pdf', fileSize: '2.4 MB', uploadedAt: '28 Oct 2026', signature: { verified: true } as any }}
    />);

    expect(screen.getByText('Signed file')).toBeInTheDocument();
    expect(screen.getByText('SIGNED-2')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsAgreementPreviewModal.digitallySigned))).toBeInTheDocument();
    expect(screen.getByText('contract.pdf')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsAgreementPreviewModal.fileSize))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsAgreementPreviewModal.closeViewer) }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
