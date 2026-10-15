'use client';
// src/app/(app)/masters/standard-boq/page.tsx - Standard BOQ Creation & Central Master
import { useState, useEffect, useRef } from 'react';
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
  Layers,
  ArrowRight,
  RefreshCw,
  FileSpreadsheet,
  Upload,
  FileUp,
  AlertTriangle,
  Check,
} from 'lucide-react';

interface StandardItem {
  id: string;
  itemCode: string;
  sector: string;
  projectType: string;
  category: string;
  subcategory: string;
  standardDescription: string;
  detailedSpecification: string;
  uom: string;
  brandMake: string | null;
  benchmarkRate: number | null;
  isActive: boolean;
  createdAt: string;
}

const COMMON_UOMS = ['SQFT', 'NOS', 'RMT', 'SQM', 'KG', 'LOT', 'MTR', 'SET', 'TON', 'BAG', 'LTR'];
const SECTORS = ['RETAIL', 'HOSPITALITY', 'BANKING', 'INSURANCE', 'OFFICE', 'OTHER'];

export default function StandardBoqCreationPage() {
  const [items, setItems] = useState<StandardItem[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');

  // Filters
  const [sectorFilter, setSectorFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');

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

  const loadStandardItems = async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (sectorFilter && sectorFilter !== 'ALL') q.set('sector', sectorFilter);
      if (categoryFilter && categoryFilter !== 'ALL') q.set('category', categoryFilter);
      if (search) q.set('search', search);

      const res = await fetch(`/api/boq/standard-library?${q.toString()}`);
      if (res.ok) {
        const d = await res.json();
        setItems(d.data || d || []);
      }
    } catch (e: any) {
      setNotification({ type: 'error', message: 'Failed to load standard BOQ items.' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = () => {
    if (!canEdit) return;
    setFormError(null);
    if (!selectedCategory && categories.length > 0) {
      setSelectedCategory(categories[0].name);
    }
    // Auto-generate starting code if empty
    const codePrefix = 'STD-' + (selectedCategory ? selectedCategory.substring(0, 3).toUpperCase() : 'CIV');
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
      setFormError('Please select a Category.');
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
        setFormError(`Line #${lineNum}: Item Code is required.`);
        return;
      }
      if (!desc) {
        setFormError(`Line #${lineNum} (${code}): Description is required.`);
        return;
      }
      if (!uom) {
        setFormError(`Line #${lineNum} (${code}): UOM is required.`);
        return;
      }

      if (seenCodes.has(code.toLowerCase())) {
        setFormError(`Duplicate item code in table: "${code}".`);
        return;
      }
      seenCodes.add(code.toLowerCase());

      // Check against existing items
      if (items.some(it => it.itemCode.toLowerCase() === code.toLowerCase())) {
        setFormError(`Item code "${code}" already exists in the central Standard BOQ Master.`);
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
        setFormError(json.error || 'Failed to save standard BOQ items.');
        return;
      }

      setNotification({
        type: 'success',
        message: `Successfully created ${lineItems.length} standard BOQ items! They are now available in BOQ Studio's Download Standard BOQ function.`,
      });
      setModalOpen(false);
      loadStandardItems();
    } catch (e: any) {
      setFormError(e.message || 'Network error saving items.');
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------
  // TEMPLATE DOWNLOAD & EXCEL UPLOAD (Correction 2)
  // -------------------------------------------------------------
  const handleDownloadTemplate = () => {
    const headers = [
      'Item Code *',
      'Category *',
      'Subcategory',
      'Item Description *',
      'BOQ Description',
      'UOM *',
      'Benchmark Rate (₹)',
      'Brand / Make',
      'Sector',
      'Project Type',
    ];

    const sampleRows = [
      [
        'STD-CIV-001',
        categories[0]?.name || 'Civil & Interior',
        'Flooring',
        '600x600 mm Vitrified Floor Tiles (Heavy Traffic)',
        'Full body 10mm thickness, matte anti-skid surface, PEI Group 5',
        'SQFT',
        125.0,
        'Somany / Kajaria',
        'RETAIL',
        'Store Fitout',
      ],
      [
        'STD-ELE-001',
        categories.find(c => c.name.toLowerCase().includes('ele'))?.name || 'Electrical',
        'Wiring',
        '2.5 SQMM FRLS Multi-strand Copper Cable',
        '1100V fire-retardant low-smoke copper wire in 25mm PVC conduit',
        'MTR',
        65.0,
        'Havells / Polycab',
        'RETAIL',
        'Store Fitout',
      ],
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 18) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Standard_BOQ_Master');
    XLSX.writeFile(wb, 'proCPX_Standard_BOQ_Import_Template.xlsx');
  };

  const validateParsedRows = (rows: any[]): any[] => {
    const categoryNamesLower = new Set(categories.map(c => c.name.toLowerCase()));
    const seenCodes = new Set<string>();

    return rows.map((r, idx) => {
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
          setUploadError('Spreadsheet contains no data rows.');
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
        setUploadError(`Failed to parse Excel file: ${err.message}`);
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
      setUploadError('No valid rows available to import. Please correct row errors first.');
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
        setUploadError(json.error || 'Failed to import standard BOQ items.');
        return;
      }

      setNotification({
        type: 'success',
        message: `Successfully imported ${validRows.length} standard BOQ items! They are now live in the central master.`,
      });
      setUploadModalOpen(false);
      setUploadParsedRows([]);
      setUploadFile(null);
      loadStandardItems();
    } catch (err: any) {
      setUploadError(err.message || 'Network error importing items.');
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

  return (
    <div className="container" style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>Master Creation</span>
            <span style={{ color: '#cbd5e1' }}>/</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1e40af' }}>Standard BOQ Master</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Standard BOQ Creation & Central Master
          </h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0 0' }}>
            Enterprise Standard BOQ repository. Items created here are instantly available for download via Download Standard BOQ in BOQ Studio.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleDownloadTemplate}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}
            title="Download standard Excel import template"
          >
            <Download size={15} />
            Download Excel Template
          </button>

          {canEdit && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setUploadError(null);
                setUploadParsedRows([]);
                setUploadFile(null);
                setUploadModalOpen(true);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, borderColor: '#2563eb', color: '#1d4ed8' }}
              title="Upload standard BOQ items from Excel spreadsheet"
            >
              <Upload size={15} />
              Upload Excel
            </button>
          )}

          <Link
            href="/boq/studio"
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}
          >
            <FileSpreadsheet size={15} />
            Open BOQ Studio
          </Link>

          {canEdit ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleOpenModal}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}
            >
              <Plus size={16} />
              + Create Standard BOQ Items
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-outline"
              disabled
              title="Restricted: Master Data Administrator or Category Manager role required"
              style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.6, cursor: 'not-allowed', color: '#64748b' }}
            >
              <Plus size={16} />
              + Create Standard BOQ (Admin Only)
            </button>
          )}
        </div>
      </div>

      {/* Role / Context Banner */}
      {!canEdit && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <ShieldAlert size={18} color="#64748b" />
          <div style={{ fontSize: 13, color: '#475569' }}>
            <strong style={{ color: '#0f172a' }}>Read-Only Master View:</strong> Standard BOQ item creation is restricted to Master Data Administrators and Category Managers. Project Users can view standard specifications below and use <strong>BOQ Studio</strong> to download templates, enter project quantities, and generate project BOQs.
          </div>
        </div>
      )}

      {/* Notification Banner */}
      {notification && (
        <div
          style={{
            background: notification.type === 'success' ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${notification.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: notification.type === 'success' ? '#047857' : '#b91c1c', fontSize: 13, fontWeight: 600 }}>
            {notification.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{notification.message}</span>
          </div>
          <button type="button" onClick={() => setNotification(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Total Standard BOQ Items</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{items.length}</div>
          <div style={{ fontSize: 11, color: '#16a34a', marginTop: 4, fontWeight: 600 }}>Available in Download Standard BOQ</div>
        </div>

        <div className="card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Covered Sectors</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563eb', marginTop: 4 }}>{SECTORS.length}</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Retail, Hospitality, Banking, Office, etc.</div>
        </div>

        <div className="card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Integrated Architecture</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#059669', marginTop: 4 }}>Single Master</div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Feeds BOQ Studio without duplication</div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Filter size={15} color="#64748b" />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Sector:</span>
          </div>
          <select
            className="select-field"
            value={sectorFilter}
            onChange={e => setSectorFilter(e.target.value)}
            style={{ width: 170, height: 38 }}
          >
            <option value="">All Sectors</option>
            {SECTORS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Category:</span>
          <select
            className="select-field"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{ width: 220, height: 38 }}
          >
            <option value="">All Categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>

          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 12, top: 12 }} />
            <input
              type="text"
              placeholder="Search by code, description, specification..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field"
              style={{ paddingLeft: 34, height: 38, width: '100%', fontSize: 13 }}
            />
          </div>

          <button
            type="button"
            className="btn btn-outline"
            onClick={loadStandardItems}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, height: 38 }}
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Items Table */}
      <div className="card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#0f172a' }}>
            Standard BOQ Master Items ({filteredItems.length})
          </h3>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            Downloaded automatically via BOQ Studio
          </span>
        </div>

        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: '#64748b' }}>
            Loading Standard BOQ Items...
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: '#64748b' }}>
            No standard BOQ items found matching your filters.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc', height: 40, borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0 12px', width: 120 }}>Item Code</th>
                  <th style={{ padding: '0 12px', width: 100 }}>Sector</th>
                  <th style={{ padding: '0 12px', width: 150 }}>Category</th>
                  <th style={{ padding: '0 12px' }}>Description & Specification</th>
                  <th style={{ padding: '0 12px', width: 80 }}>UOM</th>
                  <th style={{ padding: '0 12px', width: 110, textAlign: 'right' }}>Benchmark</th>
                  <th style={{ padding: '0 12px', width: 90 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(it => (
                  <tr key={it.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px', fontWeight: 800, color: '#1e40af', fontFamily: 'monospace' }}>
                      {it.itemCode}
                    </td>
                    <td style={{ padding: '12px', color: '#475569', fontSize: 11, fontWeight: 600 }}>
                      {it.sector}
                    </td>
                    <td style={{ padding: '12px', color: '#0f172a', fontWeight: 600 }}>
                      <div>{it.category}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{it.subcategory}</div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{it.standardDescription}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{it.detailedSpecification}</div>
                    </td>
                    <td style={{ padding: '12px', fontWeight: 700, color: '#1e3a8a' }}>
                      {it.uom}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#047857' }}>
                      {it.benchmarkRate ? `₹ ${it.benchmarkRate.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: '#ecfdf5', color: '#047857' }}>
                        ACTIVE
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#0f172a' }}>
                  Create Standard BOQ Master Items
                </h3>
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
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Sector *
                  </label>
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
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Project Type *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Store Fitout"
                    value={projectType}
                    onChange={e => setProjectType(e.target.value)}
                    className="input-field"
                    style={{ width: '100%', height: 34, fontSize: 12 }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Category *
                  </label>
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
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Subcategory
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Flooring, Wiring"
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
                      <th style={{ padding: '0 8px', width: 130 }}>Item Code *</th>
                      <th style={{ padding: '0 8px', width: 260 }}>Description *</th>
                      <th style={{ padding: '0 8px', width: 220 }}>Specification</th>
                      <th style={{ padding: '0 8px', width: 100 }}>UOM *</th>
                      <th style={{ padding: '0 8px', width: 100 }}>Rate (₹)</th>
                      <th style={{ padding: '0 8px', width: 50, textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((line, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 8px' }}>
                          <input
                            type="text"
                            placeholder="STD-CIV-001"
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
                            placeholder="e.g. Vitrified Floor Tile 600x600"
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
                            placeholder="Detailed technical spec..."
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
                            placeholder="0.00"
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
                            title="Remove row"
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
                  <Plus size={14} />
                  + Add Another Standard Item
                </button>
              </div>

              {/* Modal Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>
                  {lineItems.length} standard item{lineItems.length > 1 ? 's' : ''} ready to save.
                </span>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setModalOpen(false)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={saving}
                    style={{ fontWeight: 700 }}
                  >
                    {saving ? 'Saving...' : `Save ${lineItems.length} Item${lineItems.length > 1 ? 's' : ''} to Master`}
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
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#0f172a' }}>
                    Upload Standard BOQ Items (Excel Import)
                  </h3>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    Import catalog items from Excel. Validates against Category Master, UOMs, and duplicate item codes.
                  </span>
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
                  <h4 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px 0', color: '#0f172a' }}>
                    Select or Drop Standard BOQ Excel Spreadsheet
                  </h4>
                  <p style={{ fontSize: 12, color: '#64748b', maxWidth: 500, margin: '0 0 18px 0' }}>
                    Upload your filled standard template. Requires Item Code, Category (matching Category Master), Description, and UOM.
                  </p>

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
                      <FileUp size={16} />
                      Choose Excel File
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={handleDownloadTemplate}
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <Download size={14} />
                      Download Blank Template
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {/* File Info Bar & Validation Summary */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: '12px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <FileSpreadsheet size={18} color="#2563eb" />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{uploadFile?.name}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>({uploadParsedRows.length} total rows parsed)</span>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadParsedRows([]);
                          setUploadFile(null);
                        }}
                        style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Choose Different File
                      </button>
                    </div>
                  </div>

                  {/* Summary KPI Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
                    <div style={{ padding: 12, borderRadius: 6, background: '#f1f5f9', border: '1px solid #cbd5e1' }}>
                      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total Rows</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{uploadParsedRows.length}</div>
                    </div>
                    <div style={{ padding: 12, borderRadius: 6, background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                      <div style={{ fontSize: 11, color: '#047857', fontWeight: 600, textTransform: 'uppercase' }}>Valid (Ready to Save)</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#047857' }}>
                        {uploadParsedRows.filter(r => r.isValid).length}
                      </div>
                    </div>
                    <div style={{ padding: 12, borderRadius: 6, background: uploadParsedRows.some(r => !r.isValid) ? '#fef2f2' : '#f8fafc', border: `1px solid ${uploadParsedRows.some(r => !r.isValid) ? '#fecaca' : '#e2e8f0'}` }}>
                      <div style={{ fontSize: 11, color: uploadParsedRows.some(r => !r.isValid) ? '#b91c1c' : '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Errors to Correct</div>
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
                          {f === 'ALL' && `All Rows (${uploadParsedRows.length})`}
                          {f === 'VALID' && `Valid Only (${uploadParsedRows.filter(r => r.isValid).length})`}
                          {f === 'INVALID' && `Errors Only (${uploadParsedRows.filter(r => !r.isValid).length})`}
                        </button>
                      ))}
                    </div>

                    <span style={{ fontSize: 11, color: '#64748b' }}>
                      💡 You can edit invalid fields directly below to fix errors before saving.
                    </span>
                  </div>

                  {/* Preview Table */}
                  <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, maxHeight: 380, overflowY: 'auto' }}>
                    <table className="table" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', height: 36, borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                          <th style={{ padding: '0 10px', width: 60 }}>Status</th>
                          <th style={{ padding: '0 10px', width: 130 }}>Item Code *</th>
                          <th style={{ padding: '0 10px', width: 170 }}>Category *</th>
                          <th style={{ padding: '0 10px', width: 220 }}>Description *</th>
                          <th style={{ padding: '0 10px', width: 85 }}>UOM *</th>
                          <th style={{ padding: '0 10px', width: 100 }}>Rate (₹)</th>
                          <th style={{ padding: '0 10px' }}>Validation Details</th>
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
                                    <Check size={14} /> OK
                                  </span>
                                ) : (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#b91c1c', fontWeight: 700, fontSize: 11 }}>
                                    <AlertTriangle size={14} /> Err
                                  </span>
                                )}
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
                                  <option value="">Select Category...</option>
                                  {categories.map(c => (
                                    <option key={c.id} value={c.name}>{c.name}</option>
                                  ))}
                                </select>
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
                                  placeholder="0.00"
                                />
                              </td>
                              <td style={{ padding: '6px 10px', fontSize: 11 }}>
                                {row.isValid ? (
                                  <span style={{ color: '#059669', fontWeight: 600 }}>Ready to import</span>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {row.errors.map((err, eIdx) => (
                                      <span key={eIdx} style={{ color: '#b91c1c', fontWeight: 600 }}>
                                        • {err}
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
                  <strong>{uploadParsedRows.filter(r => r.isValid).length}</strong> of <strong>{uploadParsedRows.length}</strong> items valid and ready to import.
                </span>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setUploadModalOpen(false)}
                    disabled={importing}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleConfirmImport}
                    disabled={importing || uploadParsedRows.filter(r => r.isValid).length === 0}
                    style={{ fontWeight: 700 }}
                  >
                    {importing
                      ? 'Importing...'
                      : `Confirm & Import ${uploadParsedRows.filter(r => r.isValid).length} Valid Items`}
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
