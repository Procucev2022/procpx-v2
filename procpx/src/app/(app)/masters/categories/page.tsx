'use client';
// src/app/(app)/masters/categories/page.tsx - Category Creation & Master Taxonomy
import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Boxes,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  Layers,
  ChevronRight,
  FolderTree,
  ShieldAlert,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';

interface CategoryItem {
  id: string;
  name: string;
  code: string | null;
  parentId: string | null;
  level: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  parent?: { id: string; name: string } | null;
  children?: CategoryItem[];
}

export default function CategoryCreationPage() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<string>('');
  const [search, setSearch] = useState('');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubcategory, setIsSubcategory] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    parentId: '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const canEdit = ['SUPER_ADMIN', 'CLIENT_ADMIN', 'CATEGORY_MANAGER'].includes(currentUserRole);

  useEffect(() => {
    fetchUserRole();
    loadCategories();
  }, []);

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
    setLoading(true);
    try {
      const res = await fetch('/api/masters/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.data || data || []);
      }
    } catch (e: any) {
      setNotification({ type: 'error', message: 'Failed to load categories.' });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = (presetParentId?: string) => {
    if (!canEdit) return;
    setFormError(null);
    if (presetParentId) {
      setIsSubcategory(true);
      setFormData({ name: '', code: '', parentId: presetParentId });
    } else {
      setIsSubcategory(false);
      setFormData({ name: '', code: '', parentId: '' });
    }
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      setFormError('Category name is required.');
      return;
    }

    if (isSubcategory && !formData.parentId) {
      setFormError('Please select a parent category for the subcategory.');
      return;
    }

    // Client-side duplicate check
    if (!isSubcategory) {
      const duplicateTop = categories.some(
        c => c.name.toLowerCase() === trimmedName.toLowerCase()
      );
      if (duplicateTop) {
        setFormError(`Top-level category "${trimmedName}" already exists.`);
        return;
      }
    } else {
      const parent = categories.find(c => c.id === formData.parentId);
      if (parent && parent.children?.some(ch => ch.name.toLowerCase() === trimmedName.toLowerCase())) {
        setFormError(`Subcategory "${trimmedName}" already exists under "${parent.name}".`);
        return;
      }
    }

    if (formData.code?.trim()) {
      const codeUpper = formData.code.trim().toUpperCase();
      const duplicateCode = categories.some(
        c => c.code?.toUpperCase() === codeUpper || c.children?.some(ch => ch.code?.toUpperCase() === codeUpper)
      );
      if (duplicateCode) {
        setFormError(`Category code "${codeUpper}" is already in use.`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch('/api/masters/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          code: formData.code.trim() ? formData.code.trim().toUpperCase() : null,
          parentId: isSubcategory ? formData.parentId : null,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error || 'Failed to create category.');
        return;
      }

      setNotification({
        type: 'success',
        message: `Category "${trimmedName}" created successfully and synced to BOQ Studio.`,
      });
      setModalOpen(false);
      setFormData({ name: '', code: '', parentId: '' });
      loadCategories();
    } catch (e: any) {
      setFormError(e.message || 'Network error creating category.');
    } finally {
      setSaving(false);
    }
  };

  const totalSubcategories = categories.reduce((acc, cat) => acc + (cat.children?.length || 0), 0);

  const filteredCategories = categories.filter(c => {
    const q = search.toLowerCase();
    const matchName = c.name.toLowerCase().includes(q);
    const matchCode = c.code?.toLowerCase().includes(q) || false;
    const matchSub = c.children?.some(ch => ch.name.toLowerCase().includes(q) || ch.code?.toLowerCase().includes(q));
    return matchName || matchCode || matchSub;
  });

  return (
    <div className="w-full">
      <PageHeader
        title="Category Creation & Master Taxonomy"
        subtitle="Central category taxonomy. Categories defined here automatically sync across Standard BOQ Creation, BOQ Studio, and Project Budget."
        breadcrumbs={[
          { label: 'Master Creation', href: '/masters/categories' },
          { label: 'Category Master' },
        ]}
        actions={
          canEdit ? (
            <button
              type="button"
              className="btn btn-primary h-[40px] px-4 font-semibold inline-flex items-center gap-1.5 shadow-xs"
              onClick={() => handleOpenAddModal()}
            >
              <Plus size={16} /> Add Category
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-outline h-[40px] px-4 text-xs font-semibold inline-flex items-center gap-1.5 opacity-60 cursor-not-allowed"
              disabled
              title="Restricted: Master Data Administrator or Category Manager role required"
            >
              <Plus size={16} /> Add Category (Admin Only)
            </button>
          )
        }
      />

      {/* Role / Context Banner */}
      {!canEdit && (
        <div className="p-3.5 mb-6 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs flex items-center gap-2.5">
          <ShieldAlert size={18} className="text-slate-500 shrink-0" />
          <div>
            <strong className="text-slate-900">Read-Only Master View:</strong> Category taxonomy creation and edits are reserved for Master Data Administrators and Category Managers. All categories below are active and immediately available in BOQ Studio and Project Budget.
          </div>
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
          label="Top-Level Categories"
          value={categories.length}
          secondary="Active in BOQ & Budget Workflows"
          accent="default"
        />
        <SummaryCard
          label="Subcategories"
          value={totalSubcategories}
          secondary="Granular Procurement Classifications"
          accent="blue"
        />
        <SummaryCard
          label="Workflow Integration"
          value="100% Synced"
          secondary="Standard BOQ, Studio & Project Budget"
          accent="emerald"
        />
      </SummaryCardGrid>

      {/* Search and Action Bar */}
      <div className="card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
            <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 12, top: 12 }} />
            <input
              type="text"
              placeholder="Search category name, code, or subcategory..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field"
              style={{ paddingLeft: 34, height: 38, width: '100%', fontSize: 13 }}
            />
          </div>

          <button
            type="button"
            className="btn btn-outline"
            onClick={loadCategories}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Categories Tree Table */}
      <div className="card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#0f172a' }}>
            Category Taxonomy Master Directory ({filteredCategories.length})
          </h3>
        </div>

        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: '#64748b' }}>
            Loading Category Master...
          </div>
        ) : filteredCategories.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: '#64748b' }}>
            No categories found matching your search.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', height: 40, borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0 16px', width: 220 }}>Category Name</th>
                  <th style={{ padding: '0 16px', width: 110 }}>Code</th>
                  <th style={{ padding: '0 16px' }}>Subcategories</th>
                  <th style={{ padding: '0 16px', width: 100 }}>Status</th>
                  {canEdit && <th style={{ padding: '0 16px', textAlign: 'right', width: 160 }}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {filteredCategories.map(cat => (
                  <tr key={cat.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0f172a', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Boxes size={16} color="#2563eb" />
                        <span>{cat.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                      {cat.code ? (
                        <span style={{ background: '#eff6ff', color: '#1e40af', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, fontFamily: 'monospace' }}>
                          {cat.code}
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {cat.children && cat.children.length > 0 ? (
                          cat.children.map(sub => (
                            <span
                              key={sub.id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: '#f1f5f9',
                                color: '#334155',
                                padding: '3px 8px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              {sub.name}
                              {sub.code && <span style={{ color: '#64748b', fontSize: 10 }}>({sub.code})</span>}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: 12, fontStyle: 'italic' }}>
                            No subcategories defined
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', verticalAlign: 'top' }}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: '#ecfdf5', color: '#047857' }}>
                        ACTIVE
                      </span>
                    </td>
                    {canEdit && (
                      <td style={{ padding: '14px 16px', textAlign: 'right', verticalAlign: 'top' }}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => handleOpenAddModal(cat.id)}
                          style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600 }}
                        >
                          + Subcategory
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE CATEGORY MODAL */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 500, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Boxes size={20} color="#2563eb" />
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#0f172a' }}>
                  {isSubcategory ? 'Add Subcategory' : 'Add Top-Level Category'}
                </h3>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, color: '#b91c1c', fontSize: 12 }}>
                <AlertCircle size={15} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
                  Category Hierarchy Type:
                </label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="catType"
                      checked={!isSubcategory}
                      onChange={() => {
                        setIsSubcategory(false);
                        setFormData(prev => ({ ...prev, parentId: '' }));
                      }}
                    />
                    Top-Level Category
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="catType"
                      checked={isSubcategory}
                      onChange={() => {
                        setIsSubcategory(true);
                        if (!formData.parentId && categories.length > 0) {
                          setFormData(prev => ({ ...prev, parentId: categories[0].id }));
                        }
                      }}
                    />
                    Subcategory
                  </label>
                </div>
              </div>

              {isSubcategory && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Parent Category *
                  </label>
                  <select
                    className="select-field"
                    value={formData.parentId}
                    onChange={e => setFormData(prev => ({ ...prev, parentId: e.target.value }))}
                    style={{ width: '100%', height: 38 }}
                    required
                  >
                    <option value="">Select Parent Category...</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.code ? `(${c.code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Category Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Civil & Interior, HVAC, Signage"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="input-field"
                  style={{ width: '100%', height: 38 }}
                  required
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                  Category Code
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Auto-generated on creation (e.g., CIV01, ELE01, SUB-01)"
                    value={formData.code}
                    onChange={e => setFormData(prev => ({ ...prev, code: e.target.value }))}
                    className="input-field"
                    style={{ width: '100%', height: 38, background: '#f8fafc', color: '#334155' }}
                  />
                  <span style={{ fontSize: 11, background: '#eff6ff', color: '#1d4ed8', padding: '4px 8px', borderRadius: 4, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    Auto-Generated
                  </span>
                </div>
                <span style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'block' }}>
                  Category codes are automatically generated by the backend according to standard taxonomy conventions. You may leave this blank.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
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
                  {saving ? 'Saving...' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
