/** @jest-environment jsdom */
import { uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Section6ApproverView from '../src/components/rate-cards/Section6ApproverView';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('../src/components/rate-cards/AgreementPreviewModal', () => ({
  __esModule: true,
  default: ({ isOpen, onClose, agreement }: any) => isOpen
    ? <div role="dialog" aria-label="Agreement preview"><span>{agreement?.documentTitle || 'Agreement'}</span><button onClick={onClose}>Close agreement</button></div>
    : null,
}));

describe('rate card Section 6 approver view', () => {
  it('moves a project approval through finance activation with recorded comments', async () => {
    const onApproveProject = jest.fn();
    const onApproveFinance = jest.fn();
    const onReject = jest.fn();
    render(<Section6ApproverView onApproveProject={onApproveProject} onApproveFinance={onApproveFinance} onReject={onReject} />);

    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.rateCardApprovalLevel1ProjectApproverView))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.level1ProjectPending))).toBeInTheDocument();
    expect(screen.getByText('Digitally Signed by K. Ramakrishna')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.copy1u5kpg2))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.copyhm65za))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.viewExecutedAgreement) }));
    expect(screen.getByRole('dialog', { name: 'Agreement preview' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close agreement' }));
    expect(screen.queryByRole('dialog', { name: 'Agreement preview' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.addFormalGovernanceCommentsBeforeSigningOff)), { target: { value: 'Project scope verified' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.approveRouteToFinanceLevel1Project) }));
    expect(onApproveProject).toHaveBeenCalledWith('Project scope verified');
    await waitFor(() => expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.level2FinancePending))).toBeInTheDocument());
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.approvedByProjectApprover))).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.addFormalGovernanceCommentsBeforeSigningOff)), { target: { value: 'Budget confirmed' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.approveActivateRateCardLevel2Finance) }));
    expect(onApproveFinance).toHaveBeenCalledWith('Budget confirmed');
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.fullyActivated))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.rejectReturnForCorrection) }));
    expect(onReject).toHaveBeenCalledWith('Budget confirmed');
  });

  it('treats finance approvers as having completed Level 1 and flags an unsigned required agreement', async () => {
    const onApproveFinance = jest.fn();
    render(<Section6ApproverView role="FINANCE_APPROVER" agreement={{
      required: true, type: 'UPLOAD', documentTitle: 'Signed contract required', signatureRequired: true,
      signature: {
        signedBy: 'Vendor Signatory', designation: 'Authorized Signatory', signedAt: '2026-01-10T12:00:00.000Z',
        signatureType: 'DSC', signatureEvidenceId: 'signature-evidence-1', verified: false,
      },
    }} onApproveFinance={onApproveFinance} items={[]} />);

    await waitFor(() => expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.rateCardApprovalLevel2FinanceApproverView))).toBeInTheDocument());
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.agreementUnsignedSignatureEvidenceRequired))).toBeInTheDocument();
    expect(screen.getByText(/cannot be treated as fully active without valid signature evidence/)).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.approvedByProjectApprover))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.actionRequired))).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.addFormalGovernanceCommentsBeforeSigningOff)), { target: { value: 'Finance reviewed' } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.approveActivateRateCardLevel2Finance) }));
    expect(onApproveFinance).toHaveBeenCalledWith('Finance reviewed');
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.fullyActivated))).toBeInTheDocument();
  });

  it('shows direct schedules when no agreement is required and supports pre-approved state without callbacks', async () => {
    render(<Section6ApproverView role="CATEGORY_MANAGER" rateCardId="RC-CM-2" vendorName="North Supplies"
      vendorCode="NS-2" category="Power" vendorAcceptanceDate="29 Oct 2026" projectApproved financeApproved
      agreement={{ required: false, type: 'NONE', documentTitle: 'No agreement' }} items={[]} />);

    expect(screen.getByText('RC-CM-2')).toBeInTheDocument();
    expect(screen.getByText('North Supplies')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.noFormalAgreementRequired))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.directRateCardSchedule))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.standardScheduleOfRatesNoFormalBilateralAgreementDocumentRequired))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.directScheduleAccepted))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.fullyActivated))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: uiStringPattern(UI_STRINGS.common.viewExecutedAgreement) })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.rejectReturnForCorrection) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.rejectReturnForCorrection) }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsRateCardsSection6ApproverView.fullyActivated))).toBeInTheDocument();
  });
});
