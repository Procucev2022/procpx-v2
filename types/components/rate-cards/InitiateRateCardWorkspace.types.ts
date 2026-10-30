/* Shared declarations for components/rate-cards/InitiateRateCardWorkspace.tsx. */

export interface RateLineItem {
  id: string;
  standardBoqItemId?: string | null;
  itemCode: string;
  category: string;
  subcategory: string;
  description: string; // Item Description
  specification: string; // BOQ Description / Specification
  uom: string;
  qty: number | null; // Quantity (supports blank/null, preserves originating quantity)
  aiRate: number | null; // AI Rate per Unit (₹)
  aiCost: number | null; // AI Cost (₹) = qty * aiRate
  previousPpoRate: number | null; // Previous PPO Rate per Unit (₹)
  previousPpoAmount: number | null; // Previous PPO Amount (₹) = qty * previousPpoRate
  targetRate: number; // Target Rate per Unit (₹) [Buyer-editable]
  targetAmount: number; // Target Amount (₹) = qty * targetRate
}

export interface InitiateRateCardProps {
  onBack: () => void;
  onSubmit: (formData: any) => void;
}
