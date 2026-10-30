/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Section6ApproverView from '../src/components/rate-cards/Section6ApproverView';

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

    expect(screen.getByText('Rate Card Approval (Level 1: Project Approver View)')).toBeInTheDocument();
    expect(screen.getByText('Level 1: Project Pending')).toBeInTheDocument();
    expect(screen.getByText('Digitally Signed by K. Ramakrishna')).toBeInTheDocument();
    expect(screen.getByText('1. Buyer Accepted')).toBeInTheDocument();
    expect(screen.getByText('2. Vendor Accepted')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View Executed Agreement' }));
    expect(screen.getByRole('dialog', { name: 'Agreement preview' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close agreement' }));
    expect(screen.queryByRole('dialog', { name: 'Agreement preview' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Add formal governance comments before signing off...'), { target: { value: 'Project scope verified' } });
    fireEvent.click(screen.getByRole('button', { name: /Approve & Route to Finance/ }));
    expect(onApproveProject).toHaveBeenCalledWith('Project scope verified');
    await waitFor(() => expect(screen.getByText('Level 2: Finance Pending')).toBeInTheDocument());
    expect(screen.getByText('Approved by Project Approver')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Add formal governance comments before signing off...'), { target: { value: 'Budget confirmed' } });
    fireEvent.click(screen.getByRole('button', { name: /Approve & Activate Rate Card/ }));
    expect(onApproveFinance).toHaveBeenCalledWith('Budget confirmed');
    expect(await screen.findByText('Fully Activated')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reject & Return for Correction' }));
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

    await waitFor(() => expect(screen.getByText('Rate Card Approval (Level 2: Finance Approver View)')).toBeInTheDocument());
    expect(screen.getByText('Agreement Unsigned — Signature Evidence Required')).toBeInTheDocument();
    expect(screen.getByText(/cannot be treated as fully active without valid signature evidence/)).toBeInTheDocument();
    expect(screen.getByText('Approved by Project Approver')).toBeInTheDocument();
    expect(screen.getByText('Action Required')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Add formal governance comments before signing off...'), { target: { value: 'Finance reviewed' } });
    fireEvent.click(screen.getByRole('button', { name: /Approve & Activate Rate Card/ }));
    expect(onApproveFinance).toHaveBeenCalledWith('Finance reviewed');
    expect(await screen.findByText('Fully Activated')).toBeInTheDocument();
  });

  it('shows direct schedules when no agreement is required and supports pre-approved state without callbacks', async () => {
    render(<Section6ApproverView role="CATEGORY_MANAGER" rateCardId="RC-CM-2" vendorName="North Supplies"
      vendorCode="NS-2" category="Power" vendorAcceptanceDate="29 Oct 2026" projectApproved financeApproved
      agreement={{ required: false, type: 'NONE', documentTitle: 'No agreement' }} items={[]} />);

    expect(screen.getByText('RC-CM-2')).toBeInTheDocument();
    expect(screen.getByText('North Supplies')).toBeInTheDocument();
    expect(screen.getByText('No Formal Agreement Required')).toBeInTheDocument();
    expect(screen.getByText('Direct Rate Card Schedule')).toBeInTheDocument();
    expect(screen.getByText('Standard Schedule of Rates (No formal bilateral agreement document required)')).toBeInTheDocument();
    expect(screen.getByText('Direct Schedule Accepted')).toBeInTheDocument();
    expect(screen.getByText('Fully Activated')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View Executed Agreement' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Approve & Activate Rate Card/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reject & Return for Correction' }));
    expect(screen.getByText('Fully Activated')).toBeInTheDocument();
  });
});
