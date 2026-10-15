'use client';
// components/ui/StatusBadge.tsx - Enterprise Status Badge System

export interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const norm = (status || '').toUpperCase().trim();

  let badgeClass = 'status-draft';
  let label = norm.replace(/_/g, ' ');

  if (norm === 'DRAFT') {
    badgeClass = 'status-draft';
    label = 'DRAFT';
  } else if (norm === 'UNDER_REVIEW' || norm === 'AWARD_PENDING' || norm === 'AWARD_RECOMMENDED') {
    badgeClass = 'status-under-review';
    label = norm === 'AWARD_RECOMMENDED' ? 'AWARD PENDING' : norm.replace(/_/g, ' ');
  } else if (norm === 'RELEASED' || norm === 'SUBMITTED') {
    badgeClass = 'status-released';
    label = 'RELEASED';
  } else if (norm === 'RESPONSE_OPEN' || norm === 'VENDOR_RESPONSE_OPEN') {
    badgeClass = 'status-response-open';
    label = 'RESPONSE OPEN';
  } else if (norm === 'COMPARISON') {
    badgeClass = 'status-comparison';
    label = 'COMPARISON';
  } else if (norm === 'NEGOTIATION') {
    badgeClass = 'status-negotiation';
    label = 'NEGOTIATION';
  } else if (norm === 'RATE_LOCKED' || norm === 'FINAL_RATE_LOCKED') {
    badgeClass = 'status-rate-locked';
    label = 'RATE LOCKED';
  } else if (norm === 'APPROVED' || norm === 'AWARDED') {
    badgeClass = 'status-approved';
    label = norm === 'APPROVED' ? 'ACTIVE / APPROVED' : norm;
  } else if (norm === 'CANCELLED' || norm === 'REJECTED') {
    badgeClass = 'status-cancelled';
    label = norm;
  } else if (norm === 'ROUND_1_BUYER_OFFER' || norm === 'SENT_TO_VENDOR') {
    badgeClass = 'status-released';
    label = 'BUYER RC OFFER-1';
  } else if (norm === 'ROUND_1_VENDOR_QUOTE') {
    badgeClass = 'status-negotiation';
    label = 'VENDOR RC QUOTE-1 RECEIVED';
  } else if (norm === 'ROUND_2_BUYER_OFFER') {
    badgeClass = 'status-released';
    label = 'BUYER RC OFFER-2';
  } else if (norm === 'ROUND_2_VENDOR_QUOTE') {
    badgeClass = 'status-negotiation';
    label = 'VENDOR RC QUOTE-2 RECEIVED';
  } else if (norm === 'FINAL_VENDOR_OFFER_ACCEPTED') {
    badgeClass = 'status-rate-locked';
    label = 'FINAL VENDOR OFFER ACCEPTED — CM ACCEPTANCE PENDING';
  } else if (norm === 'CATEGORY_MANAGER_ACCEPTED') {
    badgeClass = 'status-under-review';
    label = 'CATEGORY MANAGER ACCEPTED — VENDOR ACCEPTANCE PENDING';
  } else if (norm === 'VENDOR_ACCEPTED') {
    badgeClass = 'status-under-review';
    label = 'VENDOR ACCEPTED — CM SIGN OFF PENDING';
  } else if (norm === 'PENDING_PROJECT_APPROVAL') {
    badgeClass = 'status-under-review';
    label = 'PENDING PROJECT APPROVER (L1)';
  } else if (norm === 'PENDING_FINANCE_APPROVAL') {
    badgeClass = 'status-under-review';
    label = 'PENDING FINANCE HEAD (L2)';
  } else if (norm === 'RETURNED_FOR_CORRECTION') {
    badgeClass = 'status-cancelled';
    label = 'RETURNED FOR CORRECTION';
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
