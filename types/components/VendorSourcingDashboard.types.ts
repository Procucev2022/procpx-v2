/* Shared declarations for components/VendorSourcingDashboard.tsx. */

export interface VendorSourcingDashboardProps {
  vendorId: string;
  vendorName: string;
  vendorCode: string;
  isBuyer?: boolean;
}

export interface VendorDashboardListRecord {
  id: string;
}

export interface VendorRfqSummary {
  id: string;
  [key: string]: unknown;
}

export interface VendorDashboardState {
  rfqRegister?: VendorDashboardListRecord[];
  ppos?: VendorDashboardListRecord[];
  rateCards?: VendorDashboardListRecord[];
  pagination?: Record<string, unknown>;
  [key: string]: unknown;
}
