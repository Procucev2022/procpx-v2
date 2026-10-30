/** @jest-environment jsdom */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import Breadcrumbs from '../src/components/ui/Breadcrumbs';
import BoqDescriptionCell from '../src/components/ui/BoqDescriptionCell';
import Card from '../src/components/ui/Card';
import ContextBanner from '../src/components/ui/ContextBanner';
import EmptyState from '../src/components/ui/EmptyState';
import FormSection from '../src/components/ui/FormSection';
import LongTextCell from '../src/components/ui/LongTextCell';
import Modal from '../src/components/ui/Modal';
import PageHeader from '../src/components/ui/PageHeader';
import SpecificationCell from '../src/components/ui/SpecificationCell';
import StatusBadge from '../src/components/ui/StatusBadge';
import { SummaryCard, SummaryCardGrid } from '../src/components/ui/SummaryCard';
import Stepper from '../src/components/ui/Stepper';
import { ToastProvider, useToast } from '../src/components/ui/Toast';
import WizardStepper from '../src/components/ui/WizardStepper';
import WorkflowStageNav from '../src/components/ui/WorkflowStageNav';

describe('small shared UI components', () => {
  it('renders linked breadcrumbs, current crumb and crumbs without destinations', () => {
    render(<Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Draft' }, { label: 'Current', href: '/current' }]} />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Draft')).toHaveClass('current');
    expect(screen.getByText('Current')).toHaveClass('current');
    expect(screen.getAllByText('/')).toHaveLength(2);
  });

  it('renders context values with and without optional icons', () => {
    render(<ContextBanner items={[{ label: 'Project', value: 'P-1', icon: <b>i</b> }, { label: 'Status', value: 'Open' }]} />);
    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(screen.getByText('i')).toBeInTheDocument();
    expect(screen.getByText('P-1')).toHaveClass('context-value');
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('renders card header variants, optional content and no-padding body', () => {
    const { rerender, container } = render(<Card title="Overview" subtitle="Summary" badge={<b>Ready</b>} action={<button>Open</button>}>Body</Card>);
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(container.querySelector('.card-body')).toHaveTextContent('Body');

    rerender(<Card title={<h4>Custom title</h4>} noPadding className="custom" style={{ color: 'red' }}>Plain body</Card>);
    expect(screen.getByRole('heading', { name: 'Custom title' })).toBeInTheDocument();
    expect(container.querySelector('.card.custom')).toHaveStyle({ color: 'rgb(255, 0, 0)' });
    expect(container.querySelector('.card-body')).toBeNull();
    rerender(<Card>Headerless</Card>);
    expect(container.querySelector('.card-header')).toBeNull();
  });

  it('renders EmptyState icon and action variants', () => {
    const onAction = jest.fn();
    const { rerender } = render(<EmptyState title="No rows" description="Try again" />);
    expect(screen.getByText('No rows')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<EmptyState icon={<b>custom icon</b>} title="Empty" description="Nothing here" actionText="Create" onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText('custom icon')).toBeInTheDocument();

    rerender(<EmptyState title="Empty" description="Nothing here" actionText="Visit" actionHref="/new" onAction={onAction} />);
    expect(screen.getByRole('link', { name: 'Visit' })).toHaveAttribute('href', '/new');
  });

  it('renders all StatusBadge status mappings and size variants', () => {
    const expected = [
      ['draft', 'DRAFT', 'status-draft'],
      ['under_review', 'UNDER REVIEW', 'status-under-review'],
      ['award_pending', 'AWARD PENDING', 'status-under-review'],
      ['award_recommended', 'AWARD PENDING', 'status-under-review'],
      ['released', 'RELEASED', 'status-released'],
      ['submitted', 'RELEASED', 'status-released'],
      ['response_open', 'RESPONSE OPEN', 'status-response-open'],
      ['vendor_response_open', 'RESPONSE OPEN', 'status-response-open'],
      ['comparison', 'COMPARISON', 'status-comparison'],
      ['negotiation', 'NEGOTIATION', 'status-negotiation'],
      ['rate_locked', 'RATE LOCKED', 'status-rate-locked'],
      ['final_rate_locked', 'RATE LOCKED', 'status-rate-locked'],
      ['approved', 'ACTIVE / APPROVED', 'status-approved'],
      ['awarded', 'AWARDED', 'status-approved'],
      ['cancelled', 'CANCELLED', 'status-cancelled'],
      ['rejected', 'REJECTED', 'status-cancelled'],
      ['round_1_buyer_offer', 'BUYER RC OFFER-1', 'status-released'],
      ['sent_to_vendor', 'BUYER RC OFFER-1', 'status-released'],
      ['round_1_vendor_quote', 'VENDOR RC QUOTE-1 RECEIVED', 'status-negotiation'],
      ['round_2_buyer_offer', 'BUYER RC OFFER-2', 'status-released'],
      ['round_2_vendor_quote', 'VENDOR RC QUOTE-2 RECEIVED', 'status-negotiation'],
      ['final_vendor_offer_accepted', 'FINAL VENDOR OFFER ACCEPTED \u2014 CM ACCEPTANCE PENDING', 'status-rate-locked'],
      ['category_manager_accepted', 'CATEGORY MANAGER ACCEPTED \u2014 VENDOR ACCEPTANCE PENDING', 'status-under-review'],
      ['vendor_accepted', 'VENDOR ACCEPTED \u2014 CM SIGN OFF PENDING', 'status-under-review'],
      ['pending_project_approval', 'PENDING PROJECT APPROVER (L1)', 'status-under-review'],
      ['pending_finance_approval', 'PENDING FINANCE HEAD (L2)', 'status-under-review'],
      ['returned_for_correction', 'RETURNED FOR CORRECTION', 'status-cancelled'],
      ['some_new_state', 'SOME NEW STATE', 'status-draft'],
      ['', '', 'status-draft'],
    ] as const;

    for (const [status, label, cssClass] of expected) {
      const { unmount } = render(<StatusBadge status={status} size={status === 'draft' ? 'md' : undefined} />);
      const badge = document.querySelector('.status-badge');
      expect(badge).toHaveClass('status-badge', cssClass);
      expect(badge).toHaveTextContent(label);
      if (status === 'draft') expect(badge).toHaveStyle({ padding: '4px 10px', fontSize: '12px' });
      unmount();
    }
  });

  it('renders FormSection with optional number, subtitle and action', () => {
    const { rerender, container } = render(<FormSection title="Details" sectionNumber={2} subtitle="Guidance" headerAction={<button>Save</button>} className="extra">Fields</FormSection>);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Guidance')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(container.querySelector('.extra')).toHaveTextContent('Fields');
    rerender(<FormSection title="Plain">Content</FormSection>);
    expect(screen.queryByText('Guidance')).not.toBeInTheDocument();
    expect(screen.getByText('Plain')).toBeInTheDocument();
  });

  it('forwards SpecificationCell options to its shared BOQ cell', () => {
    render(<SpecificationCell specification="Full spec" lineNumber={7} itemDescription="Desk" maxWidth="30rem" lineId="L-7" emptyPlaceholder="Not set" clampLines={3} />);
    expect(screen.getByText('Full spec')).toBeInTheDocument();
    const preview = screen.getByRole('button', { name: 'BOQ Description: Full spec...' });
    expect(preview).toHaveStyle({ maxWidth: '30rem' });
    expect(preview.querySelector('span')).toHaveStyle({ WebkitLineClamp: '3' });
    render(<SpecificationCell specification="  " emptyPlaceholder="No specification" />);
    expect(screen.getByText('No specification')).toBeInTheDocument();
  });

  it.each([null, '', '—', '-'])('renders the empty specification placeholder for %s', (text) => {
    render(<BoqDescriptionCell text={text} emptyPlaceholder="Missing" />);
    expect(screen.getByText('Missing')).toHaveClass('italic');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('opens the description portal, positions it, copies text and handles close keys', async () => {
    jest.useFakeTimers();
    const clipboard = { writeText: jest.fn().mockResolvedValue(undefined) };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
    const { getByRole, getByText, queryByRole } = render(
      <BoqDescriptionCell
        text="Full technical specification"
        title="Scope"
        contextLabel="Vendor A"
        itemCode="ITEM-4"
        itemDescription="Office chair"
        lineNumber={4}
        maxWidth={320}
        clampLines={1}
        showIcon
        className="custom-preview"
      />,
    );
    const trigger = getByRole('button', { name: 'Scope: Full technical specification...' });
    expect(trigger).toHaveStyle({ maxWidth: '320px' });
    expect(trigger.querySelector('svg')).toBeInTheDocument();
    expect(trigger.querySelector('span')).toHaveStyle({ WebkitLineClamp: '1' });
    jest.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      left: 850, right: 950, top: 250, bottom: 700, width: 100, height: 450, x: 850, y: 250,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.click(trigger);
    expect(getByRole('region', { name: 'Full Scope' })).toHaveTextContent('Full technical specification');
    expect(getByText('Vendor A')).toBeInTheDocument();
    expect(getByText('(Line #4)')).toBeInTheDocument();
    expect(getByText('ITEM-4')).toBeInTheDocument();
    expect(getByText('Item:').parentElement).toHaveAttribute('title', 'Office chair');
    const tooltip = document.querySelector('.fixed');
    expect(tooltip).toHaveStyle({ top: '244px', left: '628px', transform: 'translateY(-100%)' });
    fireEvent.scroll(window);
    fireEvent(window, new Event('resize'));
    fireEvent.click(getByRole('button', { name: 'Copy' }));
    expect(clipboard.writeText).toHaveBeenCalledWith('Full technical specification');
    expect(getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(2000));
    expect(getByRole('button', { name: 'Copy' })).toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(queryByRole('region', { name: 'Full Scope' })).not.toBeInTheDocument();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('supports keyboard and pointer opening, closes after leave and avoids bubbling clicks', () => {
    jest.useFakeTimers();
    const parentClick = jest.fn();
    const { getByRole, queryByRole } = render(
      <div onClick={parentClick}>
        <BoqDescriptionCell text="Specification details" title="Details" />
      </div>,
    );
    const trigger = getByRole('button', { name: 'Details: Specification details...' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(getByRole('region', { name: 'Full Details' })).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: ' ' });
    expect(queryByRole('region', { name: 'Full Details' })).not.toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: 'x' });
    fireEvent.click(trigger);
    expect(parentClick).not.toHaveBeenCalled();
    expect(getByRole('region', { name: 'Full Details' })).toBeInTheDocument();
    fireEvent.mouseEnter(document.querySelector('.fixed') as Element);
    fireEvent.mouseLeave(document.querySelector('.fixed') as Element);
    act(() => jest.advanceTimersByTime(151));
    expect(queryByRole('region', { name: 'Full Details' })).not.toBeInTheDocument();
    fireEvent.mouseEnter(trigger);
    expect(getByRole('region', { name: 'Full Details' })).toBeInTheDocument();
    fireEvent.mouseLeave(trigger);
    act(() => jest.advanceTimersByTime(151));
    expect(queryByRole('region', { name: 'Full Details' })).not.toBeInTheDocument();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders PageHeader navigation and content variants', () => {
    const onBack = jest.fn();
    const { rerender } = render(<PageHeader title="Project" description="Project description" breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Project' }]} stepNumber={2} badge={<b>Active</b>} actions={<button>Save</button>} />);
    expect(screen.getByRole('heading', { name: 'Project' })).toBeInTheDocument();
    expect(screen.getByText('Project description')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();

    rerender(<PageHeader title="Back link" subtitle="Sub" backHref="/back" backLabel="Back to list" />);
    expect(screen.getByRole('link', { name: 'Back to list' })).toHaveAttribute('href', '/back');
    rerender(<PageHeader title="Back action" onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    rerender(<PageHeader title="Bare" backHref="/ignored" breadcrumbs={[]} />);
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/ignored');
    rerender(<PageHeader title="No navigation" />);
    expect(screen.getByRole('heading', { name: 'No navigation' })).toBeInTheDocument();
  });

  it('handles Modal closed, open, footer, width and close interactions', () => {
    const onClose = jest.fn();
    const { rerender, container } = render(<Modal isOpen={false} onClose={onClose} title="Hidden">Content</Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(<Modal isOpen onClose={onClose} title="Open" subtitle="Context" footer={<button>Done</button>} maxWidth="max-w-lg"><span>Body</span></Modal>);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Context')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(container.querySelector('.modal-box')).toHaveClass('max-w-lg');
    fireEvent.click(screen.getByText('Body'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(3);

    rerender(<Modal isOpen onClose={onClose} title="Numeric width" maxWidth={420}>Body</Modal>);
    expect(container.querySelector('.modal-box')).not.toHaveClass('max-w-lg');
    expect(container.querySelector('.modal-box')).toHaveStyle({ maxWidth: '420px' });
  });

  it('renders wizard current, completed and pending steps and guards missing callbacks', () => {
    const onStepClick = jest.fn();
    const { rerender } = render(<WizardStepper
      currentStep={2}
      onStepClick={onStepClick}
      className="wizard"
      steps={[
        { stepNumber: 1, label: 'Basics', subtitle: 'Completed step' },
        { stepNumber: 2, label: 'Review' },
        { stepNumber: 3, label: 'Submit', subtitle: 'Pending step' },
      ]}
    />);
    expect(screen.getByRole('button', { name: /Basics Completed step/ })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /Review/ })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /Submit Pending step/ })).toBeDisabled();
    expect(document.querySelector('.wizard')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Basics/ }));
    expect(onStepClick).toHaveBeenCalledWith(1);
    expect(document.querySelectorAll('.wizard svg')).toHaveLength(3);

    rerender(<WizardStepper currentStep={1} steps={[{ stepNumber: 1, label: 'Only' }]} />);
    fireEvent.click(screen.getByRole('button', { name: /Only/ }));
    expect(screen.getByRole('button', { name: /Only/ })).not.toBeDisabled();
  });

  it('renders workflow stage status styling, current marker and click actions', () => {
    const onCurrent = jest.fn();
    const onCompleted = jest.fn();
    const onPending = jest.fn();
    render(<WorkflowStageNav className="workflow" stages={[
      { id: 'one', stageNumber: 1, label: 'Complete', status: 'COMPLETED', onClick: onCompleted },
      { id: 'two', stageNumber: '2A', label: 'Current', status: 'CURRENT', onClick: onCurrent },
      { id: 'three', stageNumber: 3, label: 'Next', status: 'PENDING', onClick: onPending },
      { id: 'four', stageNumber: 4, label: 'Disabled', status: 'DISABLED' },
    ]} />);
    expect(screen.getByRole('navigation', { name: 'Workflow Navigation' })).toHaveClass('workflow');
    expect(screen.getByRole('button', { name: /Complete/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Current/ })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: /Disabled/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Next/ })).toBeEnabled();
    expect(document.querySelectorAll('.workflow svg')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Complete/ }));
    fireEvent.click(screen.getByRole('button', { name: /Current/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(onCurrent).toHaveBeenCalledTimes(1);
    expect(onPending).toHaveBeenCalledTimes(1);
  });

  it('renders SummaryCard accents, content fallbacks and column grids', () => {
    const accents = ['default', 'neutral', 'blue', 'emerald', 'amber', 'rose', 'slate', 'unknown'] as const;
    const expectedClasses = [
      'border-slate-200 bg-white hover:border-slate-300',
      'border-slate-200 bg-slate-50/50 hover:border-slate-300',
      'border-blue-200 bg-blue-50/30 hover:border-blue-300',
      'border-emerald-200 bg-emerald-50/30 hover:border-emerald-300',
      'border-amber-200 bg-amber-50/30 hover:border-amber-300',
      'border-rose-200 bg-rose-50/30 hover:border-rose-300',
      'border-slate-300 bg-slate-50/60 hover:border-slate-400',
      'border-slate-200 bg-white hover:border-slate-300',
    ];
    accents.forEach((accent, index) => {
      const { unmount } = render(<SummaryCard label="Budget" value="$10" accent={accent as never} className="custom" />);
      const card = document.querySelector('.summary-card');
      expect(card).toHaveClass(...expectedClasses[index].split(' '), 'custom');
      unmount();
    });

    const { rerender, container } = render(<SummaryCard label="Vendors" value={3} secondary="Preferred" badge={<b>Good</b>} icon={<i>Icon</i>} />);
    expect(screen.getByText('Preferred')).toBeInTheDocument();
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(screen.getByText('Icon')).toBeInTheDocument();
    rerender(<SummaryCard label="Budget" value="$10" description="Allocated" icon={<i>Only icon</i>} />);
    expect(screen.getByText('Allocated')).toBeInTheDocument();
    expect(screen.getByText('Only icon')).toBeInTheDocument();
    rerender(<SummaryCard label="No detail" value="—" />);
    expect(container.querySelector('.summary-card')?.querySelectorAll('.text-slate-500')).toHaveLength(1);

    const { rerender: rerenderGrid } = render(<SummaryCardGrid><div>Grid child</div></SummaryCardGrid>);
    const grid = screen.getByText('Grid child').parentElement;
    expect(grid).toHaveClass('grid-cols-1 sm:grid-cols-2 lg:grid-cols-4');
    const gridClasses = {
      1: 'grid-cols-1',
      2: 'grid-cols-1 sm:grid-cols-2',
      3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
      5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5',
      6: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-6',
    };
    ([1, 2, 3, 4, 5, 6] as const).forEach((columns) => {
      rerenderGrid(<SummaryCardGrid columns={columns}><div>{`Grid ${columns}`}</div></SummaryCardGrid>);
      expect(screen.getByText(`Grid ${columns}`).parentElement).toHaveClass(...gridClasses[columns].split(' '));
    });
  });

  it('renders LongTextCell previews, opens details and copies with the available controls', () => {
    jest.useFakeTimers();
    const clipboard = { writeText: jest.fn().mockResolvedValue(undefined) };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
    const { rerender, getByRole, queryByRole } = render(<LongTextCell text="   " emptyPlaceholder="No details" />);
    expect(screen.getByText('No details')).toBeInTheDocument();
    expect(queryByRole('button')).not.toBeInTheDocument();

    rerender(<LongTextCell text="Complete procurement terms" title="Terms" subtitle="Contract 8" accent="blue" maxWidth={180} clampLines={2} extraFooterAction={<button>Extra</button>} />);
    const trigger = getByRole('button', { name: 'View full details for: Complete procurement terms...' });
    expect(trigger).toHaveStyle({ maxWidth: '180px' });
    expect(trigger.querySelector('svg')).toBeInTheDocument();
    expect(trigger.querySelector('span')).toHaveClass('line-clamp-2');
    fireEvent.keyDown(trigger, { key: 'x' });
    expect(queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Contract 8')).toBeInTheDocument();
    expect(getByRole('region', { name: 'Full Text Viewer' })).toHaveTextContent('Complete procurement terms');
    fireEvent.click(getByRole('button', { name: 'Copy Text' }));
    expect(clipboard.writeText).toHaveBeenCalledWith('Complete procurement terms');
    expect(getByRole('button', { name: 'Copied to Clipboard' })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Extra' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(queryByRole('dialog')).not.toBeInTheDocument();

    rerender(<LongTextCell text="Another contract term" showIcon={false} accent="amber" maxWidth="24rem" clampLines={1} />);
    expect(getByRole('button', { name: 'View full details for: Another contract term...' })).toHaveStyle({ maxWidth: '24rem' });
    expect(screen.getByText('Another contract term').previousElementSibling).toBeNull();
    const nextTrigger = getByRole('button', { name: 'View full details for: Another contract term...' });
    fireEvent.click(nextTrigger);
    expect(getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(nextTrigger, { key: ' ' });
    expect(getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(getByRole('button', { name: 'Close' }));
    expect(queryByRole('dialog')).not.toBeInTheDocument();
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  it('renders the RFQ stepper states, theme defaults and optional click handler', () => {
    const onStepClick = jest.fn();
    const { rerender } = render(<Stepper currentStep={2} onStepClick={onStepClick} steps={[
      { number: 1, title: 'Prepare', description: 'Earlier' },
      { number: 2, title: 'Invite', description: 'Current', primaryColor: '#123456', lightBg: '#abcdef' },
      { number: 3, title: 'Compare', description: 'Later' },
    ]} />);
    expect(screen.getByRole('navigation', { name: 'RFQ Creation Steps' })).toHaveStyle({ gridTemplateColumns: 'repeat(3, 1fr)' });
    expect(screen.getByRole('button', { name: /Prepare/ })).toHaveClass('completed');
    expect(screen.getByRole('button', { name: /Invite/ })).toHaveClass('active');
    expect(screen.getByRole('button', { name: /Compare/ })).toHaveClass('pending');
    expect(screen.getByRole('button', { name: /Invite/ })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: /Invite/ })).toHaveStyle({ borderColor: 'rgb(18, 52, 86)', backgroundColor: 'rgb(171, 205, 239)' });
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Prepare/ }));
    expect(onStepClick).toHaveBeenCalledWith(1);

    rerender(<Stepper currentStep={1} steps={[{ number: 1, title: 'Only', description: 'No handler' }]} />);
    fireEvent.click(screen.getByRole('button', { name: /Only/ }));
    expect(screen.getByRole('button', { name: /Only/ })).toHaveStyle({ borderColor: 'rgb(37, 99, 235)', backgroundColor: 'rgb(239, 246, 255)' });
  });

  it('exercises ToastProvider helper methods, variants, actions, dismissal and expiry', () => {
    jest.useFakeTimers();
    const action = jest.fn();
    function ToastHarness() {
      const toast = useToast();
      return <div>
        <button onClick={() => toast.success('Saved', 'PR-7', 'RFQ')}>Success text</button>
        <button onClick={() => toast.success('No record')}>Success no record</button>
        <button onClick={() => toast.success({ id: 'success-object', title: 'Object success', message: 'Created', duration: 0 })}>Success object</button>
        <button onClick={() => toast.error('Failed')}>Error text</button>
        <button onClick={() => toast.error({ id: 'error-object', title: '', message: 'Object failed', duration: 0 }, 'Custom error')}>Error object</button>
        <button onClick={() => toast.warning('Review needed')}>Warning text</button>
        <button onClick={() => toast.warning({ id: 'warning-object', title: 'Custom notice', message: 'Warning object', duration: 0 })}>Warning object</button>
        <button onClick={() => toast.info('Information')}>Info text</button>
        <button onClick={() => toast.info({ id: 'info-object', message: 'Object info', durationMs: 0, actionText: 'Open', onAction: action, link: '/record', recordNumber: 'RFQ-8', vendorName: 'Vendor Z', nextStage: 'Review' })}>Info object</button>
        <button onClick={() => toast.showToast({ id: 'no-action', message: 'No action yet', actionText: 'Ignored', durationMs: 0 })}>No action</button>
        <button onClick={() => toast.showToast({ id: 'temporary', type: 'info', message: 'Temporary', durationMs: 50 })}>Temporary</button>
        <button onClick={() => Array.from({ length: 6 }, (_, i) => toast.showToast({ id: `stack-${i}`, message: `Stack ${i}`, durationMs: 0 }))}>Stack six</button>
      </div>;
    }

    function OutsideProvider() {
      useToast();
      return null;
    }
    expect(() => render(<OutsideProvider />)).toThrow('useToast must be used within a ToastProvider');

    render(<ToastProvider><ToastHarness /></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Success text' }));
    expect(screen.getByText('Confirmed: PR-7')).toBeInTheDocument();
    expect(screen.getByText('RFQ')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Success no record' }));
    expect(screen.getByText('Action Successful')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Success object' }));
    expect(screen.getByText('Object success')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Error text' }));
    expect(screen.getByText('Action Failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Error object' }));
    expect(screen.getByText('Custom error')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Warning text' }));
    expect(screen.getByText('Notice')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Warning object' }));
    expect(screen.getByText('Custom notice')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Info text' }));
    expect(screen.getAllByText('Information')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Info object' }));
    expect(screen.getByText('RFQ-8')).toBeInTheDocument();
    expect(screen.getByText('Next Stage:').parentElement).toHaveTextContent('Review');
    expect(screen.getByText('Vendor:').parentElement).toHaveTextContent('Vendor Z');
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'View Record' })).toHaveAttribute('href', '/record');
    fireEvent.click(screen.getByRole('button', { name: 'No action' }));
    expect(screen.queryByRole('button', { name: 'Ignored' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Temporary' }));
    act(() => jest.advanceTimersByTime(50));
    expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('Temporary'))).toBe(false);
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Stack six' }));
    expect(screen.getAllByRole('alert')).toHaveLength(5);
    expect(screen.queryByText('Stack 0')).not.toBeInTheDocument();
    act(() => jest.runOnlyPendingTimers());
    jest.useRealTimers();
  });

  it.each(['—', '-'])('uses the empty placeholder for sentinel LongTextCell text %s', (text) => {
    render(<LongTextCell text={text} emptyPlaceholder="No detail" />);
    expect(screen.getByText('No detail')).toBeInTheDocument();
  });
});
