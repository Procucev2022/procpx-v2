/* Shared declarations for components/rate-cards/HomeWorkspace.tsx. */

export interface RateCardRow {
  id: string;
  rateCardId: string;
  vendor: string;
  vendorCode?: string;
  category: string;
  scope: string;
  items: number;
  validFrom: string;
  validUntil: string;
  status: 'Active' | 'In Progress' | 'Draft' | 'Pending Approval';
  detailedStatus?: string;
  currentStage?: string;
  latestBuyerOffer?: string;
  latestSubmittedVendorQuote?: string;
  latestVendorQuote?: string;
  lastUpdated?: string;
  nextResponsible?: string;
  round?: string;
}

export interface HomeWorkspaceProps {
  cards: RateCardRow[];
  activeSummaryTab: 'finalised' | 'in_progress';
  onTabChange: (tab: 'finalised' | 'in_progress') => void;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (val: string) => void;
  vendorFilter: string;
  onVendorFilterChange: (val: string) => void;
  statusFilter: string;
  onStatusFilterChange: (val: string) => void;
  onClearFilters: () => void;
  onInitiateClick: () => void;
  onNegotiateClick: (cardId: string) => void;
  onBuyerAcceptClick: (cardId: string) => void;
  onDetailsClick: (cardId: string) => void;
}
