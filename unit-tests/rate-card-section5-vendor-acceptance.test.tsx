/** @jest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import Section5VendorAcceptance from '../src/components/rate-cards/Section5VendorAcceptance';

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

    expect(screen.getByText('Vendor Acceptance (Vendor Portal View)')).toBeInTheDocument();
    expect(screen.getByText('Gypsum False Ceiling')).toBeInTheDocument();
    expect(document.body).toHaveTextContent((469750).toLocaleString());
    expect(screen.getByText('Authorized Vendor Digital Signature Execution')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /I confirm that I am authorized to bind/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Accept Terms & Digitally Sign Agreement' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Review Agreement Document' }));
    expect(screen.getByRole('dialog', { name: 'Agreement preview' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close agreement' }));
    expect(screen.queryByRole('dialog', { name: 'Agreement preview' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Full Name of Authorized Representative'), { target: { value: '  Priya Signatory  ' } });
    fireEvent.change(screen.getByPlaceholderText('Managing Partner, Director, or Power of Attorney'), { target: { value: '  Director  ' } });
    fireEvent.change(screen.getByPlaceholderText('Add any formal remarks, acknowledgments, or exceptions here...'), { target: { value: 'Terms accepted' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept Terms & Digitally Sign Agreement' }));
    expect(onAccept).toHaveBeenCalledWith('Terms accepted', expect.objectContaining({
      signedBy: 'Priya Signatory', designation: 'Director', signatureType: 'DIGITAL_VERIFIED', verified: true,
      signedAt: expect.any(String), signatureEvidenceId: expect.stringMatching(/^DSC-2026-VND-0006-\d{4}$/),
    }));
    expect(screen.getByRole('button', { name: /Rate Card Accepted & Routed to Project Approver/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reject with Comments' }));
    expect(onReject).toHaveBeenCalledWith('Terms accepted');
  });

  it('allows acceptance without signature when consent or signatory details are missing', () => {
    const onAccept = jest.fn();
    render(<Section5VendorAcceptance vendorCode="UP-3" onAccept={onAccept} agreement={{
      required: true, type: 'UPLOAD', signatureRequired: true, documentTitle: '', documentNumber: '', signature: null,
    }} />);

    expect(screen.getByText('Master Rate Card Agreement')).toBeInTheDocument();
    expect(screen.getByText('MRA-RC-2026-0006')).toBeInTheDocument();
    expect(document.body).toHaveTextContent(/Uploaded Bilateral Document/);
    expect(screen.getByRole('button', { name: 'Accept Terms & Digitally Sign Agreement' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /I confirm that I am authorized to bind/ }));
    expect(screen.getByRole('button', { name: 'Accept Rate Card Schedule' })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Full Name of Authorized Representative'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept Rate Card Schedule' }));
    expect(onAccept).toHaveBeenCalledWith('', null);
    expect(screen.getByRole('button', { name: /Rate Card Accepted & Routed to Project Approver/ })).toBeInTheDocument();
  });

  it('renders a direct schedule without agreement or signature and handles missing callbacks', () => {
    const onAccept = jest.fn();
    const onReject = jest.fn();
    render(<Section5VendorAcceptance agreement={{ required: false, type: 'NONE' }} items={[
      { id: '', itemCode: 'ITEM-0', description: 'Bare line', uom: 'EA', qty: 2, agreedRate: 25 },
    ]} onAccept={onAccept} onReject={onReject} />);
    expect(screen.getAllByText('Bare line')).toHaveLength(2);
    expect(screen.getByText('Review the buyer-accepted rates and formalise your acceptance to route to Level 1 Project Approver.')).toBeInTheDocument();
    expect(screen.queryByText('Authorized Vendor Digital Signature Execution')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review Agreement Document' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept Rate Card Schedule' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reject with Comments' }));
    expect(onReject).toHaveBeenCalledWith('');
    fireEvent.click(screen.getByRole('button', { name: 'Accept Rate Card Schedule' }));
    expect(onAccept).toHaveBeenCalledWith('', null);

    cleanup();
    const view = render(<Section5VendorAcceptance agreement={null} items={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject with Comments' }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept Rate Card Schedule' }));
    expect(view.container).toBeInTheDocument();
  });
});
