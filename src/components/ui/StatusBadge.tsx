'use client';
import type { StatusBadgeProps } from "@app-types/components/ui/StatusBadge.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
export type { StatusBadgeProps };


export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const norm = (status || '').toUpperCase().trim();

  let badgeClass = 'status-draft';
  let label = norm.replace(/_/g, ' ');

  if (norm === 'DRAFT') {
    badgeClass = 'status-draft';
    label = UI_STRINGS.componentsUiStatusBadge.draft;
  } else if (norm === 'UNDER_REVIEW' || norm === 'AWARD_PENDING' || norm === 'AWARD_RECOMMENDED') {
    badgeClass = 'status-under-review';
    label = norm === 'AWARD_RECOMMENDED' || norm === 'AWARD_PENDING'
      ? UI_STRINGS.componentsUiStatusBadge.awardPending
      : UI_STRINGS.componentsUiStatusBadge.underReview;
  } else if (norm === 'RELEASED' || norm === 'SUBMITTED') {
    badgeClass = 'status-released';
    label = UI_STRINGS.componentsUiStatusBadge.released;
  } else if (norm === 'RESPONSE_OPEN' || norm === 'VENDOR_RESPONSE_OPEN') {
    badgeClass = 'status-response-open';
    label = UI_STRINGS.componentsUiStatusBadge.responseOpen;
  } else if (norm === 'COMPARISON') {
    badgeClass = 'status-comparison';
    label = UI_STRINGS.componentsUiStatusBadge.comparison;
  } else if (norm === 'NEGOTIATION') {
    badgeClass = 'status-negotiation';
    label = UI_STRINGS.componentsUiStatusBadge.negotiation;
  } else if (norm === 'RATE_LOCKED' || norm === 'FINAL_RATE_LOCKED') {
    badgeClass = 'status-rate-locked';
    label = UI_STRINGS.componentsUiStatusBadge.rateLocked;
  } else if (norm === 'APPROVED' || norm === 'AWARDED') {
    badgeClass = 'status-approved';
    label = norm === 'APPROVED' ? UI_STRINGS.componentsUiStatusBadge.activeApproved : UI_STRINGS.componentsUiStatusBadge.awarded;
  } else if (norm === 'CANCELLED' || norm === 'REJECTED') {
    badgeClass = 'status-cancelled';
    label = norm === 'CANCELLED' ? UI_STRINGS.componentsUiStatusBadge.cancelled : UI_STRINGS.componentsUiStatusBadge.rejected;
  } else if (norm === 'ROUND_1_BUYER_OFFER' || norm === 'SENT_TO_VENDOR') {
    badgeClass = 'status-released';
    label = UI_STRINGS.componentsUiStatusBadge.buyerRateCardOfferRoundOne;
  } else if (norm === 'ROUND_1_VENDOR_QUOTE') {
    badgeClass = 'status-negotiation';
    label = UI_STRINGS.componentsUiStatusBadge.roundOneVendorQuoteReceived;
  } else if (norm === 'ROUND_2_BUYER_OFFER') {
    badgeClass = 'status-released';
    label = UI_STRINGS.componentsUiStatusBadge.buyerRateCardOfferRoundTwo;
  } else if (norm === 'ROUND_2_VENDOR_QUOTE') {
    badgeClass = 'status-negotiation';
    label = UI_STRINGS.componentsUiStatusBadge.roundTwoVendorQuoteReceived;
  } else if (norm === 'FINAL_VENDOR_OFFER_ACCEPTED') {
    badgeClass = 'status-rate-locked';
    label = UI_STRINGS.componentsUiStatusBadge.finalVendorOfferAcceptedCategoryManagerAcceptancePending;
  } else if (norm === 'CATEGORY_MANAGER_ACCEPTED') {
    badgeClass = 'status-under-review';
    label = UI_STRINGS.componentsUiStatusBadge.categoryManagerAcceptedVendorAcceptancePending;
  } else if (norm === 'VENDOR_ACCEPTED') {
    badgeClass = 'status-under-review';
    label = UI_STRINGS.componentsUiStatusBadge.vendorAcceptedCategoryManagerSignOffPending;
  } else if (norm === 'PENDING_PROJECT_APPROVAL') {
    badgeClass = 'status-under-review';
    label = UI_STRINGS.componentsUiStatusBadge.pendingProjectApproverL1;
  } else if (norm === 'PENDING_FINANCE_APPROVAL') {
    badgeClass = 'status-under-review';
    label = UI_STRINGS.componentsUiStatusBadge.pendingFinanceHeadL2;
  } else if (norm === 'RETURNED_FOR_CORRECTION') {
    badgeClass = 'status-cancelled';
    label = UI_STRINGS.componentsUiStatusBadge.returnedForCorrection;
  }

  return (
    <span
      className={`status-badge ${badgeClass}`}
      style={{
        padding: size === 'md' ? '4px 10px' : '2px 8px',
        fontSize: size === 'md' ? 12 : 11,
      }}
    >
      <span className="status-dot" />
      {label}
    </span>
  );
}

export { StatusBadge };
