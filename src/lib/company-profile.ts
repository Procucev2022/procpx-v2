// lib/company-profile.ts - validates the Super Admin company form and role-limit edits.
// Pure and client-safe: the API routes use it as the source of truth for validation.
import {
  COMPANY_ADDRESS_MAX_LENGTH,
  COMPANY_NAME_MAX_LENGTH,
  CONTACT_PERSON_NAME_MAX_LENGTH,
  CONTACT_PHONE_PATTERN,
  GSTIN_PATTERN,
  INDUSTRY_OPTIONS,
  PAN_PATTERN,
  PINCODE_PATTERN,
  ROLE_LIMIT_MAX,
} from '@/lib/business-directory.constants';
import { normalizeCompanyName } from '@/lib/business-name';
import { ASSIGNABLE_USER_ROLES } from '@/app/api/admin/users/route.constants';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import { interpolateUiString } from '@/lib/i18n';
import type { CompanyProfile, ParseResult, RoleLimitInput } from '@app-types/lib/business-directory.types';

const MESSAGES = UI_STRINGS.appApiAdminBusinessesRoute;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const upperCode = (value: unknown): string => text(value).replace(/\s+/g, '').toUpperCase();
const optional = (value: string): string | null => value || null;

/** Returns the catalog label for a stored industry code, or the code itself when unknown. */
export function industryLabel(code: string | null | undefined): string {
  if (!code) return '';
  return INDUSTRY_OPTIONS.find((option) => option.value === code)?.label ?? code;
}

/**
 * Validates a company form. Company name, GSTIN and address are mandatory; pincode, PAN,
 * industry, contact person and phone are optional but must be well formed when given.
 */
export function parseCompanyProfile(body: Record<string, unknown>): ParseResult<CompanyProfile> {
  const name = normalizeCompanyName(body.name);
  const gstNumber = upperCode(body.gstNumber);
  const address = text(body.address);
  const pincode = text(body.pincode).replace(/\s+/g, '');
  const panNumber = upperCode(body.panNumber);
  const industry = text(body.industry);
  const contactPersonName = text(body.contactPersonName).replace(/\s+/g, ' ');
  const contactPhone = text(body.contactPhone).replace(/[\s-]+/g, '');

  const fail = (error: string): ParseResult<CompanyProfile> => ({ ok: false, error });
  if (!name) return fail(MESSAGES.companyNameIsRequired);
  if (name.length > COMPANY_NAME_MAX_LENGTH) {
    return fail(interpolateUiString(MESSAGES.companyNameMustBeAtMostMaxCharacters, { max: COMPANY_NAME_MAX_LENGTH }));
  }
  if (!gstNumber) return fail(MESSAGES.gstNumberIsRequired);
  if (!GSTIN_PATTERN.test(gstNumber)) return fail(MESSAGES.gstNumberIsInvalid);
  if (!address) return fail(MESSAGES.addressIsRequired);
  if (address.length > COMPANY_ADDRESS_MAX_LENGTH) {
    return fail(interpolateUiString(MESSAGES.addressMustBeAtMostMaxCharacters, { max: COMPANY_ADDRESS_MAX_LENGTH }));
  }
  if (pincode && !PINCODE_PATTERN.test(pincode)) return fail(MESSAGES.pincodeIsInvalid);
  if (panNumber && !PAN_PATTERN.test(panNumber)) return fail(MESSAGES.panNumberIsInvalid);
  if (industry && !INDUSTRY_OPTIONS.some((option) => option.value === industry)) return fail(MESSAGES.industryIsInvalid);
  if (contactPersonName.length > CONTACT_PERSON_NAME_MAX_LENGTH) {
    return fail(interpolateUiString(MESSAGES.contactPersonNameMustBeAtMostMaxCharacters, { max: CONTACT_PERSON_NAME_MAX_LENGTH }));
  }
  if (contactPhone && !CONTACT_PHONE_PATTERN.test(contactPhone)) return fail(MESSAGES.contactPhoneIsInvalid);

  return {
    ok: true,
    value: {
      name,
      gstNumber,
      address,
      pincode: optional(pincode),
      panNumber: optional(panNumber),
      industry: optional(industry),
      contactPersonName: optional(contactPersonName),
      contactPhone: optional(contactPhone),
    },
  };
}

/**
 * Validates role limits keyed by assignable role. Blank, null or missing values mean
 * "no limit"; anything else must be a whole number from 0 to ROLE_LIMIT_MAX. Unknown
 * roles are rejected so SUPER_ADMIN or VENDOR limits can never be stored.
 */
export function parseRoleLimits(input: unknown): ParseResult<RoleLimitInput> {
  const invalid: ParseResult<RoleLimitInput> = {
    ok: false, error: interpolateUiString(MESSAGES.roleLimitIsInvalid, { max: ROLE_LIMIT_MAX }),
  };
  if (input == null) return { ok: true, value: {} };
  if (typeof input !== 'object' || Array.isArray(input)) return invalid;

  const limits: RoleLimitInput = {};
  for (const [role, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!ASSIGNABLE_USER_ROLES.includes(role)) return invalid;
    if (raw == null || (typeof raw === 'string' && raw.trim() === '')) {
      limits[role] = null;
      continue;
    }
    const value = typeof raw === 'string' ? Number(raw.trim()) : raw;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > ROLE_LIMIT_MAX) return invalid;
    limits[role] = value;
  }
  return { ok: true, value: limits };
}
