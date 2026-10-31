/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Section5VendorAcceptance from '../src/components/rate-cards/Section5VendorAcceptance';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/components/rate-cards/AgreementPreviewModal', () => ({
  __esModule: true,
  default: ({ isOpen, onClose, agreement }: any) => isOpen
    ? <div role="dialog" aria-label="Agreement preview"><span>{agreement?.documentTitle || 'Agreement'}</span><button onClick={onClose}>Close agreement</button></div>
    : null,
}));

describe('rate card Section 5 vendor acceptance', () => {
  it('reviews a required agreement and sends verified vendor signature details', () => {
    const onAccept = jest.fn();
    const onReject = jest.fn();
    render(<Section5VendorAcceptance onAccept={onAccept} onReject={onReject} />);

    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.vendorAcceptanceVendorPortalView))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.gypsumFalseCeiling))).toBeInTheDocument();
    expect(document.body).toHaveTextContent((469750).toLocaleString());
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.authorizedVendorDigitalSignatureExecution))).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.iConfirmThatIAmAuthorizedToBind) })).toBeChecked();
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.acceptTermsDigitallySignAgreement) })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.reviewAgreementDocument) }));
    expect(screen.getByRole('dialog', { name: 'Agreement preview' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close agreement' }));
    expect(screen.queryByRole('dialog', { name: 'Agreement preview' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.fullNameOfAuthorizedRepresentative)), { target: { value: '  Priya Signatory  ' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.managingPartnerDirectorOrPowerOfAttorney)), { target: { value: '  Director  ' } });
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.addAnyFormalRemarksAcknowledgmentsOrExceptionsHere)), { target: { value: 'Terms accepted' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.acceptTermsDigitallySignAgreement) }));
    expect(onAccept).toHaveBeenCalledWith(UI_STRINGS.componentsRateCardsSection7FinalisedDetails.termsAccepted, expect.objectContaining({
      signedBy: 'Priya Signatory', designation: 'Director', signatureType: 'DIGITAL_VERIFIED', verified: true,
      signedAt: expect.any(String), signatureEvidenceId: expect.stringMatching(/^DSC-2026-VND-0006-\d{4}$/),
    }));
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.projectApprover) })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.rejectWithComments) }));
    expect(onReject).toHaveBeenCalledWith(UI_STRINGS.componentsRateCardsSection7FinalisedDetails.termsAccepted);
  });

  it('allows acceptance without signature when consent or signatory details are missing', () => {
    const onAccept = jest.fn();
    render(<Section5VendorAcceptance vendorCode="UP-3" onAccept={onAccept} agreement={{
      required: true, type: 'UPLOAD', signatureRequired: true, documentTitle: '', documentNumber: '', signature: null,
    }} />);

    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.masterRateCardAgreement))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.mRARateCardId))).toBeInTheDocument();
    expect(document.body).toHaveTextContent(uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.uploadedBilateralDocument));
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.acceptTermsDigitallySignAgreement) })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.iConfirmThatIAmAuthorizedToBind) }));
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.acceptRateCardSchedule) })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.fullNameOfAuthorizedRepresentative)), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.acceptRateCardSchedule) }));
    expect(onAccept).toHaveBeenCalledWith('', null);
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.projectApprover) })).toBeInTheDocument();
  });

  it('renders a direct schedule without agreement or signature and handles missing callbacks', () => {
    const onAccept = jest.fn();
    const onReject = jest.fn();
    render(<Section5VendorAcceptance agreement={{ required: false, type: 'NONE' }} items={[
      { id: '', itemCode: 'ITEM-0', description: 'Bare line', uom: 'EA', qty: 2, agreedRate: 25 },
    ]} onAccept={onAccept} onReject={onReject} />);
    expect(screen.getAllByText('Bare line')).toHaveLength(2);
    expect(screen.getByText('Review the buyer-accepted rates and formalise your acceptance to route to Level 1 Project Approver.')).toBeInTheDocument();
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.authorizedVendorDigitalSignatureExecution))).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.reviewAgreementDocument) })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.acceptRateCardSchedule) })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.rejectWithComments) }));
    expect(onReject).toHaveBeenCalledWith('');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.acceptRateCardSchedule) }));
    expect(onAccept).toHaveBeenCalledWith('', null);

    cleanup();
    const view = render(<Section5VendorAcceptance agreement={null} items={[]} />);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.rejectWithComments) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection5VendorAcceptance.acceptRateCardSchedule) }));
    expect(view.container).toBeInTheDocument();
  });
});
