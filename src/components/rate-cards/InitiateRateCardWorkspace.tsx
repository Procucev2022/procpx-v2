'use client';
// src/components/rate-cards/InitiateRateCardWorkspace.tsx
// Professional Enterprise Rate Card Initiation Workspace
// Step 1: Basic Details → Step 2: Rate Lines → Step 3: Review & Initiate
// Enhanced Spacing, Visible Table Cell Borders, Compact 4-Card Summary, and Proper Button Toolbar

import { I18N_CONFIG } from '@/lib/i18n.constants';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Trash2,
  Save,
  Download,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  X,
  FileText,
} from 'lucide-react';
import LongTextCell from '@/components/ui/LongTextCell';
import BoqDescriptionCell from '@/components/ui/BoqDescriptionCell';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import PageHeader from '@/components/ui/PageHeader';
import WizardStepper from '@/components/ui/WizardStepper';
import FormSection from '@/components/ui/FormSection';
import type { RateLineItem, InitiateRateCardProps, InitiateRateCardForm } from "@app-types/components/rate-cards/InitiateRateCardWorkspace.types";
export type { RateLineItem };
import { INITIAL_RATE_LINES } from "./InitiateRateCardWorkspace.constants";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";



export default function InitiateRateCardWorkspace({ onBack, onSubmit }: InitiateRateCardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form State
  const [form, setForm] = useState<InitiateRateCardForm>({
    vendor: 'Ramakrishna Interiors (VND-0006)',
    vendorId: '37b13f45-ed6f-4c27-af8c-b3ede1fd3063',
    effectiveFrom: '2026-10-01',
    validUntil: '2027-09-30',
    category: 'Interior Works',
    subcategory: 'Retail Turnkey Fitouts',
    location: 'All India',
    title: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.retailStoreInteriorWorksFY202627,
    commercialTerms: 'Rates are exclusive of taxes. Valid for all retail outlets. Includes material and labour unless specified.',
    scope: 'Interior execution including civil, false ceiling, flooring, carpentry, painting and allied works for retail outlets.',
  });

  // Single Authoritative Draft State for Rate Lines
  const [items, setItems] = useState<RateLineItem[]>(INITIAL_RATE_LINES);

  // Excel File Input & Upload Preview State
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showUploadPreview, setShowUploadPreview] = useState(false);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadProposedItems, setUploadProposedItems] = useState<
    Array<{
      originalItem: RateLineItem;
      newItemCode: string;
      newTargetRate: number;
      newTargetAmount: number;
      oldTargetRate: number;
      oldTargetAmount: number;
      isModified: boolean;
      errors: string[];
      isValid: boolean;
    }>
  >([]);
  const [uploadGeneralErrors, setUploadGeneralErrors] = useState<string[]>([]);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Auto-dismiss compact toast notification
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Crash/Refresh Recovery via local draft
  useEffect(() => {
    try {
      const saved = localStorage.getItem('procpx_rate_card_initiate_draft');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.items && Array.isArray(parsed.items) && parsed.items.length > 0) {
          setItems(parsed.items);
        }
        if (parsed.form) {
          setForm(parsed.form);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('procpx_rate_card_initiate_draft', JSON.stringify({ form, items }));
    } catch {}
  }, [form, items]);

  // Authoritative Aggregate Calculations
  const metrics = useMemo(() => {
    let totalTargetAmount = 0;
    let totalAiCost = 0;
    let aiCostCount = 0;
    let totalPreviousPpoAmount = 0;
    let previousPpoCount = 0;

    for (const it of items) {
      totalTargetAmount += it.targetAmount;
      if (it.aiCost !== null) {
        totalAiCost += it.aiCost;
        aiCostCount++;
      }
      if (it.previousPpoAmount !== null) {
        totalPreviousPpoAmount += it.previousPpoAmount;
        previousPpoCount++;
      }
    }

    const aiCostCoverage = items.length > 0 ? (aiCostCount / items.length) * 100 : 0;
    const ppoCoverage = items.length > 0 ? (previousPpoCount / items.length) * 100 : 0;

    return {
      totalTargetAmount,
      totalAiCost,
      aiCostCount,
      aiCostCoverage,
      totalPreviousPpoAmount,
      previousPpoCount,
      ppoCoverage,
    };
  }, [items]);

  // Handle Rate Line Item Change with immediate Target Amount recalculation
  const handleItemChange = (id: string, field: keyof RateLineItem, value: any) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;

        const updated = { ...it, [field]: value };

        // Recalculate Target Amount immediately when Quantity or Target Rate changes
        if (field === 'qty' || field === 'targetRate') {
          let qty: number | null = updated.qty;
          if (field === 'qty') {
            if (value === '' || value === null || value === undefined) {
              qty = null;
            } else {
              const parsed = parseFloat(value);
              qty = isNaN(parsed) ? null : Math.max(0, parsed);
            }
          }
          const targetRate = Number(field === 'targetRate' ? value : updated.targetRate) || 0;
          updated.qty = qty;
          updated.targetRate = Math.max(0, targetRate);
          updated.targetAmount = qty !== null ? qty * updated.targetRate : 0;

          // Recompute reference amounts
          if (updated.aiRate !== null) {
            updated.aiCost = qty !== null ? qty * updated.aiRate : null;
          }
          if (updated.previousPpoRate !== null) {
            updated.previousPpoAmount = qty !== null ? qty * updated.previousPpoRate : null;
          }
        }

        return updated;
      })
    );
  };

  // Add Item Line (Missing reference data displays "Not Generated" / "Not Available")
  const handleAddItem = () => {
    const nextIdx = items.length + 1;
    const newItem: RateLineItem = {
      id: String(Date.now()),
      itemCode: `INT-00${nextIdx}`,
      category: form.category,
      subcategory: form.subcategory || 'General',
      description: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.standardBOQLineItem,
      specification: 'Commercial standard specification and execution detail',
      uom: 'SQFT',
      qty: 100,
      aiRate: null,
      aiCost: null,
      previousPpoRate: null,
      previousPpoAmount: null,
      targetRate: 100,
      targetAmount: 10000,
    };
    setItems([...items, newItem]);
    setNotification({ type: 'success', message: interpolateUiString(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.addedNewLineINT00NextIdx, { "nextIdx": nextIdx }) });
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) {
      setNotification({ type: 'error', message: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.atLeastOneRateLineIsRequired });
      return;
    }
    setItems(items.filter((it) => it.id !== id));
  };

  // Download Rate Lines to Excel with Canonical Columns First
  const handleDownloadExcel = () => {
    try {
      const headers = [
        'S.No.',
        'Item Code',
        'Item Description',
        'BOQ Description',
        'UOM',
        'Quantity',
        'AI Rate/Unit (₹)',
        'AI Cost (₹)',
        'Previous PPO Rate (₹)',
        'Previous PPO Amount (₹)',
        'Target Rate (₹) [EDITABLE]',
        'Target Amount (₹)',
        'Category',
        'Sub-category',
        'Permission Notes',
      ];

      const rows = items.map((it, idx) => [
        idx + 1,
        it.itemCode,
        it.description,
        it.specification,
        it.uom,
        it.qty !== null ? it.qty : '',
        it.aiRate !== null ? it.aiRate : 'Not Generated',
        it.aiCost !== null ? it.aiCost : 'Not Generated',
        it.previousPpoRate !== null ? it.previousPpoRate : 'Not Available',
        it.previousPpoAmount !== null ? it.previousPpoAmount : 'Not Available',
        it.targetRate,
        it.qty !== null ? it.targetAmount : '',
        it.category,
        it.subcategory,
        'Column K is editable. Reference benchmarks are protected.',
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      ws['!cols'] = [
        { wch: 6 },
        { wch: 14 },
        { wch: 28 },
        { wch: 42 },
        { wch: 8 },
        { wch: 10 },
        { wch: 18 },
        { wch: 16 },
        { wch: 20 },
        { wch: 22 },
        { wch: 24 },
        { wch: 18 },
        { wch: 18 },
        { wch: 18 },
        { wch: 30 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Rate_Lines');

      const safeTitle = form.title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 24);
      const filename = `proCPX_Rate_Lines_${safeTitle}.xlsx`;
      XLSX.writeFile(wb, filename);

      setNotification({
        type: 'success',
        message: interpolateUiString(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.templateDownloadedFilename, { "filename": filename }),
      });
    } catch {
      setNotification({ type: 'error', message: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.failedToGenerateExcelDownload });
    }
  };

  // Upload Completed Excel Workbook
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFileName(file.name);
    setUploadGeneralErrors([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames.includes('Rate_Lines')
          ? 'Rate_Lines'
          : workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawRows || rawRows.length === 0) {
          setUploadGeneralErrors([UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.workbookContainsNoDataRows]);
          setShowUploadPreview(true);
          return;
        }

        const draftItemsByCode = new Map<string, RateLineItem>();
        for (const it of items) {
          draftItemsByCode.set(it.itemCode.trim().toLowerCase(), it);
        }

        const seenCodesInFile = new Set<string>();
        const proposed: typeof uploadProposedItems = [];
        const fileCodes = new Set<string>();

        rawRows.forEach((r, idx) => {
          const rowNum = idx + 2;
          const errors: string[] = [];

          const rawItemCode = String(
            r['Item Code'] ?? r['itemCode'] ?? r['ItemCode'] ?? r['ITEM CODE'] ?? ''
          ).trim();

          const rawTargetRate =
            r['Target Rate (₹) [EDITABLE]'] ??
            r['Target Rate per Unit (₹) [EDITABLE]'] ??
            r['Target Rate per Unit (₹)'] ??
            r['Target Rate per Unit'] ??
            r['Target Rate (₹)'] ??
            r['Target Rate'] ??
            r['targetRate'] ??
            r['TARGET RATE'] ??
            '';

          if (!rawItemCode) {
            errors.push(`Row ${rowNum}: Missing Item Code`);
            return;
          }

          const codeLower = rawItemCode.toLowerCase();
          fileCodes.add(codeLower);

          if (seenCodesInFile.has(codeLower)) {
            errors.push(`Row ${rowNum}: Duplicate Item Code "${rawItemCode}"`);
          } else {
            seenCodesInFile.add(codeLower);
          }

          const matchedDraftItem = draftItemsByCode.get(codeLower);
          if (!matchedDraftItem) {
            errors.push(`Row ${rowNum}: Unknown Item Code "${rawItemCode}"`);
          }

          const parsedTargetRate = parseFloat(String(rawTargetRate).replace(/[^0-9.]/g, ''));
          if (rawTargetRate === '' || isNaN(parsedTargetRate)) {
            errors.push(interpolateUiString(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.rowRowNumMessage, {
              rowNum,
              message: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.targetRateMustBeAValidNumber,
            }));
          } else if (parsedTargetRate <= 0) {
            errors.push(`Row ${rowNum}: Target Rate must be greater than zero`);
          }

          if (matchedDraftItem) {
            const finalRate =
              !isNaN(parsedTargetRate) && parsedTargetRate > 0
                ? parsedTargetRate
                : matchedDraftItem.targetRate;
            const validQty = matchedDraftItem.qty !== null ? matchedDraftItem.qty : 0;
            const newAmount = validQty * finalRate;
            const isMod = Math.abs(finalRate - matchedDraftItem.targetRate) > 0.001;

            proposed.push({
              originalItem: matchedDraftItem,
              newItemCode: rawItemCode,
              newTargetRate: finalRate,
              newTargetAmount: newAmount,
              oldTargetRate: matchedDraftItem.targetRate,
              oldTargetAmount: matchedDraftItem.targetAmount,
              isModified: isMod,
              errors,
              isValid: errors.length === 0,
            });
          }
        });

        // Unmatched draft lines
        const missingCodes: string[] = [];
        for (const it of items) {
          if (!fileCodes.has(it.itemCode.trim().toLowerCase())) {
            missingCodes.push(it.itemCode);
          }
        }

        const generalErrs: string[] = [];
        if (missingCodes.length > 0) {
          generalErrs.push(
            `${missingCodes.length} draft line(s) (${missingCodes.join(
              ', '
            )}) not in workbook. Existing values will be retained.`
          );
        }

        setUploadProposedItems(proposed);
        setUploadGeneralErrors(generalErrs);
        setShowUploadPreview(true);
      } catch (err: any) {
        setUploadGeneralErrors([interpolateUiString(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.failedToParseFileMessage, {
          message: err.message || UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.invalidFormat,
        })]);
        setShowUploadPreview(true);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Confirm Excel Import
  const handleConfirmImport = () => {
    const validUpdates = uploadProposedItems.filter((p) => p.isValid && p.isModified);
    if (validUpdates.length === 0 && uploadProposedItems.some((p) => !p.isValid)) {
      setNotification({
        type: 'error',
        message: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.resolveValidationErrorsBeforeConfirmingImport,
      });
      return;
    }

    const updatesByCode = new Map<string, number>();
    for (const u of uploadProposedItems) {
      if (u.isValid) {
        updatesByCode.set(u.originalItem.itemCode.toLowerCase(), u.newTargetRate);
      }
    }

    setItems((prev) =>
      prev.map((it) => {
        const codeKey = it.itemCode.toLowerCase();
        if (updatesByCode.has(codeKey)) {
          const newRate = updatesByCode.get(codeKey)!;
          const validQty = it.qty !== null ? it.qty : 0;
          return {
            ...it,
            targetRate: newRate,
            targetAmount: validQty * newRate,
          };
        }
        return it;
      })
    );

    setShowUploadPreview(false);
    setNotification({
      type: 'success',
      message: interpolateUiString(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.updatedLengthRateLineSFromExcel, { "length": validUpdates.length }),
    });
  };

  // Validation before enabling Initiation
  const validationSummary = useMemo(() => {
    const errors: string[] = [];
    if (!form.title.trim()) errors.push('Title is required.');
    if (!form.vendorId) errors.push('Vendor is required.');
    if (!form.category.trim()) errors.push('Category is required.');
    if (!form.effectiveFrom) errors.push('Effective From date is required.');
    if (!form.validUntil) errors.push('Valid Until date is required.');
    if (items.length === 0) errors.push('At least one rate line is required.');

    const invalidLines = items.filter((it) => it.targetRate <= 0 || (it.qty !== null && it.qty < 0));
    if (invalidLines.length > 0) {
      errors.push(`${invalidLines.length} item(s) have invalid target rate.`);
    }

    const itemCodes = items.map((it) => it.itemCode.trim().toLowerCase());
    const duplicateCodes = itemCodes.filter((code, idx) => itemCodes.indexOf(code) !== idx);
    if (duplicateCodes.length > 0) {
      errors.push(`Duplicate item codes: ${Array.from(new Set(duplicateCodes)).join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }, [form, items]);

  return (
    <div className="w-full space-y-6">
      {/* ── STANDARDIZED PAGE HEADER ───────────────────────────────────── */}
      <PageHeader
        title={UI_STRINGS.common.initiateRateCard}
        subtitle={UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.defineContractingVendorCommercialCategoriesLineItemReferenceRatesAndTargetBenchmarks}
        onBack={onBack}
        backLabel="Back to Rate Cards"
        stepNumber={2}
        badge={
          form.title ? (
            <span className="px-3 py-1 bg-slate-100 border border-slate-200 rounded-md text-xs font-bold text-slate-700 truncate max-w-sm">
              {form.title}
            </span>
          ) : null
        }
      />

      {/* ── STANDARDIZED 3-STEP WIZARD STEPPER (48px height, 14-15px typography) ── */}
      <WizardStepper
        steps={[
          { stepNumber: 1, label: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.copy1dqkxxq, subtitle: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.scopeGovernance },
          { stepNumber: 2, label: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.copymit1wm, subtitle: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.copywiumw9 },
          { stepNumber: 3, label: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.copyg2egrx, subtitle: UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.commercialVerification },
        ]}
        currentStep={step}
        onStepClick={(s) => setStep(s as 1 | 2 | 3)}
      />

      {/* Dismissible Compact Toast Notification */}
      {notification && (
        <div
          className={`py-2.5 px-4 rounded-md border text-sm font-medium flex items-center justify-between gap-3 shadow-2xs transition-all ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-red-50 text-red-900 border-red-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notification.type === 'success' ? (
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-red-600 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* ── WORKSPACE CONTENT ────────────────────────────────────────── */}
      {/* ════════════════════════════════════════════════════════════
          STEP 1: BASIC DETAILS (PROFESSIONAL GROUPED FORM)
      ════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="space-y-6">
          <FormSection
            sectionNumber={1}
            title={UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.rateCardScopeGovernance}
            subtitle={UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.defineThePrimaryContractingVendorCommercialCategoryAndRateCardTitle}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              {/* Title */}
              <div className="md:col-span-2">
                <label className="pro-form-label">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.rateCardTitle}<span className="text-red-500">{UI_STRINGS.common.copyd1yn99}</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="pro-input"
                  placeholder={UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.eGRetailStoreInteriorWorksFY202627}
                />
              </div>

              {/* Vendor */}
              <div>
                <label className="pro-form-label">{UI_STRINGS.common.contractingVendor}<span className="text-red-500">{UI_STRINGS.common.copyd1yn99}</span>
                </label>
                <select
                  value={form.vendor}
                  onChange={(e) => {
                    const map: Record<string, string> = {
                      'Ramakrishna Interiors (VND-0006)': '37b13f45-ed6f-4c27-af8c-b3ede1fd3063',
                      'BuildRight Solutions (VND-0007)': '8e947620-4919-40b7-ad68-5f343861a737',
                      'ElectroMax (VND-0008)': 'c68dd488-e7fc-4e45-a78b-eaec07d576d3',
                      'CoolTech HVAC (VND-0009)': '5bea6420-c107-405d-9a51-642d631cd2b9',
                      'Apex Infrastructure & Contracting Pvt Ltd (VND-0001)': 'b79ac9af-7c2b-43be-9a78-571e49daa3fb',
                    };
                    setForm({
                      ...form,
                      vendor: e.target.value,
                      vendorId: map[e.target.value] || form.vendorId,
                    });
                  }}
                  className="pro-select"
                >
                  <option value="Ramakrishna Interiors (VND-0006)">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.ramakrishnaInteriorsVND0006}</option>
                  <option value="BuildRight Solutions (VND-0007)">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.buildRightSolutionsVND0007}</option>
                  <option value="ElectroMax (VND-0008)">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electroMaxVND0008}</option>
                  <option value="CoolTech HVAC (VND-0009)">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.coolTechHVACVND0009}</option>
                  <option value="Apex Infrastructure & Contracting Pvt Ltd (VND-0001)">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.apexInfrastructureContractingPvtLtdVND0001}</option>
                </select>
              </div>

              {/* Category */}
              <div>
                <label className="pro-form-label">{UI_STRINGS.common.category2}<span className="text-red-500">{UI_STRINGS.common.copyd1yn99}</span>
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="pro-select"
                >
                  <option value="Interior Works">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.interiorWorks}</option>
                  <option value="Civil & Interior">{UI_STRINGS.common.civilInterior}</option>
                  <option value="Electrical">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.electrical}</option>
                  <option value="HVAC">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.hVAC}</option>
                  <option value="Furniture">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.furniture}</option>
                </select>
              </div>

              {/* Subcategory */}
              <div>
                <label className="pro-form-label">{UI_STRINGS.common.subCategory}</label>
                <input
                  type="text"
                  value={form.subcategory}
                  onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
                  className="pro-input"
                  placeholder={UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.eGRetailTurnkeyFitouts}
                />
              </div>

              {/* Applicable Locations */}
              <div>
                <label className="pro-form-label">{UI_STRINGS.common.applicableLocations}<span className="text-red-500">{UI_STRINGS.common.copyd1yn99}</span>
                </label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder={UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.eGAllIndiaOrRegionalHubs}
                  className="pro-input"
                />
              </div>
            </div>
          </FormSection>

          <FormSection
            sectionNumber={2}
            title={UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.validityCommercialTerms}
            subtitle={UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.setContractDurationDetailedExecutionScopeAndGoverningTerms}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              {/* Effective From */}
              <div>
                <label className="pro-form-label">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.effectiveFrom}<span className="text-red-500">{UI_STRINGS.common.copyd1yn99}</span>
                </label>
                <input
                  type="date"
                  value={form.effectiveFrom}
                  onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
                  className="pro-input"
                />
              </div>

              {/* Valid Until */}
              <div>
                <label className="pro-form-label">{UI_STRINGS.common.validUntil}<span className="text-red-500">{UI_STRINGS.common.copyd1yn99}</span>
                </label>
                <input
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                  className="pro-input"
                />
              </div>

              {/* Scope of Work */}
              <div className="md:col-span-2">
                <label className="pro-form-label">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.scopeOfWork}<span className="text-red-500">{UI_STRINGS.common.copyd1yn99}</span>
                </label>
                <textarea
                  rows={3}
                  value={form.scope}
                  onChange={(e) => setForm({ ...form, scope: e.target.value })}
                  className="pro-textarea"
                  placeholder={UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.detailedScopeOfSupplyAndExecution}
                />
              </div>

              {/* Commercial Terms */}
              <div className="md:col-span-2">
                <label className="pro-form-label">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.commercialTermsConditions}</label>
                <textarea
                  rows={3}
                  value={form.commercialTerms}
                  onChange={(e) => setForm({ ...form, commercialTerms: e.target.value })}
                  className="pro-textarea"
                  placeholder={UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.pricingTermsTaxesPaymentConditionsEscalationClauses}
                />
              </div>
            </div>
          </FormSection>

          {/* Step 1 Actions Bar (42-44px Buttons) */}
          <div className="flex items-center justify-between pt-5 border-t border-slate-200">
            <button
              type="button"
              onClick={onBack}
              className="h-11 px-6 border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 rounded-lg font-semibold text-sm transition-colors shadow-2xs cursor-pointer"
            >{UI_STRINGS.common.cancel}</button>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="h-11 px-6 bg-[#0f52ba] hover:bg-blue-800 text-white rounded-lg font-semibold text-sm flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
            >
              <span>{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.continueToRateLines}</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

        {/* ════════════════════════════════════════════════════════════
            STEP 2: RATE LINES (ENTERPRISE GRID & TOOLBAR)
        ════════════════════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs p-5 md:p-6 space-y-6">
            {/* Step Heading & Standardized Action Toolbar (42px controls) */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2.5">
                  <span>{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.step2RateLines}</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-[#0f52ba] text-xs font-bold border border-blue-200">
                    {items.length}{UI_STRINGS.common.items3}</span>
                </h2>
              </div>

              {/* Aligned Action Toolbar */}
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="pro-btn pro-btn-secondary"
                >
                  <Plus size={16} />
                  <span>{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.addItemLine}</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadExcel}
                  className="pro-btn pro-btn-secondary"
                >
                  <Download size={16} />
                  <span>{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.downloadExcelTemplate}</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="pro-btn pro-btn-primary"
                >
                  <Upload size={16} />
                  <span>{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.uploadCompletedExcel}</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".xlsx, .xls"
                  className="hidden"
                />
              </div>
            </div>

            {/* Enterprise Grid Table with Visible Cell Borders and LongTextCell */}
            <div className="border border-slate-300 rounded-lg overflow-x-auto shadow-2xs bg-white">
              <table
                className="w-full text-left border-collapse table-fixed text-[13px]"
                style={{ minWidth: '1540px' }}
              >
                <colgroup>
                  <col style={{ width: '55px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '195px' }} />
                  <col style={{ width: '210px' }} />
                  <col style={{ width: '70px' }} />
                  <col style={{ width: '85px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '125px' }} />
                  <col style={{ width: '135px' }} />
                  <col style={{ width: '130px' }} />
                  <col style={{ width: '140px' }} />
                  <col style={{ width: '65px' }} />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50 text-slate-700 font-bold text-[13px] uppercase tracking-wider">
                    <th
                      style={{ width: '55px' }}
                      className="py-3 px-2 text-center border-b border-slate-300 border-r border-slate-200"
                    >{UI_STRINGS.common.sNo2}</th>
                    <th
                      style={{ width: '110px' }}
                      className="py-3 px-2.5 border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.common.itemCode}</th>
                    <th
                      style={{ width: '195px' }}
                      className="py-3 px-2.5 border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.common.itemDescription}</th>
                    <th
                      style={{ width: '210px' }}
                      className="py-3 px-2.5 border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.common.bOQDescription}</th>
                    <th
                      style={{ width: '70px' }}
                      className="py-3 px-2 text-center border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.common.uOM}</th>
                    <th
                      style={{ width: '85px' }}
                      className="py-3 px-2.5 text-right border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.common.quantity}</th>
                    <th
                      style={{ width: '110px' }}
                      className="py-3 px-2.5 text-right border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.aIRateUnit}</th>
                    <th
                      style={{ width: '110px' }}
                      className="py-3 px-2.5 text-right border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.aICost}</th>
                    <th
                      style={{ width: '125px' }}
                      className="py-3 px-2.5 text-right border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.previousPPORate}</th>
                    <th
                      style={{ width: '135px' }}
                      className="py-3 px-2.5 text-right border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.previousPPOAmount}</th>
                    <th
                      style={{ width: '130px' }}
                      className="py-3 px-2.5 text-right border-b border-slate-300 border-r border-slate-200 font-bold text-[#0f52ba] bg-blue-50/50 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.targetRate}</th>
                    <th
                      style={{ width: '140px' }}
                      className="py-3 px-2.5 text-right border-b border-slate-300 border-r border-slate-200 font-bold text-[#0f52ba] bg-blue-50/50 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.targetAmount}</th>
                    <th
                      style={{ width: '65px' }}
                      className="py-3 px-2 text-center border-b border-slate-300 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((it, idx) => (
                    <tr
                      key={it.id}
                      className="hover:bg-blue-50/20 transition-colors border-b border-slate-200 even:bg-slate-50/30"
                    >
                      {/* 1. S.No. */}
                      <td
                        style={{ width: '55px' }}
                        className="py-2.5 px-2 text-center text-slate-500 font-medium text-xs border-r border-slate-200"
                      >
                        {idx + 1}
                      </td>

                      {/* 2. Item Code */}
                      <td
                        style={{ width: '110px' }}
                        className="py-2.5 px-2.5 border-r border-slate-200 font-mono text-xs font-bold text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis"
                      >
                        {it.itemCode}
                      </td>

                      {/* 3. Item Description */}
                      <td
                        style={{ width: '195px' }}
                        className="py-2.5 px-2.5 border-r border-slate-200 overflow-hidden"
                      >
                        <LongTextCell
                          text={it.description}
                          title={interpolateUiString(UI_STRINGS.common.itemDescriptionItemCode, { "itemCode": it.itemCode })}
                          subtitle={interpolateUiString(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.lineValue1CategorySubcategory, { "value1": idx + 1, "category": it.category, "subcategory": it.subcategory })}
                          maxWidth="100%"
                        />
                        <div className="mt-1 flex items-center gap-1 overflow-hidden">
                          <span
                            className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-full block"
                            title={interpolateUiString(UI_STRINGS.common.categorySubcategory, { "category": it.category, "subcategory": it.subcategory })}
                          >
                            {it.category}{UI_STRINGS.common.gt}{it.subcategory}
                          </span>
                        </div>
                      </td>

                      {/* 4. BOQ Description */}
                      <td
                        style={{ width: '210px' }}
                        className="py-2 px-2.5 border-r border-slate-200"
                      >
                        <BoqDescriptionCell
                          text={it.specification}
                          itemCode={it.itemCode}
                          itemDescription={it.description}
                          maxWidth="100%"
                          clampLines={2}
                        />
                      </td>

                      {/* 5. UOM */}
                      <td
                        style={{ width: '70px' }}
                        className="py-2.5 px-2 text-center text-slate-700 font-medium border-r border-slate-200 whitespace-nowrap"
                      >
                        {it.uom}
                      </td>

                      {/* 6. Quantity */}
                      <td
                        style={{ width: '85px' }}
                        className="py-2.5 px-2 text-right border-r border-slate-200"
                      >
                        <input
                          type="number"
                          min="0"
                          step="any"
                          placeholder={UI_STRINGS.common.copy4s9bsz}
                          value={it.qty !== null && it.qty !== undefined ? it.qty : ''}
                          onChange={(e) => handleItemChange(it.id, 'qty', e.target.value)}
                          className="w-full py-1 px-1.5 text-xs text-right border border-slate-300 rounded bg-white hover:border-slate-400 focus:outline-none focus:border-[#0f52ba]"
                        />
                      </td>

                      {/* 7. AI Rate/Unit */}
                      <td
                        style={{ width: '110px' }}
                        className="py-2.5 px-2.5 text-right text-slate-700 border-r border-slate-200 font-mono whitespace-nowrap"
                      >
                        {it.aiRate !== null ? (
                          interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": it.aiRate.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 }) })
                        ) : (
                          <span className="text-slate-400 italic">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.notGenerated}</span>
                        )}
                      </td>

                      {/* 8. AI Cost */}
                      <td
                        style={{ width: '110px' }}
                        className="py-2.5 px-2.5 text-right font-semibold text-slate-800 border-r border-slate-200 font-mono whitespace-nowrap"
                      >
                        {it.aiCost !== null ? (
                          interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": it.aiCost.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 }) })
                        ) : (
                          <span className="text-slate-400 italic">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.notGenerated}</span>
                        )}
                      </td>

                      {/* 9. Previous PPO Rate */}
                      <td
                        style={{ width: '125px' }}
                        className="py-2.5 px-2.5 text-right text-slate-700 border-r border-slate-200 font-mono whitespace-nowrap"
                      >
                        {it.previousPpoRate !== null ? (
                          interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": it.previousPpoRate.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 }) })
                        ) : (
                          <span className="text-slate-400 italic">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.notAvailable}</span>
                        )}
                      </td>

                      {/* 10. Previous PPO Amount */}
                      <td
                        style={{ width: '135px' }}
                        className="py-2.5 px-2.5 text-right font-semibold text-slate-800 border-r border-slate-200 font-mono whitespace-nowrap"
                      >
                        {it.previousPpoAmount !== null ? (
                          interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": it.previousPpoAmount.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 }) })
                        ) : (
                          <span className="text-slate-400 italic">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.notAvailable}</span>
                        )}
                      </td>

                      {/* 11. Target Rate */}
                      <td
                        style={{ width: '130px' }}
                        className="py-2.5 px-2 text-right border-r border-slate-200 bg-blue-50/20"
                      >
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={it.targetRate}
                          onChange={(e) => handleItemChange(it.id, 'targetRate', e.target.value)}
                          className="w-full py-1 px-1.5 text-xs font-bold text-right border border-slate-300 rounded bg-white hover:border-slate-400 focus:outline-none focus:border-[#0f52ba] focus:ring-1 focus:ring-[#0f52ba] text-[#0f52ba]"
                        />
                      </td>

                      {/* 12. Target Amount */}
                      <td
                        style={{ width: '140px' }}
                        className="py-2.5 px-2.5 text-right font-bold text-slate-900 border-r border-slate-200 bg-blue-50/20 font-mono whitespace-nowrap"
                      >
                        {it.qty !== null ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": it.targetAmount.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 }) }) : UI_STRINGS.common.copy4s9bsz}
                      </td>

                      {/* 13. Action Delete */}
                      <td
                        style={{ width: '65px' }}
                        className="py-2.5 px-2 text-center"
                      >
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(it.id)}
                          className="text-slate-400 hover:text-red-600 transition-colors cursor-pointer p-1"
                          title={UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.deleteItemLine}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* Clearly Bordered Footer Row with Authoritative Totals */}
                <tfoot>
                  <tr className="bg-slate-50 font-bold border-t-2 border-slate-300 text-[13px] text-slate-900">
                    <td
                      colSpan={6}
                      className="py-3.5 px-3 text-right uppercase tracking-wider text-xs font-bold text-slate-700 border-r border-slate-200"
                    >{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.totalValuation}</td>
                    <td
                      style={{ width: '110px' }}
                      className="py-3.5 px-2.5 text-right text-slate-500 text-xs border-r border-slate-200"
                    >{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.aICostTotal}</td>
                    <td
                      style={{ width: '110px' }}
                      className="py-3.5 px-2.5 text-right text-slate-900 font-bold border-r border-slate-200 font-mono whitespace-nowrap"
                    >{UI_STRINGS.common.copy1g8b5tg}{metrics.totalAiCost.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}
                    </td>
                    <td
                      style={{ width: '125px' }}
                      className="py-3.5 px-2.5 text-right text-slate-500 text-xs border-r border-slate-200"
                    >{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.pPOTotal}</td>
                    <td
                      style={{ width: '135px' }}
                      className="py-3.5 px-2.5 text-right text-slate-900 font-bold border-r border-slate-200 font-mono whitespace-nowrap"
                    >{UI_STRINGS.common.copy1g8b5tg}{metrics.totalPreviousPpoAmount.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}
                    </td>
                    <td
                      style={{ width: '130px' }}
                      className="py-3.5 px-2.5 text-right text-[#0f52ba] text-xs font-bold border-r border-slate-200 bg-blue-50/40"
                    >{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.targetTotal}</td>
                    <td
                      style={{ width: '140px' }}
                      className="py-3.5 px-2.5 text-right text-[#0f52ba] font-extrabold text-sm border-r border-slate-200 bg-blue-50/40 font-mono whitespace-nowrap"
                    >{UI_STRINGS.common.copy1g8b5tg}{metrics.totalTargetAmount.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ width: '65px' }}></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Navigation Actions Bar (42px Controls) */}
            <div className="flex items-center justify-between pt-5 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="pro-btn pro-btn-secondary"
              >
                <ArrowLeft size={16} />
                <span>{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.previousBasicDetails}</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="pro-btn pro-btn-primary"
              >
                <span>{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.continueToReviewInitiate}</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════
            STEP 3: REVIEW & INITIATE (CLEAN 4-CARD SUMMARY & TABLE)
        ════════════════════════════════════════════════════════════ */}
        {step === 3 && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs p-5 md:p-6 space-y-6">
            {/* Step Heading with Compact Validation Badge */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <h2 className="text-lg font-bold text-slate-900">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.step3ReviewInitiate}</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-[#0f52ba] text-xs font-bold border border-blue-200">
                  {items.length}{UI_STRINGS.common.items3}</span>
              </div>

              {/* Single Compact Validation Status Location */}
              <div>
                {validationSummary.isValid ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                    <CheckCircle2 size={15} className="text-emerald-600" />
                    <span>{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.validationPassedReadyToInitiate}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-red-50 text-red-800 border border-red-200 shadow-2xs">
                    <AlertTriangle size={15} className="text-red-600" />
                    <span>{validationSummary.errors.length}{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.validationIssueS}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Clean Four Evenly Sized Cards Above Table Using Standard Component */}
            <SummaryCardGrid columns={4}>
              {/* Card 1: Rate Card Scope */}
              <SummaryCard
                label={UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.rateCardScope}
                value={<span className="text-base font-bold text-slate-900 truncate block">{form.title}</span>}
                secondary={
                  <span className="text-xs text-slate-600 truncate block font-medium">
                    {form.vendor}
                  </span>
                }
              />

              {/* Card 2: Total AI Cost */}
              <SummaryCard
                label={UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.totalAICost}
                value={`₹ ${metrics.totalAiCost.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}`}
                secondary={interpolateUiString(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.coverageAiCostCountOfLengthItemsToFixed, { "aiCostCount": metrics.aiCostCount, "length": items.length, "toFixed": metrics.aiCostCoverage.toFixed(0) })}
              />

              {/* Card 3: Total Previous PPO Amount */}
              <SummaryCard
                label={UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.totalPreviousPPOAmount}
                value={`₹ ${metrics.totalPreviousPpoAmount.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}`}
                secondary={interpolateUiString(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.coveragePreviousPpoCountOfLengthItemsToFixed, { "previousPpoCount": metrics.previousPpoCount, "length": items.length, "toFixed": metrics.ppoCoverage.toFixed(0) })}
              />

              {/* Card 4: Total Target Amount with Concise Variance Comparison */}
              <SummaryCard
                label={UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.totalTargetAmount}
                value={
                  <span className="text-[#0f52ba]">{UI_STRINGS.common.copy1g8b5tg}{metrics.totalTargetAmount.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}
                  </span>
                }
                secondary={
                  metrics.totalPreviousPpoAmount > 0 ? (
                    <span className="text-emerald-700 font-bold">{UI_STRINGS.common.savings}{(metrics.totalPreviousPpoAmount - metrics.totalTargetAmount).toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}{UI_STRINGS.common.copy1b3t0c5}{(((metrics.totalPreviousPpoAmount - metrics.totalTargetAmount) / metrics.totalPreviousPpoAmount) * 100).toFixed(1)}{UI_STRINGS.common.copy1y4e1t7}</span>
                  ) : (
                    UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.initialTargetBaseline
                  )
                }
                accent="blue"
              />
            </SummaryCardGrid>

            {/* Validation Alerts (Only shown if validation has issues) */}
            {!validationSummary.isValid && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-red-800 text-sm">
                  <AlertTriangle size={15} />
                  <span>{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.validationIssues}</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5 text-red-700 text-xs">
                  {validationSummary.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Synchronised Review Table (Identical 12-Column Structure & Grid Borders) */}
            <div className="border border-slate-300 rounded-lg overflow-x-auto shadow-2xs bg-white">
              <table
                className="w-full text-left border-collapse table-fixed text-[13px]"
                style={{ minWidth: '1475px' }}
              >
                <colgroup>
                  <col style={{ width: '55px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '195px' }} />
                  <col style={{ width: '210px' }} />
                  <col style={{ width: '70px' }} />
                  <col style={{ width: '85px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '125px' }} />
                  <col style={{ width: '135px' }} />
                  <col style={{ width: '130px' }} />
                  <col style={{ width: '140px' }} />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50 text-slate-700 font-bold text-[13px] uppercase tracking-wider">
                    <th
                      style={{ width: '55px' }}
                      className="py-3 px-2 text-center border-b border-slate-300 border-r border-slate-200"
                    >{UI_STRINGS.common.sNo2}</th>
                    <th
                      style={{ width: '110px' }}
                      className="py-3 px-2.5 border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.common.itemCode}</th>
                    <th
                      style={{ width: '195px' }}
                      className="py-3 px-2.5 border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.common.itemDescription}</th>
                    <th
                      style={{ width: '210px' }}
                      className="py-3 px-2.5 border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.common.bOQDescription}</th>
                    <th
                      style={{ width: '70px' }}
                      className="py-3 px-2 text-center border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.common.uOM}</th>
                    <th
                      style={{ width: '85px' }}
                      className="py-3 px-2.5 text-right border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.common.quantity}</th>
                    <th
                      style={{ width: '110px' }}
                      className="py-3 px-2.5 text-right border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.aIRateUnit}</th>
                    <th
                      style={{ width: '110px' }}
                      className="py-3 px-2.5 text-right border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.aICost}</th>
                    <th
                      style={{ width: '125px' }}
                      className="py-3 px-2.5 text-right border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.previousPPORate}</th>
                    <th
                      style={{ width: '135px' }}
                      className="py-3 px-2.5 text-right border-b border-slate-300 border-r border-slate-200 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.previousPPOAmount}</th>
                    <th
                      style={{ width: '130px' }}
                      className="py-3 px-2.5 text-right border-b border-slate-300 border-r border-slate-200 font-bold text-slate-900 bg-slate-50 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.targetRate}</th>
                    <th
                      style={{ width: '140px' }}
                      className="py-3 px-2.5 text-right border-b border-slate-300 font-bold text-[#0f52ba] bg-slate-50 whitespace-normal break-words leading-tight"
                    >{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.targetAmount}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.map((it, idx) => (
                    <tr
                      key={it.id}
                      className="hover:bg-slate-50/80 transition-colors border-b border-slate-200 even:bg-slate-50/30"
                    >
                      <td
                        style={{ width: '55px' }}
                        className="py-2.5 px-2 text-center text-slate-500 font-medium text-xs border-r border-slate-200"
                      >
                        {idx + 1}
                      </td>
                      <td
                        style={{ width: '110px' }}
                        className="py-2.5 px-2.5 font-mono text-xs font-bold text-slate-900 border-r border-slate-200 whitespace-nowrap overflow-hidden text-ellipsis"
                      >
                        {it.itemCode}
                      </td>
                      <td
                        style={{ width: '195px' }}
                        className="py-2.5 px-2.5 border-r border-slate-200 overflow-hidden"
                      >
                        <LongTextCell
                          text={it.description}
                          title={interpolateUiString(UI_STRINGS.common.itemDescriptionItemCode, { "itemCode": it.itemCode })}
                          subtitle={interpolateUiString(UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.lineValue1CategorySubcategory, { "value1": idx + 1, "category": it.category, "subcategory": it.subcategory })}
                          maxWidth="100%"
                        />
                        <div className="mt-1 flex items-center gap-1 overflow-hidden">
                          <span
                            className="text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-full block"
                            title={interpolateUiString(UI_STRINGS.common.categorySubcategory, { "category": it.category, "subcategory": it.subcategory })}
                          >
                            {it.category}{UI_STRINGS.common.gt}{it.subcategory}
                          </span>
                        </div>
                      </td>
                      <td
                        style={{ width: '210px' }}
                        className="py-2 px-2.5 border-r border-slate-200"
                      >
                        <BoqDescriptionCell
                          text={it.specification}
                          itemCode={it.itemCode}
                          itemDescription={it.description}
                          maxWidth="100%"
                          clampLines={2}
                        />
                      </td>
                      <td
                        style={{ width: '70px' }}
                        className="py-2.5 px-2.5 text-center text-slate-700 font-medium border-r border-slate-200 whitespace-nowrap"
                      >
                        {it.uom}
                      </td>
                      <td
                        style={{ width: '85px' }}
                        className="py-2.5 px-2.5 text-right font-medium text-slate-900 border-r border-slate-200 font-mono whitespace-nowrap"
                      >
                        {it.qty !== null && it.qty !== undefined ? it.qty.toLocaleString(I18N_CONFIG.defaultLocale) : UI_STRINGS.common.copy4s9bsz}
                      </td>
                      <td
                        style={{ width: '110px' }}
                        className="py-2.5 px-2.5 text-right text-slate-700 border-r border-slate-200 font-mono whitespace-nowrap"
                      >
                        {it.aiRate !== null ? (
                          interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": it.aiRate.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 }) })
                        ) : (
                          <span className="text-slate-400 italic">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.notGenerated}</span>
                        )}
                      </td>
                      <td
                        style={{ width: '110px' }}
                        className="py-2.5 px-2.5 text-right font-semibold text-slate-800 border-r border-slate-200 font-mono whitespace-nowrap"
                      >
                        {it.aiCost !== null ? (
                          interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": it.aiCost.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 }) })
                        ) : (
                          <span className="text-slate-400 italic">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.notGenerated}</span>
                        )}
                      </td>
                      <td
                        style={{ width: '125px' }}
                        className="py-2.5 px-2.5 text-right text-slate-700 border-r border-slate-200 font-mono whitespace-nowrap"
                      >
                        {it.previousPpoRate !== null ? (
                          interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": it.previousPpoRate.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 }) })
                        ) : (
                          <span className="text-slate-400 italic">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.notAvailable}</span>
                        )}
                      </td>
                      <td
                        style={{ width: '135px' }}
                        className="py-2.5 px-2.5 text-right font-semibold text-slate-800 border-r border-slate-200 font-mono whitespace-nowrap"
                      >
                        {it.previousPpoAmount !== null ? (
                          interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": it.previousPpoAmount.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 }) })
                        ) : (
                          <span className="text-slate-400 italic">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.notAvailable}</span>
                        )}
                      </td>
                      <td
                        style={{ width: '130px' }}
                        className="py-2.5 px-2.5 text-right font-bold text-slate-900 border-r border-slate-200 bg-slate-50/50 font-mono whitespace-nowrap"
                      >{UI_STRINGS.common.copy1g8b5tg}{it.targetRate.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}
                      </td>
                      <td
                        style={{ width: '140px' }}
                        className="py-2.5 px-2.5 text-right font-extrabold text-[#0f52ba] bg-slate-50/50 font-mono whitespace-nowrap"
                      >
                        {it.qty !== null ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": it.targetAmount.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 }) }) : UI_STRINGS.common.copy4s9bsz}
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* Clearly Bordered Footer Row with Totals */}
                <tfoot>
                  <tr className="bg-slate-50 font-bold border-t-2 border-slate-300 text-[13px] text-slate-900">
                    <td
                      colSpan={6}
                      className="py-3.5 px-3 text-right uppercase tracking-wider text-xs font-bold text-slate-700 border-r border-slate-200"
                    >{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.totalReviewedValuation}</td>
                    <td
                      style={{ width: '110px' }}
                      className="py-3.5 px-2.5 text-right text-slate-500 text-xs border-r border-slate-200"
                    >{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.aICostTotal}</td>
                    <td
                      style={{ width: '110px' }}
                      className="py-3.5 px-2.5 text-right text-slate-900 font-bold border-r border-slate-200 font-mono whitespace-nowrap"
                    >{UI_STRINGS.common.copy1g8b5tg}{metrics.totalAiCost.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}
                    </td>
                    <td
                      style={{ width: '125px' }}
                      className="py-3.5 px-2.5 text-right text-slate-500 text-xs border-r border-slate-200"
                    >{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.pPOTotal}</td>
                    <td
                      style={{ width: '135px' }}
                      className="py-3.5 px-2.5 text-right text-slate-900 font-bold border-r border-slate-200 font-mono whitespace-nowrap"
                    >{UI_STRINGS.common.copy1g8b5tg}{metrics.totalPreviousPpoAmount.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}
                    </td>
                    <td
                      style={{ width: '130px' }}
                      className="py-3.5 px-2.5 text-right text-[#0f52ba] text-xs font-bold border-r border-slate-200 bg-slate-50"
                    >{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.targetTotal}</td>
                    <td
                      style={{ width: '140px' }}
                      className="py-3.5 px-2.5 text-right text-[#0f52ba] font-extrabold text-sm bg-slate-50 font-mono whitespace-nowrap"
                    >{UI_STRINGS.common.copy1g8b5tg}{metrics.totalTargetAmount.toLocaleString(I18N_CONFIG.defaultLocale, { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Step 3 Actions Bar (42px Controls) */}
            <div className="flex items-center justify-between pt-5 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="pro-btn pro-btn-secondary"
              >
                <ArrowLeft size={16} />
                <span>{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.previousRateLines}</span>
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem('procpx_rate_card_initiate_draft');
                    onSubmit({ ...form, items, status: 'DRAFT' });
                  }}
                  className="pro-btn pro-btn-secondary"
                >
                  <Save size={15} />
                  <span>{UI_STRINGS.common.saveAsDraft}</span>
                </button>

                <button
                  type="button"
                  disabled={!validationSummary.isValid}
                  onClick={() => {
                    localStorage.removeItem('procpx_rate_card_initiate_draft');
                    onSubmit({ ...form, items, status: 'ROUND_1_BUYER_OFFER' });
                  }}
                  className={`pro-btn ${
                    validationSummary.isValid
                      ? 'pro-btn-primary'
                      : 'bg-slate-300 text-slate-500 cursor-not-allowed border-transparent'
                  }`}
                >
                  <Check size={16} />
                  <span>{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.initiateRateCardSendToVendor}</span>
                </button>
              </div>
            </div>
          </div>
        )}

      {/* ── EXCEL UPLOAD PREVIEW & VALIDATION MODAL ─────────────────── */}
      {showUploadPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={16} className="text-emerald-700" />
                <h3 className="text-xs font-bold text-slate-900">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.excelRateCardImportPreview}{uploadFileName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadPreview(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-3 text-xs">
              {uploadGeneralErrors.length > 0 && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-amber-800 text-[11px] space-y-0.5">
                  <div className="font-semibold flex items-center gap-1">
                    <AlertTriangle size={13} className="text-amber-600" />
                    <span>{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.importNotices}</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {uploadGeneralErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Upload Metrics Summary */}
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-slate-50 p-2 rounded border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">{UI_STRINGS.common.totalRows}</span>
                  <span className="text-xs font-bold text-slate-800">{uploadProposedItems.length}</span>
                </div>
                <div className="bg-emerald-50 p-2 rounded border border-emerald-200 text-center">
                  <span className="text-[10px] text-emerald-700 uppercase font-semibold block">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.modified}</span>
                  <span className="text-xs font-bold text-emerald-800">
                    {uploadProposedItems.filter((p) => p.isValid && p.isModified).length}
                  </span>
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.unchanged}</span>
                  <span className="text-xs font-bold text-slate-700">
                    {uploadProposedItems.filter((p) => p.isValid && !p.isModified).length}
                  </span>
                </div>
                <div className="bg-red-50 p-2 rounded border border-red-200 text-center">
                  <span className="text-[10px] text-red-700 uppercase font-semibold block">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.invalid}</span>
                  <span className="text-xs font-bold text-red-800">
                    {uploadProposedItems.filter((p) => !p.isValid).length}
                  </span>
                </div>
              </div>

              {/* Diff Preview Table */}
              <div className="border border-slate-300 rounded overflow-x-auto">
                <table
                  className="w-full text-left border-collapse table-fixed text-xs"
                  style={{ minWidth: '850px' }}
                >
                  <colgroup>
                    <col style={{ width: '100px' }} />
                    <col style={{ width: '200px' }} />
                    <col style={{ width: '110px' }} />
                    <col style={{ width: '110px' }} />
                    <col style={{ width: '110px' }} />
                    <col style={{ width: '120px' }} />
                    <col style={{ width: '100px' }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-300 font-semibold text-[11px]">
                      <th style={{ width: '100px' }} className="py-2 px-3 border-r border-slate-200">{UI_STRINGS.common.itemCode}</th>
                      <th style={{ width: '200px' }} className="py-2 px-3 border-r border-slate-200">{UI_STRINGS.common.description}</th>
                      <th style={{ width: '110px' }} className="py-2 px-3 text-right border-r border-slate-200">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.currentTarget}</th>
                      <th style={{ width: '110px' }} className="py-2 px-3 text-right font-bold text-slate-900 border-r border-slate-200">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.uploadedTarget}</th>
                      <th style={{ width: '110px' }} className="py-2 px-3 text-right border-r border-slate-200">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.diff}</th>
                      <th style={{ width: '120px' }} className="py-2 px-3 text-right font-bold border-r border-slate-200">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.newAmount}</th>
                      <th style={{ width: '100px' }} className="py-2 px-3 text-center">{UI_STRINGS.common.status}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-[11px]">
                    {uploadProposedItems.map((p, idx) => {
                      const diff = p.newTargetRate - p.oldTargetRate;
                      const pct = p.oldTargetRate > 0 ? (diff / p.oldTargetRate) * 100 : 0;
                      return (
                        <tr
                          key={idx}
                          className={
                            !p.isValid
                              ? 'bg-red-50/60'
                              : p.isModified
                              ? 'bg-emerald-50/40'
                              : 'hover:bg-slate-50'
                          }
                        >
                          <td style={{ width: '100px' }} className="py-1.5 px-3 font-mono font-medium text-slate-900 border-r border-slate-200 whitespace-nowrap overflow-hidden text-ellipsis">
                            {p.newItemCode}
                          </td>
                          <td style={{ width: '200px' }} className="py-1.5 px-3 text-slate-700 truncate border-r border-slate-200">
                            {p.originalItem.description}
                          </td>
                          <td style={{ width: '110px' }} className="py-1.5 px-3 text-right text-slate-600 border-r border-slate-200 whitespace-nowrap font-mono">{UI_STRINGS.common.copy1g8b5tg}{p.oldTargetRate.toLocaleString()}
                          </td>
                          <td style={{ width: '110px' }} className="py-1.5 px-3 text-right font-bold text-slate-900 border-r border-slate-200 whitespace-nowrap font-mono">{UI_STRINGS.common.copy1g8b5tg}{p.newTargetRate.toLocaleString()}
                          </td>
                          <td style={{ width: '110px' }} className="py-1.5 px-3 text-right border-r border-slate-200 whitespace-nowrap font-mono">
                            {p.isModified ? (
                              <span
                                className={`text-[10px] font-semibold ${
                                  diff > 0 ? 'text-blue-700' : 'text-emerald-700'
                                }`}
                              >
                                {diff > 0 ? UI_STRINGS.common.copycrz1ka : ''}
                                {diff.toFixed(2)}{UI_STRINGS.common.copy1b3t0c5}{pct > 0 ? UI_STRINGS.common.copycrz1ka : ''}
                                {pct.toFixed(1)}{UI_STRINGS.common.copy1y4e1t7}</span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.noChange}</span>
                            )}
                          </td>
                          <td style={{ width: '120px' }} className="py-1.5 px-3 text-right font-bold text-slate-900 border-r border-slate-200 whitespace-nowrap font-mono">{UI_STRINGS.common.copy1g8b5tg}{p.newTargetAmount.toLocaleString()}
                          </td>
                          <td style={{ width: '100px' }} className="py-1.5 px-3 text-center">
                            {p.isValid ? (
                              p.isModified ? (
                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.modified}</span>
                              ) : (
                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.unchanged}</span>
                              )
                            ) : (
                              <span
                                className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-800"
                                title={p.errors.join('; ')}
                              >{UI_STRINGS.common.error}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowUploadPreview(false)}
                className="px-3.5 py-1.5 border border-slate-300 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >{UI_STRINGS.common.cancel}</button>
              <button
                type="button"
                disabled={uploadProposedItems.filter((p) => !p.isValid).length > 0}
                onClick={handleConfirmImport}
                className={`px-3.5 py-1.5 rounded text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-colors ${
                  uploadProposedItems.filter((p) => !p.isValid).length === 0
                    ? 'bg-[#0f52ba] hover:bg-blue-800 text-white cursor-pointer'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Check size={14} />
                <span>{UI_STRINGS.componentsRateCardsInitiateRateCardWorkspace.confirmApplyChanges}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
