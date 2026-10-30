/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AgreementPreviewModal from '../src/components/rate-cards/AgreementPreviewModal';

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

    expect(screen.getByText(/Master Rate Agreement/)).toBeInTheDocument();
    expect(screen.getAllByText('MRA-RC-1-REV1')).toHaveLength(2);
    expect(screen.getByText('Signature Pending')).toBeInTheDocument();
    expect(screen.getByText(/Vendor Code: VND-0006/)).toBeInTheDocument();
    expect(screen.getByText('01 Oct 2026 - 30 Sep 2027')).toBeInTheDocument();
    expect(screen.getByText('ITEM-1')).toBeInTheDocument();
    expect(screen.getByText('WIRE')).toBeInTheDocument();
    expect(screen.getByText('Cable tray').parentElement).toHaveTextContent('2');
    expect(screen.getByText('Copper wire').parentElement).toHaveTextContent('1');
    expect(screen.getByText('Switchgear').parentElement).toHaveTextContent('3');
    expect(screen.getByText('No rate item').parentElement).toHaveTextContent('1');
    expect(screen.getByText('Total Reference Value:').parentElement).toHaveTextContent('34');

    fireEvent.click(screen.getByRole('button', { name: /Print/ }));
    expect(print).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close Viewer' }));
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
    expect(screen.getByText('Digitally Signed')).toBeInTheDocument();
    expect(screen.getByText('North Star')).toBeInTheDocument();
    expect(screen.getByText(/Vendor Code: VND-42/)).toBeInTheDocument();
    expect(screen.getByText('Custom term')).toBeInTheDocument();
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('Director')).toBeInTheDocument();
    expect(screen.getByText('Ref: EVID-42')).toBeInTheDocument();
    expect(screen.getByText('29 Oct 2026')).toBeInTheDocument();

    render(<AgreementPreviewModal
      isOpen onClose={onClose} rateCardId="RC-FALLBACK" vendorName="Fallback Vendor" category="HVAC"
      agreement={{ required: true, type: 'TEMPLATE', signature: { signedBy: '', designation: '', signedAt: '', signatureType: 'DSC', signatureEvidenceId: '', verified: true } }}
    />);
    expect(screen.getByText('K. Ramakrishna')).toBeInTheDocument();
    expect(screen.getByText('Managing Partner / Authorized Signatory')).toBeInTheDocument();
    expect(screen.getByText('Ref: DSC-2026-VND-0006-8848')).toBeInTheDocument();
    expect(screen.getByText('24 Oct 2026, 12:00 IST')).toBeInTheDocument();
  });

  it('uses uploaded document defaults and shows pending signature for an unsigned upload', () => {
    render(<AgreementPreviewModal
      isOpen onClose={onClose} rateCardId="RC-UPLOAD" vendorName="Uploaded Vendor" category="Civil"
      agreement={{ required: true, type: 'UPLOAD', documentTitle: '', documentNumber: '', fileName: '', fileSize: '', uploadedAt: '', signature: { verified: false } as any }}
    />);

    expect(screen.getByText(/Master Rate Agreement/)).toBeInTheDocument();
    expect(screen.getByText('MRA-RC-UPLOAD-REV1')).toBeInTheDocument();
    expect(screen.getByText('Signature Pending')).toBeInTheDocument();
    expect(screen.getByText('Executed_Agreement_Document.pdf')).toBeInTheDocument();
    expect(screen.getByText(/File Size: 1\.8 MB.*22 Oct 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Uploaded formal document verified against Rate Card RC-UPLOAD/)).toBeInTheDocument();
    expect(screen.queryByText('MASTER RATE CARD AGREEMENT')).not.toBeInTheDocument();
  });

  it('renders uploaded file metadata and a verified signature badge', () => {
    render(<AgreementPreviewModal
      isOpen onClose={onClose} rateCardId="RC-UPLOAD-2" vendorName="Vendor Two" category="Plumbing"
      agreement={{ required: true, type: 'UPLOAD', documentTitle: 'Signed file', documentNumber: 'SIGNED-2', fileName: 'contract.pdf', fileSize: '2.4 MB', uploadedAt: '28 Oct 2026', signature: { verified: true } as any }}
    />);

    expect(screen.getByText('Signed file')).toBeInTheDocument();
    expect(screen.getByText('SIGNED-2')).toBeInTheDocument();
    expect(screen.getByText('Digitally Signed')).toBeInTheDocument();
    expect(screen.getByText('contract.pdf')).toBeInTheDocument();
    expect(screen.getByText(/File Size: 2\.4 MB.*28 Oct 2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Viewer' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
