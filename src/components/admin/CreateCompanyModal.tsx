'use client';
// components/admin/CreateCompanyModal.tsx - Super Admin form that creates a company (tenant)
// with its profile details and optional per-role user limits.
import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import RoleLimitFields from '@/components/admin/RoleLimitFields';
import {
  CONTACT_PHONE_MAX_INPUT_LENGTH,
  EMPTY_COMPANY_FORM,
  GST_NUMBER_LENGTH,
  PAN_NUMBER_LENGTH,
  PINCODE_LENGTH,
} from '@/components/admin/company-form.constants';
import {
  COMPANY_ADDRESS_MAX_LENGTH,
  COMPANY_NAME_MAX_LENGTH,
  CONTACT_PERSON_NAME_MAX_LENGTH,
  INDUSTRY_OPTIONS,
} from '@/lib/business-directory.constants';
import { UI_STRINGS } from '@/lib/ui-strings.constants';
import type {
  CompanyFormValues,
  CreateCompanyModalProps,
  RoleLimitFormValues,
} from '@app-types/components/admin/role-limits.types';

const STRINGS = UI_STRINGS.appAppAdminUsersPage;

export default function CreateCompanyModal({ onClose, onCreated }: CreateCompanyModalProps) {
  const [form, setForm] = useState<CompanyFormValues>({ ...EMPTY_COMPANY_FORM });
  const [limits, setLimits] = useState<RoleLimitFormValues>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const field = (key: keyof CompanyFormValues) => ({
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value })),
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, roleLimits: limits }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || STRINGS.requestFailed);
        return;
      }
      onCreated(data);
    } catch {
      setError(STRINGS.requestFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-company-title">
        <div className="modal-header">
          <span className="modal-title" id="create-company-title">{STRINGS.createCompanyAccount}</span>
          <button type="button" className="btn btn-ghost btn-icon" aria-label={UI_STRINGS.common.close} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-body">
            {error && (
              <div className="alert alert-error mb-4" role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 16px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="company-name">{STRINGS.companyName}<span className="required">{UI_STRINGS.common.copyd1yn99}</span></label>
                <input id="company-name" className="form-control" maxLength={COMPANY_NAME_MAX_LENGTH} required {...field('name')} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="company-gst">{STRINGS.gstNumber}<span className="required">{UI_STRINGS.common.copyd1yn99}</span></label>
                <input
                  id="company-gst"
                  className="form-control"
                  maxLength={GST_NUMBER_LENGTH}
                  placeholder={STRINGS.gstNumberPlaceholder}
                  style={{ textTransform: 'uppercase' }}
                  required
                  {...field('gstNumber')}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="company-address">{STRINGS.address}<span className="required">{UI_STRINGS.common.copyd1yn99}</span></label>
              <textarea id="company-address" className="form-control" rows={2} maxLength={COMPANY_ADDRESS_MAX_LENGTH} required {...field('address')} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 16px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="company-pincode">{STRINGS.pincode}</label>
                <input id="company-pincode" className="form-control" inputMode="numeric" maxLength={PINCODE_LENGTH} {...field('pincode')} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="company-pan">{STRINGS.panNumber}</label>
                <input
                  id="company-pan"
                  className="form-control"
                  maxLength={PAN_NUMBER_LENGTH}
                  placeholder={STRINGS.panNumberPlaceholder}
                  style={{ textTransform: 'uppercase' }}
                  {...field('panNumber')}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="company-industry">{STRINGS.industry}</label>
                <select id="company-industry" className="form-control" {...field('industry')}>
                  <option value="">{STRINGS.selectIndustry}</option>
                  {INDUSTRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="company-contact-name">{STRINGS.contactPersonName}</label>
                <input id="company-contact-name" className="form-control" maxLength={CONTACT_PERSON_NAME_MAX_LENGTH} {...field('contactPersonName')} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="company-contact-phone">{STRINGS.contactPhone}</label>
                <input id="company-contact-phone" type="tel" className="form-control" maxLength={CONTACT_PHONE_MAX_INPUT_LENGTH} {...field('contactPhone')} />
              </div>
            </div>
            <RoleLimitFields values={limits} onChange={(role, value) => setLimits((current) => ({ ...current, [role]: value }))} />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>{UI_STRINGS.common.cancel}</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{STRINGS.createCompany}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
