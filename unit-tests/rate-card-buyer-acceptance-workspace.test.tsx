/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import BuyerAcceptanceWorkspace from '../src/components/rate-cards/BuyerAcceptanceWorkspace';

jest.mock('../src/components/rate-cards/AgreementPreviewModal', () => ({
  __esModule: true,
  default: ({ isOpen, onClose, agreement, items }: any) => isOpen
    ? <div role="dialog" aria-label="Agreement preview"><output>{JSON.stringify({ agreement, items })}</output><button onClick={onClose}>Close preview</button></div>
    : null,
}));

const quoteItems = [
  { id: '1', itemCode: 'ITEM-1', description: 'Line one', specification: 'Detailed line one', uom: 'EA', qty: 2, vendorQuoteRate: 30 },
  { id: '2', itemCode: 'ITEM-2', description: 'Line two', uom: 'HR', qty: 3, vendorQuoteRate: 40 },
];

describe('rate card buyer acceptance workspace', () => {
  it('routes an unconfirmed direct schedule only after governance confirmation', () => {
    const onAccept = jest.fn();
    const onCancel = jest.fn();
    const { container } = render(<BuyerAcceptanceWorkspace items={quoteItems} onAccept={onAccept} onCancel={onCancel} />);

    expect(screen.getByRole('heading', { name: 'Buyer Acceptance (Category Manager)' })).toBeInTheDocument();
    expect(screen.getByText('Contract Rate Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Line one')).toBeInTheDocument();
    expect(screen.getByText('Detailed line one')).toBeInTheDocument();
    expect(screen.getByText('Agreed Valuation: ₹ 180')).toBeInTheDocument();

    const confirmation = screen.getByRole('checkbox', { name: /I confirm as Category Manager/ });
    fireEvent.click(confirmation);
    const acceptButton = screen.getByRole('button', { name: /Accept Quote & Route to Vendor Acceptance/ });
    expect(acceptButton).toBeDisabled();
    fireEvent.click(acceptButton);
    expect(onAccept).not.toHaveBeenCalled();
    fireEvent.click(confirmation);
    fireEvent.change(screen.getByPlaceholderText(/Add remarks before accepting/), { target: { value: 'Rates validated' } });
    fireEvent.click(screen.getByRole('button', { name: /Accept Quote & Route to Vendor Acceptance/ }));
    expect(onAccept).toHaveBeenCalledWith('Rates validated', null);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel & Return to Negotiation' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('prepares a generated agreement, edits its template, previews it, and accepts it', () => {
    const onAccept = jest.fn();
    const { container } = render(<BuyerAcceptanceWorkspace rateCardId="RC-TEMPLATE" category="Retail" vendorName="Acme Stores" items={[]} onAccept={onAccept} onCancel={jest.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: /Generate from Template/ }));
    expect(screen.getByRole('button', { name: 'Preview Agreement Document' })).toBeInTheDocument();
    fireEvent.change(container.querySelector('input[type="text"]')!, { target: { value: 'Negotiated Terms' } });
    fireEvent.change(container.querySelector('select')!, { target: { value: 'ANNUAL_STORE_FITOUT_V2' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Require Authorized Vendor Digital Signature/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Preview Agreement Document' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review Template Preview' }));
    const dialog = screen.getByRole('dialog', { name: 'Agreement preview' });
    expect(dialog).toHaveTextContent('Negotiated Terms');
    expect(dialog).toHaveTextContent('ANNUAL_STORE_FITOUT_V2');
    expect(dialog).toHaveTextContent('"items":[]');
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));

    fireEvent.click(screen.getByRole('button', { name: /Accept Quote & Send Generated Agreement/ }));
    expect(onAccept).toHaveBeenCalledWith('', expect.objectContaining({
      required: true, type: 'TEMPLATE', templateId: 'ANNUAL_STORE_FITOUT_V2', documentTitle: 'Negotiated Terms',
      documentNumber: 'MRA-RC-TEMPLATE-REV1', fileName: 'Negotiated_Terms.pdf', signatureRequired: false, signature: null,
    }));
  });

  it('accepts a sample upload and previews uploaded metadata with signature required', () => {
    const onAccept = jest.fn();
    render(<BuyerAcceptanceWorkspace rateCardId="RC-UPLOAD" category="Civil Works" vendorName="Build Right" onAccept={onAccept} onCancel={jest.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: /Upload Agreement Doc/ }));
    expect(screen.getByText('No file selected yet')).toBeInTheDocument();
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [] } });
    fireEvent.click(screen.getByRole('button', { name: 'Attach Sample PDF' }));
    expect(screen.getByText('MRA_Civil_Works_Build_Right_FY26-27.pdf')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preview Document Metadata' }));
    const dialog = screen.getByRole('dialog', { name: 'Agreement preview' });
    expect(dialog).toHaveTextContent('MRA_Civil_Works_Build_Right_FY26-27.pdf');
    expect(dialog).toHaveTextContent('"signatureRequired":true');
    fireEvent.click(screen.getByRole('button', { name: 'Close preview' }));
    fireEvent.click(screen.getByRole('button', { name: /Accept Quote & Send Uploaded Agreement/ }));
    expect(onAccept).toHaveBeenCalledWith('', expect.objectContaining({
      type: 'UPLOAD', documentTitle: 'Master Rate Agreement — Civil Works — Build Right',
      fileName: 'MRA_Civil_Works_Build_Right_FY26-27.pdf', fileSize: '2.1 MB', signatureRequired: true,
      uploadedAt: expect.any(String),
    }));
  });

  it('uses uploaded file metadata and allows reverting to a direct schedule', () => {
    const onAccept = jest.fn();
    const { container } = render(<BuyerAcceptanceWorkspace category="Electrical" vendorName="Volt Supply" onAccept={onAccept} onCancel={jest.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: /Upload Agreement Doc/ }));
    const file = new File(['contract'], 'signed-agreement.pdf', { type: 'application/pdf' });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(screen.getByText('signed-agreement.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Attach Sample PDF' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Require Authorized Vendor Digital Signature/ }));
    fireEvent.click(screen.getByRole('radio', { name: /No Formal Agreement/ }));
    expect(screen.queryByRole('button', { name: 'Preview Agreement Document' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Accept Quote & Route to Vendor Acceptance/ }));
    expect(onAccept).toHaveBeenCalledWith('', null);
  });
});
