/** @jest-environment jsdom */
import { interpolateUiString, uiStringPattern } from '@/lib/i18n';

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
import { UI_STRINGS } from "@/lib/ui-strings.constants";


describe('small shared UI components', () => {
  it('renders linked breadcrumbs, current crumb and crumbs without destinations', () => {
    render(<Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Draft' }, { label: 'Current', href: '/current' }]} />);
    expect(screen.getByRole('navigation', { name: uiStringPattern(UI_STRINGS.componentsUiBreadcrumbs.breadcrumb) })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppApprovalsRateCardsPage.home) })).toHaveAttribute('href', UI_STRINGS.common.copybo0mse);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.draft))).toHaveClass('current');
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.current))).toHaveClass('current');
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.copybo0mse))).toHaveLength(2);
  });

  it('renders context values with and without optional icons', () => {
    render(<ContextBanner items={[{ label: 'Project', value: 'P-1', icon: <b>i</b> }, { label: 'Status', value: 'Open' }]} />);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.project))).toBeInTheDocument();
    expect(screen.getByText('i')).toBeInTheDocument();
    expect(screen.getByText('P-1')).toHaveClass('context-value');
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.open))).toBeInTheDocument();
  });

  it('renders card header variants, optional content and no-padding body', () => {
    const { rerender, container } = render(<Card title="Overview" subtitle="Summary" badge={<b>Ready</b>} action={<button>Open</button>}>Body</Card>);
    expect(screen.getByRole('heading', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsIdPage.overview) })).toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.open) })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAdminMastersPage.create) }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText('custom icon')).toBeInTheDocument();

    rerender(<EmptyState title="Empty" description="Nothing here" actionText="Visit" actionHref="/new" onAction={onAction} />);
    expect(screen.getByRole('link', { name: 'Visit' })).toHaveAttribute('href', '/new');
  });

  it('renders all StatusBadge status mappings and size variants', () => {
    const expected = [
      ['draft', UI_STRINGS.componentsUiStatusBadge.draft, 'status-draft'],
      ['under_review', UI_STRINGS.componentsUiStatusBadge.underReview, 'status-under-review'],
      ['award_pending', UI_STRINGS.componentsUiStatusBadge.awardPending, 'status-under-review'],
      ['award_recommended', UI_STRINGS.componentsUiStatusBadge.awardPending, 'status-under-review'],
      ['released', UI_STRINGS.componentsUiStatusBadge.released, 'status-released'],
      ['submitted', UI_STRINGS.componentsUiStatusBadge.released, 'status-released'],
      ['response_open', UI_STRINGS.componentsUiStatusBadge.responseOpen, 'status-response-open'],
      ['vendor_response_open', UI_STRINGS.componentsUiStatusBadge.responseOpen, 'status-response-open'],
      ['comparison', UI_STRINGS.componentsUiStatusBadge.comparison, 'status-comparison'],
      ['negotiation', UI_STRINGS.componentsUiStatusBadge.negotiation, 'status-negotiation'],
      ['rate_locked', UI_STRINGS.componentsUiStatusBadge.rateLocked, 'status-rate-locked'],
      ['final_rate_locked', UI_STRINGS.componentsUiStatusBadge.rateLocked, 'status-rate-locked'],
      ['approved', UI_STRINGS.componentsUiStatusBadge.activeApproved, 'status-approved'],
      ['awarded', UI_STRINGS.componentsUiStatusBadge.awarded, 'status-approved'],
      ['cancelled', UI_STRINGS.componentsUiStatusBadge.cancelled, 'status-cancelled'],
      ['rejected', UI_STRINGS.componentsUiStatusBadge.rejected, 'status-cancelled'],
      ['round_1_buyer_offer', UI_STRINGS.componentsUiStatusBadge.buyerRateCardOfferRoundOne, 'status-released'],
      ['sent_to_vendor', UI_STRINGS.componentsUiStatusBadge.buyerRateCardOfferRoundOne, 'status-released'],
      ['round_1_vendor_quote', UI_STRINGS.componentsUiStatusBadge.roundOneVendorQuoteReceived, 'status-negotiation'],
      ['round_2_buyer_offer', UI_STRINGS.componentsUiStatusBadge.buyerRateCardOfferRoundTwo, 'status-released'],
      ['round_2_vendor_quote', UI_STRINGS.componentsUiStatusBadge.roundTwoVendorQuoteReceived, 'status-negotiation'],
      ['final_vendor_offer_accepted', UI_STRINGS.componentsUiStatusBadge.finalVendorOfferAcceptedCategoryManagerAcceptancePending, 'status-rate-locked'],
      ['category_manager_accepted', UI_STRINGS.componentsUiStatusBadge.categoryManagerAcceptedVendorAcceptancePending, 'status-under-review'],
      ['vendor_accepted', UI_STRINGS.componentsUiStatusBadge.vendorAcceptedCategoryManagerSignOffPending, 'status-under-review'],
      ['pending_project_approval', UI_STRINGS.componentsUiStatusBadge.pendingProjectApproverL1, 'status-under-review'],
      ['pending_finance_approval', UI_STRINGS.componentsUiStatusBadge.pendingFinanceHeadL2, 'status-under-review'],
      ['returned_for_correction', UI_STRINGS.componentsUiStatusBadge.returnedForCorrection, 'status-cancelled'],
      ['some_new_state', 'some_new_state'.replace(/_/g, ' ').toUpperCase(), 'status-draft'],
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
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.copyf9vgt1))).toBeInTheDocument();
    expect(screen.getByText('Guidance')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(container.querySelector('.extra')).toHaveTextContent('Fields');
    rerender(<FormSection title="Plain">Content</FormSection>);
    expect(screen.queryByText('Guidance')).not.toBeInTheDocument();
    expect(screen.getByText('Plain')).toBeInTheDocument();
  });

  it('forwards SpecificationCell options to its shared BOQ cell', () => {
    render(<SpecificationCell specification="Full spec" lineNumber={7} itemDescription="Desk" maxWidth="30rem" lineId="L-7" emptyPlaceholder="Not set" clampLines={3} />);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsUiBoqDescriptionCell.fullTitle))).toBeInTheDocument();
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
    const technicalSpecification = 'Full technical specification';
    const clipboard = { writeText: jest.fn().mockResolvedValue(undefined) };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
    const { getByRole, getByText, queryByRole } = render(
      <BoqDescriptionCell
        text={technicalSpecification}
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
    const trigger = getByRole('button', {
      name: interpolateUiString(UI_STRINGS.componentsUiBoqDescriptionCell.titleSlice, {
        title: 'Scope',
        slice: technicalSpecification.slice(0, 60),
      }),
    });
    expect(trigger).toHaveStyle({ maxWidth: '320px' });
    expect(trigger.querySelector('svg')).toBeInTheDocument();
    expect(trigger.querySelector('span')).toHaveStyle({ WebkitLineClamp: '1' });
    jest.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      left: 850, right: 950, top: 250, bottom: 700, width: 100, height: 450, x: 850, y: 250,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent.click(trigger);
    const fullTitle = interpolateUiString(UI_STRINGS.componentsUiBoqDescriptionCell.fullTitle, { title: 'Scope' });
    expect(getByRole('region', { name: fullTitle })).toHaveTextContent(technicalSpecification);
    expect(getByText('Vendor A')).toBeInTheDocument();
    expect(getByText('(Line #4)')).toBeInTheDocument();
    expect(getByText(uiStringPattern(UI_STRINGS.componentsRateCardsAgreementPreviewModal.iTEMValue1))).toBeInTheDocument();
    expect(getByText(uiStringPattern(UI_STRINGS.componentsUiBoqDescriptionCell.item)).parentElement).toHaveAttribute('title', 'Office chair');
    const tooltip = document.querySelector('.fixed');
    expect(tooltip).toHaveStyle({ top: '244px', left: '628px', transform: 'translateY(-100%)' });
    fireEvent.scroll(window);
    fireEvent(window, new Event('resize'));
    fireEvent.click(getByRole('button', { name: UI_STRINGS.common.copy }));
    expect(clipboard.writeText).toHaveBeenCalledWith(technicalSpecification);
    expect(getByRole('button', { name: UI_STRINGS.common.copied })).toBeInTheDocument();
    act(() => jest.advanceTimersByTime(2000));
    expect(getByRole('button', { name: UI_STRINGS.common.copy })).toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(queryByRole('region', { name: fullTitle })).not.toBeInTheDocument();
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
    const trigger = getByRole('button', {
      name: interpolateUiString(UI_STRINGS.componentsUiBoqDescriptionCell.titleSlice, {
        title: 'Details',
        slice: 'Specification details'.slice(0, 60),
      }),
    });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const fullTitle = interpolateUiString(UI_STRINGS.componentsUiBoqDescriptionCell.fullTitle, { title: 'Details' });
    expect(getByRole('region', { name: fullTitle })).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: ' ' });
    expect(queryByRole('region', { name: fullTitle })).not.toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: 'x' });
    fireEvent.click(trigger);
    expect(parentClick).not.toHaveBeenCalled();
    expect(getByRole('region', { name: fullTitle })).toBeInTheDocument();
    fireEvent.mouseEnter(document.querySelector('.fixed') as Element);
    fireEvent.mouseLeave(document.querySelector('.fixed') as Element);
    act(() => jest.advanceTimersByTime(151));
    expect(queryByRole('region', { name: fullTitle })).not.toBeInTheDocument();
    fireEvent.mouseEnter(trigger);
    expect(getByRole('region', { name: fullTitle })).toBeInTheDocument();
    fireEvent.mouseLeave(trigger);
    act(() => jest.advanceTimersByTime(151));
    expect(queryByRole('region', { name: fullTitle })).not.toBeInTheDocument();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders PageHeader navigation and content variants', () => {
    const onBack = jest.fn();
    const { rerender } = render(<PageHeader title="Project" description="Project description" breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Project' }]} stepNumber={2} badge={<b>Active</b>} actions={<button>Save</button>} />);
    expect(screen.getByRole('heading', { name: uiStringPattern(UI_STRINGS.common.project) })).toBeInTheDocument();
    expect(screen.getByText('Project description')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.copyf9vgt1))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.active))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();

    rerender(<PageHeader title="Back link" subtitle="Sub" backHref="/back" backLabel="Back to list" />);
    expect(screen.getByRole('link', { name: 'Back to list' })).toHaveAttribute('href', '/back');
    rerender(<PageHeader title="Back action" onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAuctionsPage.back) }));
    expect(onBack).toHaveBeenCalledTimes(1);
    rerender(<PageHeader title="Bare" backHref="/ignored" breadcrumbs={[]} />);
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppProcurementAuctionsPage.back) })).toHaveAttribute('href', '/ignored');
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
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementVendorsPage.done2) })).toBeInTheDocument();
    expect(container.querySelector('.modal-box')).toHaveClass('max-w-lg');
    fireEvent.click(screen.getByText('Body'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.closeDialog) }));
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
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.completed, '', false) })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.review) })).not.toBeDisabled();
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
      { id: 'two', stageNumber: '2A', label: UI_STRINGS.common.current, status: 'CURRENT', onClick: onCurrent },
      { id: 'three', stageNumber: 3, label: 'Next', status: 'PENDING', onClick: onPending },
      { id: 'four', stageNumber: 4, label: 'Disabled', status: 'DISABLED' },
    ]} />);
    expect(screen.getByRole('navigation', { name: uiStringPattern(UI_STRINGS.componentsUiWorkflowStageNav.workflowNavigation) })).toHaveClass('workflow');
    expect(screen.getByRole('button', { name: /Complete/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.current, '', false) })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementAuctionsPage.disabled) })).toBeDisabled();
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAuditPage.next) })).toBeEnabled();
    expect(document.querySelectorAll('.workflow svg')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Complete/ }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.current, '', false) }));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppAuditPage.next) }));
    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(onCurrent).toHaveBeenCalledTimes(1);
    expect(onPending).toHaveBeenCalledTimes(1);
  });

  it('renders SummaryCard accents, content fallbacks and column grids', () => {
    const accents = ['default', 'neutral', 'blue', 'emerald', 'amber', 'rose', 'slate', 'purple', 'indigo', 'unknown'] as const;
    const expectedClasses = [
      'border-slate-200 bg-white hover:border-slate-300',
      'border-slate-200 bg-slate-50/50 hover:border-slate-300',
      'border-blue-200 bg-blue-50/30 hover:border-blue-300',
      'border-emerald-200 bg-emerald-50/30 hover:border-emerald-300',
      'border-amber-200 bg-amber-50/30 hover:border-amber-300',
      'border-rose-200 bg-rose-50/30 hover:border-rose-300',
      'border-slate-300 bg-slate-50/60 hover:border-slate-400',
      'border-indigo-200 bg-indigo-50/30 hover:border-indigo-300',
      'border-indigo-200 bg-indigo-50/30 hover:border-indigo-300',
      'border-slate-200 bg-white hover:border-slate-300',
    ];
    accents.forEach((accent, index) => {
      const { unmount } = render(<SummaryCard label="Budget" value="$10" accent={accent as never} className="custom" />);
      const card = document.querySelector('.summary-card');
      expect(card).toHaveClass(...expectedClasses[index].split(' '), 'custom');
      unmount();
    });

    const { rerender, container, unmount } = render(<SummaryCard label="Vendors" value={3} secondary="Preferred" badge={<b>Good</b>} icon={<i>Icon</i>} />);
    expect(screen.getByText('Preferred')).toBeInTheDocument();
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(screen.getByText('Icon')).toBeInTheDocument();
    rerender(<SummaryCard label="Budget" value="$10" description="Allocated" icon={<i>Only icon</i>} />);
    expect(screen.getByText('Allocated')).toBeInTheDocument();
    expect(screen.getByText('Only icon')).toBeInTheDocument();
    rerender(<SummaryCard label="No detail" value="—" />);
    expect(container.querySelector('.summary-card')?.querySelectorAll('.text-slate-500')).toHaveLength(1);
    unmount();

    const { unmount: unmountKpi } = render(
      <SummaryCard variant="kpi" label="Total" value="100" secondary="12 items" accent="blue" className="kpi-custom" />
    );
    const kpiCard = document.querySelector('.kpi-custom');
    expect(kpiCard).toHaveClass('kpi-custom', 'kpi-card');
    expect(kpiCard).toHaveStyle({ borderLeft: '3px solid #2563eb' });
    expect(screen.getByText('Total')).toHaveClass('kpi-label');
    expect(screen.getByText('100')).toHaveClass('kpi-value');
    expect(screen.getByText('12 items')).toBeInTheDocument();
    unmountKpi();

    const { unmount: unmountKpi2 } = render(
      <SummaryCard variant="kpi" label="Budget" value="200" accent="amber" badge={<span>Badge</span>} className="kpi-custom-2" />
    );
    expect(document.querySelector('.kpi-custom-2')).toHaveStyle({ borderLeft: '3px solid #d97706' });
    expect(screen.getByText('Badge')).toBeInTheDocument();
    unmountKpi2();

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
    const trigger = getByRole('button', { name: interpolateUiString(UI_STRINGS.componentsUiLongTextCell.viewFullDetailsForSlice, { slice: 'Complete procurement terms' }) });
    expect(trigger).toHaveStyle({ maxWidth: '180px' });
    expect(trigger.querySelector('svg')).toBeInTheDocument();
    expect(trigger.querySelector('span')).toHaveClass('line-clamp-2');
    fireEvent.keyDown(trigger, { key: 'x' });
    expect(queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Contract 8')).toBeInTheDocument();
    expect(getByRole('region', { name: UI_STRINGS.componentsUiLongTextCell.fullTextViewer })).toHaveTextContent('Complete procurement terms');
    fireEvent.click(getByRole('button', { name: UI_STRINGS.componentsUiLongTextCell.copyText }));
    expect(clipboard.writeText).toHaveBeenCalledWith('Complete procurement terms');
    expect(getByRole('button', { name: UI_STRINGS.componentsUiLongTextCell.copiedToClipboard })).toBeInTheDocument();
    expect(getByRole('button', { name: 'Extra' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(queryByRole('dialog')).not.toBeInTheDocument();

    rerender(<LongTextCell text="Another contract term" showIcon={false} accent="amber" maxWidth="24rem" clampLines={1} />);
    expect(getByRole('button', { name: interpolateUiString(UI_STRINGS.componentsUiLongTextCell.viewFullDetailsForSlice, { slice: 'Another contract term' }) })).toHaveStyle({ maxWidth: '24rem' });
    expect(screen.getByText('Another contract term').previousElementSibling).toBeNull();
    const nextTrigger = getByRole('button', { name: interpolateUiString(UI_STRINGS.componentsUiLongTextCell.viewFullDetailsForSlice, { slice: 'Another contract term' }) });
    fireEvent.click(nextTrigger);
    expect(getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(getByRole('button', { name: UI_STRINGS.common.close }));
    fireEvent.keyDown(nextTrigger, { key: ' ' });
    expect(getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(getByRole('button', { name: UI_STRINGS.common.close }));
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
    expect(screen.getByRole('navigation', { name: uiStringPattern(UI_STRINGS.componentsUiStepper.rFQCreationSteps) })).toHaveStyle({ gridTemplateColumns: 'repeat(3, 1fr)' });
    expect(screen.getByRole('button', { name: /Prepare/ })).toHaveClass('completed');
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.invite, '', false) })).toHaveClass('active');
    expect(screen.getByRole('button', { name: /Compare/ })).toHaveClass('pending');
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.invite, '', false) })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProcurementRfqsNewPage.invite, '', false) })).toHaveStyle({ borderColor: 'rgb(18, 52, 86)', backgroundColor: 'rgb(171, 205, 239)' });
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.completed))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.active))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.pending))).toBeInTheDocument();
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
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsUiToast.confirmedRecordNumber))).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.rFQ))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Success no record' }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsUiToast.actionSuccessful))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Success object' }));
    expect(screen.getByText('Object success')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Error text' }));
    expect(screen.getByText(UI_STRINGS.componentsUiToast.actionFailed)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Error object' }));
    expect(screen.getByText('Custom error')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Warning text' }));
    expect(screen.getByText(UI_STRINGS.componentsUiToast.notice)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Warning object' }));
    expect(screen.getByText('Custom notice')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Info text' }));
    expect(screen.getAllByText(UI_STRINGS.componentsUiToast.information)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Info object' }));
    expect(screen.getByText('RFQ-8')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsUiToast.nextStage, '', false)).parentElement).toHaveTextContent(uiStringPattern(UI_STRINGS.common.review, '', false));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.vendor2)).parentElement).toHaveTextContent('Vendor Z');
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.open) }));
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.componentsUiToast.viewRecord) })).toHaveAttribute('href', '/record');
    fireEvent.click(screen.getByRole('button', { name: 'No action' }));
    expect(screen.queryByRole('button', { name: 'Ignored' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Temporary' }));
    act(() => jest.advanceTimersByTime(50));
    expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('Temporary'))).toBe(false);
    fireEvent.click(screen.getAllByRole('button', { name: uiStringPattern(UI_STRINGS.componentsUiToast.dismissNotification) })[0]);

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
