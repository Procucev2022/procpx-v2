/* Application constants extracted from components/rate-cards/Section7FinalisedDetails.tsx. */

import type { FinalisedRateItem } from "@app-types/components/rate-cards/Section7FinalisedDetails.types";
import { UI_STRINGS } from "@/lib/ui-strings.constants";


export const DEFAULT_ITEMS: FinalisedRateItem[] = [
  {
    id: '1',
    itemCode: 'INT-001',
    category: 'Interior Works',
    subcategory: 'False Ceiling',
    description: UI_STRINGS.common.gypsumFalseCeiling,
    specification:
      'Saint-Gobain Gyproc 12.5mm moisture resistant gypsum board with GI perimeter channels, intermediate channels, and suspension hangers.',
    uom: 'SQFT',
    qty: 500,
    buyerTargetRate: 120,
    round1VendorQuote: 110,
    round2BuyerOffer: 105,
    round2VendorQuote: 100,
    agreedRate: 105,
  },
  {
    id: '2',
    itemCode: 'INT-002',
    category: 'Interior Works',
    subcategory: 'Flooring',
    description: UI_STRINGS.common.vitrifiedTiles2x2Ft,
    specification:
      '600×600 mm vitrified floor tiles with polymer adhesive, 3mm spacers and matching waterproof epoxy grout lines.',
    uom: 'SQFT',
    qty: 1000,
    buyerTargetRate: 95,
    round1VendorQuote: 90,
    round2BuyerOffer: 88,
    round2VendorQuote: 88,
    agreedRate: 88,
  },
  {
    id: '3',
    itemCode: 'INT-003',
    category: 'Interior Works',
    subcategory: 'Partitions',
    description: UI_STRINGS.common.modularPartitions,
    specification:
      'Supply & installation of powder coated aluminium framed glass partitions with 10mm toughened glass and silicone sealing.',
    uom: 'SQFT',
    qty: 300,
    buyerTargetRate: 350,
    round1VendorQuote: 330,
    round2BuyerOffer: 320,
    round2VendorQuote: 315,
    agreedRate: 320,
  },
  {
    id: '4',
    itemCode: 'INT-004',
    category: 'Interior Works',
    subcategory: 'Carpentry & Joinery',
    description: UI_STRINGS.common.woodenCarpentry,
    specification:
      'Custom commercial storage cabinetry with 19mm commercial BWP ply, 1mm approved laminate finish and premium soft-close hardware.',
    uom: 'SQFT',
    qty: 250,
    buyerTargetRate: 450,
    round1VendorQuote: 420,
    round2BuyerOffer: 410,
    round2VendorQuote: 405,
    agreedRate: 410,
  },
  {
    id: '5',
    itemCode: 'INT-005',
    category: 'Interior Works',
    subcategory: 'Painting',
    description: UI_STRINGS.common.paintingPremiumEmulsion,
    specification:
      'Two coats premium acrylic emulsion paint over one coat acrylic primer with two coats water-resistant surface putty preparation.',
    uom: 'SQFT',
    qty: 2000,
    buyerTargetRate: 80,
    round1VendorQuote: 75,
    round2BuyerOffer: 72,
    round2VendorQuote: 68,
    agreedRate: 72,
  },
];
