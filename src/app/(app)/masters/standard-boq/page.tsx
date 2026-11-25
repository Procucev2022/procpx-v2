'use client';
// src/app/(app)/masters/standard-boq/page.tsx - Standard BOQ Creation & Central Master
import { useState, useEffect, useRef, Fragment } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import {
  BookOpen,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  Download,
  Filter,
  Trash2,
  ShieldAlert,
  RefreshCw,
  FileSpreadsheet,
  Upload,
  FileUp,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import SpecificationCell from '@/components/ui/SpecificationCell';
import type { StandardItem, StandardItemGroup, StandardItemGroupPreset } from "@app-types/app/(app)/masters/standard-boq/page.types";
import { COMMON_UOMS, SECTORS, STANDARD_BOQ_LIST_PAGE_SIZE } from "./page.constants";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";



/** One row per unique Category + Sub-category (sorted), holding its items, sectors and rate range. */
function groupStandardItems(items: StandardItem[]): StandardItemGroup[] {
  const groups = new Map<string, StandardItemGroup>();
  for (const item of items) {
    const subcategory = item.subcategory || 'General';
    const key = `${item.category}\u0000${subcategory}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, category: item.category, subcategory, sectors: [], items: [], minRate: null, maxRate: null };
      groups.set(key, group);
    }
    group.items.push(item);
    if (item.sector && !group.sectors.includes(item.sector)) group.sectors.push(item.sector);
    if (item.benchmarkRate !== null && item.benchmarkRate !== undefined) {
      group.minRate = group.minRate === null ? item.benchmarkRate : Math.min(group.minRate, item.benchmarkRate);
      group.maxRate = group.maxRate === null ? item.benchmarkRate : Math.max(group.maxRate, item.benchmarkRate);
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.category.localeCompare(b.category) || a.subcategory.localeCompare(b.subcategory));
}

export default function StandardBoqCreationPage() {
  const [items, setItems] = useState<StandardItem[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMoreItems, setLoadingMoreItems] = useState(false);
  const [totalItemCount, setTotalItemCount] = useState(0);
  const [hasMoreItems, setHasMoreItems] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
  const itemPage = useRef(1);
  const itemRequestSequence = useRef(0);
  const loadedItemFilters = useRef('');

  // Filters
  const [sectorFilter, setSectorFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

  // Creation Modal / Form State
  const [modalOpen, setModalOpen] = useState(false);
  const [sector, setSector] = useState('RETAIL');
  const [projectType, setProjectType] = useState('Store Fitout');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState('General');
  const [lineItems, setLineItems] = useState<Array<{
    itemCode: string;
    description: string;
    specification: string;
    uom: string;
    rate: string;
    brandMake: string;
  }>>([
    { itemCode: '', description: '', specification: '', uom: 'SQFT', rate: '', brandMake: '' }
  ]);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Upload Excel State (Correction 2)
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadParsedRows, setUploadParsedRows] = useState<Array<{
    id: string;
    itemCode: string;
    category: string;
    subcategory: string;
    standardDescription: string;
    detailedSpecification: string;
    uom: string;
    benchmarkRate: string;
    brandMake: string;
    sector: string;
    projectType: string;
    errors: string[];
    isValid: boolean;
  }>>([]);
  const [uploadFilter, setUploadFilter] = useState<'ALL' | 'VALID' | 'INVALID'>('ALL');
  const [importing, setImporting] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadFileInputRef = useRef<HTMLInputElement | null>(null);

  const canEdit = ['SUPER_ADMIN', 'CLIENT_ADMIN', 'CATEGORY_MANAGER'].includes(currentUserRole);

  useEffect(() => {
    fetchUserRole();
    loadCategories();
  }, []);

  useEffect(() => {
    loadStandardItems();
  }, [sectorFilter, categoryFilter]);

  const fetchUserRole = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const d = await res.json();
        setCurrentUserRole(d.data?.user?.role || d.user?.role || '');
      }
    } catch {
      // ignore
    }
  };

  const loadCategories = async () => {
    try {
      const res = await fetch('/api/masters/categories');
      if (res.ok) {
        const d = await res.json();
        const cats = d.data || d || [];
        setCategories(cats);
        if (cats.length > 0 && !selectedCategory) {
          setSelectedCategory(cats[0].name);
        }
      }
    } catch {
      // ignore
    }
  };

  const loadStandardItems = async (append = false) => {
    const filters = JSON.stringify([sectorFilter, categoryFilter, search.trim()]);
    const shouldAppend = append && loadedItemFilters.current === filters;
    const page = shouldAppend ? itemPage.current + 1 : 1;
    const requestSequence = ++itemRequestSequence.current;
    if (shouldAppend) setLoadingMoreItems(true);
    else setLoading(true);
    try {
      const q = new URLSearchParams();
      if (sectorFilter && sectorFilter !== 'ALL') q.set('sector', sectorFilter);
      if (categoryFilter && categoryFilter !== 'ALL') q.set('category', categoryFilter);
      if (search.trim()) q.set('search', search.trim());
      q.set('page', String(page));
      q.set('pageSize', String(STANDARD_BOQ_LIST_PAGE_SIZE));

      const res = await fetch(`/api/boq/standard-library?${q.toString()}`);
      if (!res.ok) throw new Error(UI_STRINGS.appAppMastersStandardBoqPage.failedToLoadStandardBOQItems);
      const d = await res.json();
      if (requestSequence !== itemRequestSequence.current) return;
      const payload = d?.data ?? d;
      const result = Array.isArray(payload)
        ? { items: payload, total: payload.length, hasMore: false, page: 1 }
        : payload;
      const incoming = Array.isArray(result.items) ? result.items : [];
      setItems((current) => {
        if (!shouldAppend) return incoming;
        const byId = new Map(current.map((item) => [item.id, item]));
        incoming.forEach((item: StandardItem) => byId.set(item.id, item));
        return Array.from(byId.values());
      });
      setTotalItemCount(Number(result.total) || incoming.length);
      setHasMoreItems(Boolean(result.hasMore));
      itemPage.current = Number(result.page) || page;
      loadedItemFilters.current = filters;
    } catch {
      if (requestSequence === itemRequestSequence.current) {
        setNotification({ type: 'error', message: UI_STRINGS.appAppMastersStandardBoqPage.failedToLoadStandardBOQItems });
      }
    } finally {
      if (requestSequence === itemRequestSequence.current) {
        if (shouldAppend) setLoadingMoreItems(false);
        else setLoading(false);
      }
    }
  };

  // A group row passes its category, sub-category and sector so new items land in that group.
  const handleOpenModal = (preset?: StandardItemGroupPreset) => {
    if (!canEdit) return;
    setFormError(null);
    const category = preset?.category || selectedCategory;
    if (preset) {
      setSelectedCategory(preset.category);
      setSelectedSubcategory(preset.subcategory);
      setSector(preset.sector);
    } else if (!selectedCategory && categories.length > 0) {
      setSelectedCategory(categories[0].name);
    }
    // Auto-generate starting code if empty
    const codePrefix = 'STD-' + (category ? category.substring(0, 3).toUpperCase() : 'CIV');
    setLineItems([
      {
        itemCode: `${codePrefix}-${String(items.length + 1).padStart(3, '0')}`,
        description: '',
        specification: '',
        uom: 'SQFT',
        rate: '',
        brandMake: '',
      }
    ]);
    setModalOpen(true);
  };

  const handleAddRow = () => {
    const codePrefix = 'STD-' + (selectedCategory ? selectedCategory.substring(0, 3).toUpperCase() : 'CIV');
    setLineItems(prev => [
      ...prev,
      {
        itemCode: `${codePrefix}-${String(items.length + prev.length + 1).padStart(3, '0')}`,
        description: '',
        specification: '',
        uom: 'SQFT',
        rate: '',
        brandMake: '',
      }
    ]);
  };

  const handleRemoveRow = (index: number) => {
    if (lineItems.length === 1) return;
    setLineItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateRow = (index: number, field: string, val: string) => {
    setLineItems(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!selectedCategory) {
      setFormError(UI_STRINGS.appAppMastersStandardBoqPage.pleaseSelectACategory);
      return;
    }

    // Validation
    const seenCodes = new Set<string>();
    for (let i = 0; i < lineItems.length; i++) {
      const line = lineItems[i];
      const lineNum = i + 1;
      const code = line.itemCode.trim();
      const desc = line.description.trim();
      const uom = line.uom.trim();

      if (!code) {
        setFormError(interpolateUiString(UI_STRINGS.appAppMastersStandardBoqPage.lineLineNumItemCodeIsRequired, { "lineNum": lineNum }));
        return;
      }
      if (!desc) {
        setFormError(interpolateUiString(UI_STRINGS.appAppMastersStandardBoqPage.lineLineNumCodeDescriptionIsRequired, { "lineNum": lineNum, "code": code }));
        return;
      }
      if (!uom) {
        setFormError(interpolateUiString(UI_STRINGS.appAppMastersStandardBoqPage.lineLineNumCodeUOMIsRequired, { "lineNum": lineNum, "code": code }));
        return;
      }

      if (seenCodes.has(code.toLowerCase())) {
        setFormError(interpolateUiString(UI_STRINGS.appAppMastersStandardBoqPage.duplicateItemCodeInTableCode, { "code": code }));
        return;
      }
      seenCodes.add(code.toLowerCase());

      // Check against existing items
      if (items.some(it => it.itemCode.toLowerCase() === code.toLowerCase())) {
        setFormError(interpolateUiString(UI_STRINGS.appAppMastersStandardBoqPage.itemCodeCodeAlreadyExistsInTheCentralStandardBOQMaster, { "code": code }));
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        sector,
        projectType,
        category: selectedCategory,
        subcategory: selectedSubcategory || 'General',
        items: lineItems.map(l => ({
          itemCode: l.itemCode.trim(),
          standardDescription: l.description.trim(),
          detailedSpecification: l.specification.trim() || l.description.trim(),
          uom: l.uom.trim().toUpperCase(),
          benchmarkRate: l.rate ? parseFloat(l.rate) : null,
          brandMake: l.brandMake.trim() || null,
        })),
      };

      const res = await fetch('/api/boq/standard-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        setFormError(interpolateUiString(UI_STRINGS.common.value1, { "value1": json.error || UI_STRINGS.common.userMessages.failedToSaveStandardBoqItems }));
        return;
      }

      setNotification({
        type: 'success',
        message: interpolateUiString(UI_STRINGS.appAppMastersStandardBoqPage.successfullyCreatedLengthStandardBOQItemsTheyAreNowAvailableInBOQStudioSDownloadStandardBOQFunction, { "length": lineItems.length }),
      });
      setModalOpen(false);
      loadStandardItems();
    } catch (e: any) {
      setFormError(interpolateUiString(UI_STRINGS.common.value1, { "value1": e.message || UI_STRINGS.common.userMessages.networkErrorSavingItems }));
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------
  // TEMPLATE DOWNLOAD & EXCEL UPLOAD (Correction 2)
  // -------------------------------------------------------------
  const handleDownloadTemplate = () => {
    const headers = [
      'S.No.',
      'Item Code *',
      'Item Description *',
      'BOQ Description',
      'UOM *',
      'Category *',
      'Sub-category',
      'Benchmark Rate (₹)',
      'Brand / Make',
      'Sector',
      'Project Type',
    ];

    const sampleRows = [
      [
        1,
        'STD-CIV-001',
        '600x600 mm Vitrified Floor Tiles (Heavy Traffic)',
        'Full body 10mm thickness, matte anti-skid surface, PEI Group 5',
        'SQFT',
        categories[0]?.name || 'Civil & Interior',
        'Flooring',
        125.0,
        'Somany / Kajaria',
        'RETAIL',
        'Store Fitout',
      ],
      [
        2,
        'STD-ELE-001',
        '2.5 SQMM FRLS Multi-strand Copper Cable',
        '1100V fire-retardant low-smoke copper wire in 25mm PVC conduit',
        'MTR',
        categories.find(c => c.name.toLowerCase().includes('ele'))?.name || 'Electrical',
        'Wiring',
        65.0,
        'Havells / Polycab',
        'RETAIL',
        'Store Fitout',
      ],
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    ws['!cols'] = headers.map(h => ({ wch: Math.max(String(h).length + 4, 18) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Standard_BOQ_Master');
    XLSX.writeFile(wb, 'proCPX_Standard_BOQ_Import_Template.xlsx');
  };

  const validateParsedRows = (rows: any[]): any[] => {
    const categoryNamesLower = new Set(categories.map(c => c.name.toLowerCase()));
    const seenCodes = new Set<string>();

    return rows.map((r) => {
      const errors: string[] = [];
      const itemCode = (r.itemCode || '').trim();
      const category = (r.category || '').trim();
      const standardDescription = (r.standardDescription || '').trim();
      const uom = (r.uom || '').trim().toUpperCase();
      const rateStr = String(r.benchmarkRate || '').trim();

      if (!itemCode) {
        errors.push('Item Code is required');
      } else {
        if (seenCodes.has(itemCode.toLowerCase())) {
          errors.push(`Duplicate item code "${itemCode}" in file`);
        } else {
          seenCodes.add(itemCode.toLowerCase());
        }
        if (items.some(it => it.itemCode.toLowerCase() === itemCode.toLowerCase())) {
          errors.push(`Item code "${itemCode}" already exists in Master`);
        }
      }

      if (!category) {
        errors.push('Category is required');
      } else if (!categoryNamesLower.has(category.toLowerCase())) {
        errors.push(`Category "${category}" not found in Category Master`);
      }

      if (!standardDescription) {
        errors.push('Item Description is required');
      }

      if (!uom) {
        errors.push('UOM is required');
      }

      if (rateStr && isNaN(parseFloat(rateStr))) {
        errors.push(`Benchmark rate "${rateStr}" must be numeric`);
      }

      return {
        ...r,
        itemCode,
        category,
        standardDescription,
        uom,
        errors,
        isValid: errors.length === 0,
      };
    });
  };

  const handleFileSelect = (file: File) => {
    setUploadError(null);
    setUploadFile(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          setUploadError(UI_STRINGS.appAppMastersStandardBoqPage.spreadsheetContainsNoDataRows);
          return;
        }

        const mappedRows = rawJson.map((r, idx) => {
          const itemCode = r['Item Code *'] || r['Item Code'] || r['Code'] || '';
          const category = r['Category *'] || r['Category'] || '';
          const subcategory = r['Subcategory'] || r['Sub-category'] || 'General';
          const standardDescription = r['Item Description *'] || r['Item Description'] || r['Description'] || '';
          const detailedSpecification = r['BOQ Description'] || r['Detailed Specification'] || r['Specification'] || standardDescription;
          const uom = r['UOM *'] || r['UOM'] || r['Unit'] || 'NOS';
          const benchmarkRate = r['Benchmark Rate (₹)'] || r['Benchmark Rate'] || r['Rate'] || '';
          const brandMake = r['Brand / Make'] || r['Brand'] || r['Make'] || '';
          const sector = r['Sector'] || 'RETAIL';
          const projectType = r['Project Type'] || 'Store Fitout';

          return {
            id: `row-${idx + 1}-${Date.now()}`,
            itemCode: String(itemCode).trim(),
            category: String(category).trim(),
            subcategory: String(subcategory).trim(),
            standardDescription: String(standardDescription).trim(),
            detailedSpecification: String(detailedSpecification).trim(),
            uom: String(uom).trim().toUpperCase(),
            benchmarkRate: String(benchmarkRate).trim(),
            brandMake: String(brandMake).trim(),
            sector: String(sector).trim(),
            projectType: String(projectType).trim(),
          };
        });

        const validated = validateParsedRows(mappedRows);
        setUploadParsedRows(validated);
      } catch (err: any) {
        setUploadError(interpolateUiString(UI_STRINGS.appAppMastersStandardBoqPage.failedToParseExcelFileMessage, { "message": err.message }));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUpdateParsedRow = (rowId: string, field: string, val: string) => {
    setUploadParsedRows(prev => {
      const updated = prev.map(r => r.id === rowId ? { ...r, [field]: val } : r);
      return validateParsedRows(updated);
    });
  };

  const handleConfirmImport = async () => {
    const validRows = uploadParsedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      setUploadError(UI_STRINGS.appAppMastersStandardBoqPage.noValidRowsAvailableToImportPleaseCorrectRowErrorsFirst);
      return;
    }

    setImporting(true);
    setUploadError(null);

    try {
      const payload = validRows.map(r => ({
        itemCode: r.itemCode,
        category: r.category,
        subcategory: r.subcategory || 'General',
        standardDescription: r.standardDescription,
        detailedSpecification: r.detailedSpecification || r.standardDescription,
        uom: r.uom,
        benchmarkRate: r.benchmarkRate ? parseFloat(r.benchmarkRate) : null,
        brandMake: r.brandMake || null,
        sector: r.sector || 'RETAIL',
        projectType: r.projectType || 'Store Fitout',
      }));

      const res = await fetch('/api/boq/standard-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        setUploadError(interpolateUiString(UI_STRINGS.common.value1, { "value1": json.error || UI_STRINGS.common.userMessages.failedToImportStandardBoqItems }));
        return;
      }

      setNotification({
        type: 'success',
        message: interpolateUiString(UI_STRINGS.appAppMastersStandardBoqPage.successfullyImportedLengthStandardBOQItemsTheyAreNowLiveInTheCentralMaster, { "length": validRows.length }),
      });
      setUploadModalOpen(false);
      setUploadParsedRows([]);
      setUploadFile(null);
      loadStandardItems();
    } catch (err: any) {
      setUploadError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.networkErrorImportingItems }));
    } finally {
      setImporting(false);
    }
  };

  const filteredItems = items.filter(it => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      it.itemCode.toLowerCase().includes(q) ||
      it.standardDescription.toLowerCase().includes(q) ||
      it.detailedSpecification.toLowerCase().includes(q) ||
      it.category.toLowerCase().includes(q)
    );
  });
  const itemGroups = groupStandardItems(filteredItems);
  // Groups start collapsed; while searching, every matching group opens so results are visible.
  const isGroupOpen = (key: string) => Boolean(search.trim()) || expandedGroups.has(key);
  const toggleGroup = (key: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="w-full">
      <PageHeader
        title={UI_STRINGS.appAppMastersStandardBoqPage.standardBOQCreationCentralMaster}
        subtitle={UI_STRINGS.appAppMastersStandardBoqPage.enterpriseStandardBOQRepositoryItemsCreatedHereAreInstantlyAvailableForDownloadViaDownloadStandardBOQInBOQStudio}
        breadcrumbs={[
          { label: UI_STRINGS.common.masterCreation, href: '/masters/standard-boq' },
          { label: UI_STRINGS.appAppMastersStandardBoqPage.standardBOQMaster },
        ]}
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              className="btn btn-secondary h-[40px] px-3.5 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs"
              onClick={handleDownloadTemplate}
              title={UI_STRINGS.appAppMastersStandardBoqPage.downloadStandardExcelImportTemplate}
            >
              <Download size={14} />{UI_STRINGS.appAppMastersStandardBoqPage.downloadExcelTemplate}</button>

            {canEdit && (
              <button
                type="button"
                className="btn btn-secondary h-[40px] px-3.5 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs text-blue-700 border-blue-200 hover:bg-blue-50"
                onClick={() => {
                  setUploadError(null);
                  setUploadParsedRows([]);
                  setUploadFile(null);
                  setUploadModalOpen(true);
                }}
                title={UI_STRINGS.appAppMastersStandardBoqPage.uploadStandardBOQItemsFromExcelSpreadsheet}
              >
                <Upload size={14} />{UI_STRINGS.appAppMastersStandardBoqPage.uploadExcel}</button>
            )}

            <Link
              href="/boq/studio"
              className="btn btn-secondary h-[40px] px-3.5 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs"
            >
              <FileSpreadsheet size={14} />{UI_STRINGS.common.openBOQStudio}</Link>

            {canEdit ? (
              <button
                type="button"
                className="btn btn-primary h-[40px] px-4 font-semibold inline-flex items-center gap-1.5 shadow-xs"
                onClick={() => handleOpenModal()}
              >
                <Plus size={16} />{UI_STRINGS.appAppMastersStandardBoqPage.createStandardBOQItems}</button>
            ) : (
              <button
                type="button"
                className="btn btn-outline h-[40px] px-4 text-xs font-semibold inline-flex items-center gap-1.5 opacity-60 cursor-not-allowed"
                disabled
                title={UI_STRINGS.common.restrictedMasterDataAdministratorOrCategoryManagerRoleRequired}
              >
                <Plus size={16} />{UI_STRINGS.appAppMastersStandardBoqPage.createStandardBOQAdminOnly}</button>
            )}
          </div>
        }
      />

      {/* Role / Context Banner */}
      {!canEdit && (
        <div className="p-3.5 mb-6 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs flex items-center gap-2.5">
          <ShieldAlert size={18} className="text-slate-500 shrink-0" />
          <div>
            <strong className="text-slate-900">{UI_STRINGS.common.readOnlyMasterView}</strong>{UI_STRINGS.appAppMastersStandardBoqPage.standardBOQItemCreationIsRestrictedToMasterDataAdministratorsAndCategoryManagersProjectUsersCanViewStandardSpecificationsBelowAndUse}<strong>{UI_STRINGS.appAppMastersStandardBoqPage.bOQStudio}</strong>{UI_STRINGS.appAppMastersStandardBoqPage.toDownloadTemplatesEnterProjectQuantitiesAndGenerateProjectBOQs}</div>
        </div>
      )}

      {/* Notification Banner */}
      {notification && (
        <div
          className={`p-3.5 mb-6 rounded-lg border text-xs flex items-center justify-between ${
            notification.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {notification.type === 'success' ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertCircle size={16} className="text-rose-600" />}
            <span>{notification.message}</span>
          </div>
          <button type="button" onClick={() => setNotification(null)} className="text-slate-500 hover:text-slate-700">
            <X size={14} />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <SummaryCardGrid columns={3}>
        <SummaryCard
          label={UI_STRINGS.appAppMastersStandardBoqPage.totalStandardBOQItems}
          value={totalItemCount}
          secondary={UI_STRINGS.appAppMastersStandardBoqPage.availableInDownloadStandardBOQ}
          accent="default"
        />
        <SummaryCard
          label={UI_STRINGS.appAppMastersStandardBoqPage.coveredSectors}
          value={SECTORS.length}
          secondary={UI_STRINGS.appAppMastersStandardBoqPage.retailHospitalityBankingOfficeEtc}
          accent="blue"
        />
        <SummaryCard
          label={UI_STRINGS.appAppMastersStandardBoqPage.integratedArchitecture}
          value="Single Master"
          secondary={UI_STRINGS.appAppMastersStandardBoqPage.feedsBOQStudioWithoutDuplication}
          accent="emerald"
        />
      </SummaryCardGrid>

      {/* Filters Toolbar */}
      <div className="card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Filter size={15} color="#64748b" />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{UI_STRINGS.appAppMastersStandardBoqPage.sector2}</span>
          </div>
          <select
            className="select-field"
            value={sectorFilter}
            onChange={e => setSectorFilter(e.target.value)}
            style={{ width: 170, height: 38 }}
          >
            <option value="">{UI_STRINGS.common.allSectors}</option>
            {SECTORS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{UI_STRINGS.common.category3}</span>
          <select
            className="select-field"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{ width: 220, height: 38 }}
          >
            <option value="">{UI_STRINGS.common.allCategories}</option>
            {categories.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>

          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 12, top: 12 }} />
            <input
              type="text"
              placeholder={UI_STRINGS.appAppMastersStandardBoqPage.searchByCodeDescriptionSpecification}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field"
              style={{ paddingLeft: 34, height: 38, width: '100%', fontSize: 13 }}
            />
          </div>

          <button
            type="button"
            className="btn btn-outline"
            onClick={() => { void loadStandardItems(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, height: 38 }}
          >
            <RefreshCw size={13} />{UI_STRINGS.common.refresh}</button>
        </div>
      </div>

      {/* Items Table */}
      <div className="card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#0f172a' }}>
              {interpolateUiString(UI_STRINGS.appAppMastersStandardBoqPage.standardBoqGroupsHeading, { groups: itemGroups.length, items: filteredItems.length })}
            </h3>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{UI_STRINGS.appAppMastersStandardBoqPage.standardBoqGroupHint}</span>
          </div>
          <span style={{ fontSize: 12, color: '#64748b' }}>{UI_STRINGS.appAppMastersStandardBoqPage.downloadedAutomaticallyViaBOQStudio}</span>
        </div>

        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: '#64748b' }}>{UI_STRINGS.appAppMastersStandardBoqPage.loadingStandardBOQItems}</div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: '#64748b' }}>{UI_STRINGS.appAppMastersStandardBoqPage.noStandardBOQItemsFoundMatchingYourFilters}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc', height: 40, borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0 8px', width: 40 }} aria-label={UI_STRINGS.appAppMastersStandardBoqPage.standardBoqGroupHint} />
                  <th style={{ padding: '0 12px', width: 60 }}>{UI_STRINGS.common.sNo2}</th>
                  <th style={{ padding: '0 12px', minWidth: 180 }}>{UI_STRINGS.common.category2}</th>
                  <th style={{ padding: '0 12px', minWidth: 160 }}>{UI_STRINGS.common.subCategory}</th>
                  <th style={{ padding: '0 12px', width: 140 }}>{UI_STRINGS.appAppMastersStandardBoqPage.groupSectorsColumn}</th>
                  <th style={{ padding: '0 12px', width: 100 }}>{UI_STRINGS.appAppMastersStandardBoqPage.groupItemsColumn}</th>
                  <th style={{ padding: '0 12px', width: 170, textAlign: 'right' }}>{UI_STRINGS.appAppMastersStandardBoqPage.groupRateRangeColumn}</th>
                  <th style={{ padding: '0 12px', width: 90 }}>{UI_STRINGS.common.status}</th>
                  <th style={{ padding: '0 12px', width: 120, textAlign: 'right' }}>{UI_STRINGS.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {itemGroups.map((group, groupIndex) => {
                  const open = isGroupOpen(group.key);
                  const toggleLabel = interpolateUiString(
                    open ? UI_STRINGS.appAppMastersStandardBoqPage.hideGroupItems : UI_STRINGS.appAppMastersStandardBoqPage.showGroupItems,
                    { category: group.category, subcategory: group.subcategory },
                  );
                  const rateText = group.minRate === null || group.maxRate === null
                    ? UI_STRINGS.common.copy4s9bsz
                    : group.minRate === group.maxRate
                      ? interpolateUiString(UI_STRINGS.common.toLocaleString, { toLocaleString: group.minRate.toLocaleString() })
                      : interpolateUiString(UI_STRINGS.appAppMastersStandardBoqPage.groupRateRange, { min: group.minRate.toLocaleString(), max: group.maxRate.toLocaleString() });
                  return (
                    <Fragment key={group.key}>
                      <tr
                        onClick={() => toggleGroup(group.key)}
                        style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer', background: open ? '#eff6ff' : '#ffffff' }}
                      >
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-label={toggleLabel}
                            title={toggleLabel}
                            onClick={(event) => { event.stopPropagation(); toggleGroup(group.key); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1e40af', display: 'inline-flex', padding: 2 }}
                          >
                            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td style={{ padding: '12px', color: '#64748b', fontWeight: 600 }}>{groupIndex + 1}</td>
                        <td style={{ padding: '12px', color: '#0f172a', fontWeight: 700, fontSize: 13 }}>{group.category}</td>
                        <td style={{ padding: '12px', color: '#334155', fontWeight: 600 }}>{group.subcategory}</td>
                        <td style={{ padding: '12px', color: '#475569', fontSize: 11, fontWeight: 600 }}>{group.sectors.join(', ')}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#e0e7ff', color: '#3730a3' }}>
                            {interpolateUiString(UI_STRINGS.appAppMastersStandardBoqPage.groupItemCount, { count: group.items.length })}
                          </span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#047857' }}>{rateText}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#ecfdf5', color: '#047857' }}>{UI_STRINGS.common.aCTIVE}</span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          {canEdit && (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleOpenModal({ category: group.category, subcategory: group.subcategory, sector: group.sectors[0] || 'RETAIL' });
                              }}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '4px 10px', background: '#ffffff' }}
                            >
                              <Plus size={12} />{UI_STRINGS.appAppMastersStandardBoqPage.addItemToGroup}</button>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td colSpan={9} style={{ padding: '8px 12px 14px 48px', background: '#f8fafc' }}>
                            <table className="table" style={{ width: '100%', fontSize: 12, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                              <thead>
                                <tr style={{ background: '#f1f5f9', height: 36, textAlign: 'left' }}>
                                  <th style={{ padding: '0 12px', width: 60 }}>{UI_STRINGS.common.sNo2}</th>
                                  <th style={{ padding: '0 12px', width: 120 }}>{UI_STRINGS.common.itemCode}</th>
                                  <th style={{ padding: '0 12px', minWidth: 200 }}>{UI_STRINGS.common.itemDescription}</th>
                                  <th style={{ padding: '0 12px', minWidth: 220 }}>{UI_STRINGS.common.bOQDescription}</th>
                                  <th style={{ padding: '0 12px', width: 70, textAlign: 'center' }}>{UI_STRINGS.common.uOM}</th>
                                  <th style={{ padding: '0 12px', width: 120, textAlign: 'right' }}>{UI_STRINGS.common.benchmarkRate}</th>
                                  <th style={{ padding: '0 12px', width: 90 }}>{UI_STRINGS.common.sector}</th>
                                  <th style={{ padding: '0 12px', width: 80 }}>{UI_STRINGS.common.status}</th>
                                </tr>
                              </thead>
                              <tbody>
                {group.items.map((it, idx) => (
                  <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px', color: '#64748b', fontWeight: 600 }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 800, color: '#1e40af', fontFamily: 'monospace' }}>
                      {it.itemCode}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 600, color: '#0f172a' }}>
                      {it.standardDescription}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <SpecificationCell
                        specification={it.detailedSpecification}
                        lineNumber={it.itemCode}
                        itemDescription={it.standardDescription}
                        maxWidth={220}
                      />
                    </td>
                    <td style={{ padding: '12px', fontWeight: 700, color: '#1e3a8a', textAlign: 'center' }}>
                      {it.uom}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#047857' }}>
                      {it.benchmarkRate ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": it.benchmarkRate.toLocaleString() }) : UI_STRINGS.common.copy4s9bsz}
                    </td>
                    <td style={{ padding: '12px', color: '#475569', fontSize: 11, fontWeight: 600 }}>
                      {it.sector}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#ecfdf5', color: '#047857' }}>{UI_STRINGS.common.aCTIVE}</span>
                    </td>
                  </tr>
                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && hasMoreItems && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 12, borderTop: '1px solid #e2e8f0' }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={loadingMoreItems} onClick={() => { void loadStandardItems(true); }}>
              {loadingMoreItems ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}
            </button>
          </div>
        )}
      </div>

      {/* CREATE MULTI-ITEM STANDARD BOQ MODAL */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: '100%', maxWidth: 960, maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BookOpen size={20} color="#2563eb" />
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#0f172a' }}>{UI_STRINGS.appAppMastersStandardBoqPage.createStandardBOQMasterItems}</h3>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, color: '#b91c1c', fontSize: 12 }}>
                <AlertCircle size={15} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              {/* Group Parameters */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>{UI_STRINGS.appAppMastersStandardBoqPage.sector}</label>
                  <select
                    className="select-field"
                    value={sector}
                    onChange={e => setSector(e.target.value)}
                    style={{ width: '100%', height: 34, fontSize: 12 }}
                    required
                  >
                    {SECTORS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>{UI_STRINGS.appAppMastersStandardBoqPage.projectType}</label>
                  <input
                    type="text"
                    placeholder={UI_STRINGS.appAppMastersStandardBoqPage.eGStoreFitout}
                    value={projectType}
                    onChange={e => setProjectType(e.target.value)}
                    className="input-field"
                    style={{ width: '100%', height: 34, fontSize: 12 }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>{UI_STRINGS.appAppMastersStandardBoqPage.category}</label>
                  <select
                    className="select-field"
                    value={selectedCategory}
                    onChange={e => setSelectedCategory(e.target.value)}
                    style={{ width: '100%', height: 34, fontSize: 12 }}
                    required
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>{UI_STRINGS.common.subcategory}</label>
                  <input
                    type="text"
                    placeholder={UI_STRINGS.appAppMastersStandardBoqPage.eGFlooringWiring}
                    value={selectedSubcategory}
                    onChange={e => setSelectedSubcategory(e.target.value)}
                    className="input-field"
                    style={{ width: '100%', height: 34, fontSize: 12 }}
                  />
                </div>
              </div>

              {/* Multi-Row Items Table */}
              <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 16 }}>
                <table className="table" style={{ width: '100%', fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 10 }}>
                    <tr style={{ height: 36, borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '0 8px', width: 50 }}>{UI_STRINGS.common.sNo2}</th>
                      <th style={{ padding: '0 8px', width: 130 }}>{UI_STRINGS.appAppMastersStandardBoqPage.itemCode}</th>
                      <th style={{ padding: '0 8px', width: 260 }}>{UI_STRINGS.common.itemDescription2}</th>
                      <th style={{ padding: '0 8px', width: 220 }}>{UI_STRINGS.common.bOQDescription}</th>
                      <th style={{ padding: '0 8px', width: 100 }}>{UI_STRINGS.common.uOM2}</th>
                      <th style={{ padding: '0 8px', width: 100 }}>{UI_STRINGS.common.rate}</th>
                      <th style={{ padding: '0 8px', width: 50, textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((line, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 8px', color: '#64748b', fontWeight: 600 }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            type="text"
                            placeholder={UI_STRINGS.appAppMastersStandardBoqPage.sTDCIV001}
                            value={line.itemCode}
                            onChange={e => handleUpdateRow(idx, 'itemCode', e.target.value)}
                            className="input-field font-mono"
                            style={{ width: '100%', height: 32, fontSize: 12 }}
                            required
                          />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            type="text"
                            placeholder={UI_STRINGS.appAppMastersStandardBoqPage.eGVitrifiedFloorTile600x600}
                            value={line.description}
                            onChange={e => handleUpdateRow(idx, 'description', e.target.value)}
                            className="input-field"
                            style={{ width: '100%', height: 32, fontSize: 12 }}
                            required
                          />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            type="text"
                            placeholder={UI_STRINGS.appAppMastersStandardBoqPage.detailedTechnicalSpec}
                            value={line.specification}
                            onChange={e => handleUpdateRow(idx, 'specification', e.target.value)}
                            className="input-field"
                            style={{ width: '100%', height: 32, fontSize: 12 }}
                          />
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <select
                            className="select-field"
                            value={line.uom}
                            onChange={e => handleUpdateRow(idx, 'uom', e.target.value)}
                            style={{ width: '100%', height: 32, fontSize: 12 }}
                            required
                          >
                            {COMMON_UOMS.map(u => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            type="number"
                            placeholder={UI_STRINGS.common.copywwhtor}
                            value={line.rate}
                            onChange={e => handleUpdateRow(idx, 'rate', e.target.value)}
                            className="input-field"
                            style={{ width: '100%', height: 32, fontSize: 12, textAlign: 'right' }}
                            step="0.01"
                          />
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(idx)}
                            disabled={lineItems.length === 1}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: lineItems.length === 1 ? 'not-allowed' : 'pointer',
                              color: lineItems.length === 1 ? '#cbd5e1' : '#ef4444',
                              padding: 4,
                            }}
                            title={UI_STRINGS.appAppMastersStandardBoqPage.removeRow}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add Row Button */}
              <div style={{ marginBottom: 16 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleAddRow}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                >
                  <Plus size={14} />{UI_STRINGS.appAppMastersStandardBoqPage.addAnotherStandardItem}</button>
              </div>

              {/* Modal Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  {lineItems.length}{UI_STRINGS.appAppMastersStandardBoqPage.standardItem}{lineItems.length > 1 ? UI_STRINGS.common.s : ''}{UI_STRINGS.appAppMastersStandardBoqPage.readyToSave}</span>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setModalOpen(false)}
                    disabled={saving}
                  >{UI_STRINGS.common.cancel}</button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={saving}
                    style={{ fontWeight: 700 }}
                  >
                    {saving ? UI_STRINGS.common.saving : interpolateUiString(UI_STRINGS.appAppMastersStandardBoqPage.saveLengthItemValue2ToMaster, { "length": lineItems.length, "value2": lineItems.length > 1 ? 's' : '' })}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UPLOAD EXCEL MODAL (Correction 2) */}
      {uploadModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 1100, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            {/* Modal Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FileSpreadsheet size={20} color="#2563eb" />
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#0f172a' }}>{UI_STRINGS.appAppMastersStandardBoqPage.uploadStandardBOQItemsExcelImport}</h3>
                  <span style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.appAppMastersStandardBoqPage.importCatalogItemsFromExcelValidatesAgainstCategoryMasterUOMsAndDuplicateItemCodes}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
              {uploadError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#b91c1c', fontSize: 12 }}>
                  <AlertCircle size={16} />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Upload Dropzone */}
              {uploadParsedRows.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', border: '2px dashed #cbd5e1', borderRadius: 8, background: '#f8fafc', textAlign: 'center' }}>
                  <Upload size={40} color="#3b82f6" style={{ marginBottom: 12 }} />
                  <h4 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px 0', color: '#0f172a' }}>{UI_STRINGS.appAppMastersStandardBoqPage.selectOrDropStandardBOQExcelSpreadsheet}</h4>
                  <p style={{ fontSize: 12, color: '#64748b', maxWidth: 500, margin: '0 0 18px 0' }}>{UI_STRINGS.appAppMastersStandardBoqPage.uploadYourFilledStandardTemplateRequiresItemCodeCategoryMatchingCategoryMasterDescriptionAndUOM}</p>

                  <input
                    type="file"
                    ref={uploadFileInputRef}
                    accept=".xlsx,.xls"
                    style={{ display: 'none' }}
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileSelect(e.target.files[0]);
                      }
                    }}
                  />

                  <div style={{ display: 'flex', gap: 12 }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => uploadFileInputRef.current?.click()}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}
                    >
                      <FileUp size={16} />{UI_STRINGS.appAppMastersStandardBoqPage.chooseExcelFile}</button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={handleDownloadTemplate}
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <Download size={14} />{UI_STRINGS.appAppMastersStandardBoqPage.downloadBlankTemplate}</button>
                  </div>
                </div>
              ) : (
                <div>
                  {/* File Info Bar & Validation Summary */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: '12px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <FileSpreadsheet size={18} color="#2563eb" />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{uploadFile?.name}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.common.copychzfvb}{uploadParsedRows.length}{UI_STRINGS.appAppMastersStandardBoqPage.totalRowsParsed}</span>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadParsedRows([]);
                          setUploadFile(null);
                        }}
                        style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >{UI_STRINGS.appAppMastersStandardBoqPage.chooseDifferentFile}</button>
                    </div>
                  </div>

                  {/* Summary KPI Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
                    <div style={{ padding: 12, borderRadius: 6, background: '#f1f5f9', border: '1px solid #cbd5e1' }}>
                      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{UI_STRINGS.common.totalRows}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{uploadParsedRows.length}</div>
                    </div>
                    <div style={{ padding: 12, borderRadius: 6, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                      <div style={{ fontSize: 11, color: '#047857', fontWeight: 600, textTransform: 'uppercase' }}>{UI_STRINGS.appAppMastersStandardBoqPage.validReadyToSave}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#047857' }}>
                        {uploadParsedRows.filter(r => r.isValid).length}
                      </div>
                    </div>
                    <div style={{ padding: 12, borderRadius: 6, background: uploadParsedRows.some(r => !r.isValid) ? '#fef2f2' : '#f8fafc', border: `1px solid ${uploadParsedRows.some(r => !r.isValid) ? '#fecaca' : '#e2e8f0'}` }}>
                      <div style={{ fontSize: 11, color: uploadParsedRows.some(r => !r.isValid) ? '#b91c1c' : '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{UI_STRINGS.appAppMastersStandardBoqPage.errorsToCorrect}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: uploadParsedRows.some(r => !r.isValid) ? '#b91c1c' : '#64748b' }}>
                        {uploadParsedRows.filter(r => !r.isValid).length}
                      </div>
                    </div>
                  </div>

                  {/* Filter Pills */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(['ALL', 'VALID', 'INVALID'] as const).map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setUploadFilter(f)}
                          style={{
                            padding: '4px 12px',
                            fontSize: 11,
                            fontWeight: 700,
                            borderRadius: 14,
                            border: uploadFilter === f ? '1px solid #2563eb' : '1px solid #cbd5e1',
                            background: uploadFilter === f ? '#eff6ff' : '#ffffff',
                            color: uploadFilter === f ? '#1d4ed8' : '#64748b',
                            cursor: 'pointer',
                          }}
                        >
                          {f === 'ALL' && interpolateUiString(UI_STRINGS.appAppMastersStandardBoqPage.allRowsLength, { "length": uploadParsedRows.length })}
                          {f === 'VALID' && interpolateUiString(UI_STRINGS.appAppMastersStandardBoqPage.validOnlyLength, { "length": uploadParsedRows.filter(r => r.isValid).length })}
                          {f === 'INVALID' && interpolateUiString(UI_STRINGS.appAppMastersStandardBoqPage.errorsOnlyLength, { "length": uploadParsedRows.filter(r => !r.isValid).length })}
                        </button>
                      ))}
                    </div>

                    <span style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.appAppMastersStandardBoqPage.youCanEditInvalidFieldsDirectlyBelowToFixErrorsBeforeSaving}</span>
                  </div>

                  {/* Preview Table */}
                  <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, maxHeight: 380, overflowY: 'auto' }}>
                    <table className="table" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', height: 36, borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                          <th style={{ padding: '0 10px', width: 60 }}>{UI_STRINGS.common.status}</th>
                          <th style={{ padding: '0 8px', width: 50 }}>{UI_STRINGS.common.sNo2}</th>
                          <th style={{ padding: '0 10px', width: 120 }}>{UI_STRINGS.appAppMastersStandardBoqPage.itemCode}</th>
                          <th style={{ padding: '0 10px', width: 150 }}>{UI_STRINGS.appAppMastersStandardBoqPage.category}</th>
                          <th style={{ padding: '0 10px', width: 120 }}>{UI_STRINGS.common.subCategory}</th>
                          <th style={{ padding: '0 10px', width: 180 }}>{UI_STRINGS.common.itemDescription2}</th>
                          <th style={{ padding: '0 10px', width: 180 }}>{UI_STRINGS.common.bOQDescription}</th>
                          <th style={{ padding: '0 10px', width: 85 }}>{UI_STRINGS.common.uOM2}</th>
                          <th style={{ padding: '0 10px', width: 95 }}>{UI_STRINGS.common.rate}</th>
                          <th style={{ padding: '0 10px' }}>{UI_STRINGS.appAppMastersStandardBoqPage.validationDetails}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadParsedRows
                          .filter(r => {
                            if (uploadFilter === 'VALID') return r.isValid;
                            if (uploadFilter === 'INVALID') return !r.isValid;
                            return true;
                          })
                          .map((row, idx) => (
                            <tr
                              key={row.id}
                              style={{
                                borderBottom: '1px solid #f1f5f9',
                                background: row.isValid ? '#ffffff' : '#fef2f2',
                              }}
                            >
                              <td style={{ padding: '8px 10px', verticalAlign: 'middle' }}>
                                {row.isValid ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#047857', fontWeight: 700, fontSize: 11 }}>
                                    <Check size={14} />{UI_STRINGS.appAppMastersStandardBoqPage.oK}</span>
                                ) : (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#b91c1c', fontWeight: 700, fontSize: 11 }}>
                                    <AlertTriangle size={14} />{UI_STRINGS.appAppMastersStandardBoqPage.err}</span>
                                )}
                              </td>
                              <td style={{ padding: '6px 8px', color: '#64748b', fontWeight: 600 }}>
                                {idx + 1}
                              </td>
                              <td style={{ padding: '6px 10px' }}>
                                <input
                                  type="text"
                                  value={row.itemCode}
                                  onChange={e => handleUpdateParsedRow(row.id, 'itemCode', e.target.value)}
                                  className="input-field"
                                  style={{ width: '100%', height: 30, fontSize: 11, padding: '2px 6px', borderColor: !row.itemCode ? '#ef4444' : undefined }}
                                />
                              </td>
                              <td style={{ padding: '6px 10px' }}>
                                <select
                                  value={row.category}
                                  onChange={e => handleUpdateParsedRow(row.id, 'category', e.target.value)}
                                  className="select-field"
                                  style={{ width: '100%', height: 30, fontSize: 11, padding: '2px 4px', borderColor: row.errors.some(e => e.includes('Category')) ? '#ef4444' : undefined }}
                                >
                                  <option value="">{UI_STRINGS.appAppMastersStandardBoqPage.selectCategory}</option>
                                  {categories.map(c => (
                                    <option key={c.id} value={c.name}>{c.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: '6px 10px' }}>
                                <input
                                  type="text"
                                  value={row.subcategory}
                                  onChange={e => handleUpdateParsedRow(row.id, 'subcategory', e.target.value)}
                                  className="input-field"
                                  style={{ width: '100%', height: 30, fontSize: 11, padding: '2px 6px' }}
                                  placeholder={UI_STRINGS.common.subCategory}
                                />
                              </td>
                              <td style={{ padding: '6px 10px' }}>
                                <input
                                  type="text"
                                  value={row.standardDescription}
                                  onChange={e => handleUpdateParsedRow(row.id, 'standardDescription', e.target.value)}
                                  className="input-field"
                                  style={{ width: '100%', height: 30, fontSize: 11, padding: '2px 6px', borderColor: !row.standardDescription ? '#ef4444' : undefined }}
                                />
                              </td>
                              <td style={{ padding: '6px 10px' }}>
                                <input
                                  type="text"
                                  value={row.detailedSpecification}
                                  onChange={e => handleUpdateParsedRow(row.id, 'detailedSpecification', e.target.value)}
                                  className="input-field"
                                  style={{ width: '100%', height: 30, fontSize: 11, padding: '2px 6px' }}
                                  placeholder={UI_STRINGS.common.bOQDescription}
                                />
                              </td>
                              <td style={{ padding: '6px 10px' }}>
                                <select
                                  value={row.uom}
                                  onChange={e => handleUpdateParsedRow(row.id, 'uom', e.target.value)}
                                  className="select-field"
                                  style={{ width: '100%', height: 30, fontSize: 11, padding: '2px 4px' }}
                                >
                                  {COMMON_UOMS.map(u => (
                                    <option key={u} value={u}>{u}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: '6px 10px' }}>
                                <input
                                  type="text"
                                  value={row.benchmarkRate}
                                  onChange={e => handleUpdateParsedRow(row.id, 'benchmarkRate', e.target.value)}
                                  className="input-field"
                                  style={{ width: '100%', height: 30, fontSize: 11, padding: '2px 6px' }}
                                  placeholder={UI_STRINGS.common.copywwhtor}
                                />
                              </td>
                              <td style={{ padding: '6px 10px', fontSize: 11 }}>
                                {row.isValid ? (
                                  <span style={{ color: '#059669', fontWeight: 600 }}>{UI_STRINGS.appAppMastersStandardBoqPage.readyToImport}</span>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {row.errors.map((err, eIdx) => (
                                      <span key={eIdx} style={{ color: '#b91c1c', fontWeight: 600 }}>{UI_STRINGS.common.copyaw0l2d}{err}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {uploadParsedRows.length > 0 && (
              <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#475569' }}>
                  <strong>{uploadParsedRows.filter(r => r.isValid).length}</strong>{UI_STRINGS.common.of}<strong>{uploadParsedRows.length}</strong>{UI_STRINGS.appAppMastersStandardBoqPage.itemsValidAndReadyToImport}</span>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setUploadModalOpen(false)}
                    disabled={importing}
                  >{UI_STRINGS.common.cancel}</button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleConfirmImport}
                    disabled={importing || uploadParsedRows.filter(r => r.isValid).length === 0}
                    style={{ fontWeight: 700 }}
                  >
                    {importing
                      ? UI_STRINGS.appAppMastersStandardBoqPage.importing
                      : interpolateUiString(UI_STRINGS.appAppMastersStandardBoqPage.confirmImportLengthValidItems, { "length": uploadParsedRows.filter(r => r.isValid).length })}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
