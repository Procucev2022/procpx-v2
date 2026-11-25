/* Application constants extracted from app/(app)/projects/page.tsx. */

import type { ProjectFormState } from "@app-types/app/(app)/projects/page.types";

export const STATUS_OPTIONS = ['', 'DRAFT', 'BOQ_PREPARATION', 'BOQ_REVIEW', 'BOQ_APPROVED', 'CANCELLED'];

export const SECTOR_OPTIONS = ['', 'RETAIL', 'HOSPITALITY', 'BANKING', 'INSURANCE', 'OTHER'];

export const PROJECTS_PAGE_SIZE = 20;

export const SECTORS = ['RETAIL', 'HOSPITALITY', 'BANKING', 'INSURANCE', 'OTHER'];

export const PROJECT_TYPES = ['NEW_BUILD', 'RENOVATION', 'REFURBISHMENT', 'EXPANSION', 'REPLACEMENT', 'FIT_OUT', 'MAINTENANCE_CAPEX', 'OTHER'];

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED'];

export const INITIAL_PROJECT_FORM: ProjectFormState = {
  name: '',
  description: '',
  sector: '',
  projectType: '',
  location: '',
  address: '',
  city: '',
  state: '',
  country: 'India',
  areaSqFt: '',
  costCentre: '',
  projectOwner: '',
  budget: '',
  currency: 'INR',
  businessUnit: '',
  numberOfFloors: '',
  numberOfUnits: '',
  startDate: '',
  targetCompletion: '',
};
