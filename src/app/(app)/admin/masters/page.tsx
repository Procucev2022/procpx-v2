'use client';
// app/(app)/admin/masters/page.tsx - Masters management (UOM + Categories)
import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

import PageHeader from '@/components/ui/PageHeader';
import { Plus } from 'lucide-react';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


export default function MastersPage() {
  const [activeTab, setActiveTab] = useState<'uom' | 'categories'>('uom');
  const [uoms, setUoms] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUomModal, setShowUomModal] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [uomForm, setUomForm] = useState({ code: '', name: '', category: 'COUNT' });
  const [catForm, setCatForm] = useState({ name: '', parentId: '', code: '' });
  const [msg, setMsg] = useState<{ isError: boolean; text: string } | null>(null);

  function loadData() {
    setLoading(true);
    Promise.all([
      fetch('/api/masters/uom').then(r => r.json()),
      fetch('/api/masters/categories').then(r => r.json()),
    ]).then(([u, c]) => { setUoms(u || []); setCategories(c || []); setLoading(false); });
  }
  useEffect(() => { loadData(); }, []);

  async function createUom(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/masters/uom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(uomForm) });
    const d = await res.json();
    if (!res.ok) { setMsg({ isError: true, text: d.error }); return; }
    setMsg({ isError: false, text: UI_STRINGS.appAppAdminMastersPage.uOMCreatedSuccessfully }); setShowUomModal(false); setUomForm({ code: '', name: '', category: 'COUNT' }); loadData();
  }

  async function createCategory(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/masters/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(catForm) });
    const d = await res.json();
    if (!res.ok) { setMsg({ isError: true, text: d.error }); return; }
    setMsg({ isError: false, text: UI_STRINGS.appAppAdminMastersPage.categoryCreatedSuccessfully }); setShowCatModal(false); setCatForm({ name: '', parentId: '', code: '' }); loadData();
  }

  return (
    <div className="w-full">
      <PageHeader
        title={UI_STRINGS.appAppAdminMastersPage.mastersAdministration}
        subtitle={UI_STRINGS.appAppAdminMastersPage.manageMasterUnitOfMeasureUOMDefinitionsAndCategoryTaxonomy}
        breadcrumbs={[
          { label: UI_STRINGS.common.administration, href: '/admin/masters' },
          { label: UI_STRINGS.appAppAdminMastersPage.masters },
        ]}
        actions={
          activeTab === 'uom' ? (
            <button
              type="button"
              className="btn btn-primary h-[40px] px-4 font-semibold inline-flex items-center gap-1.5 shadow-xs"
              onClick={() => setShowUomModal(true)}
            >
              <Plus size={16} />{UI_STRINGS.appAppAdminMastersPage.addUOM}</button>
          ) : (
            <button
              type="button"
              className="btn btn-primary h-[40px] px-4 font-semibold inline-flex items-center gap-1.5 shadow-xs"
              onClick={() => setShowCatModal(true)}
            >
              <Plus size={16} />{UI_STRINGS.common.addCategory}</button>
          )
        }
      />

      {msg && (
        <div
          className={`p-3.5 mb-6 rounded-lg border text-xs flex items-center justify-between ${
            msg.isError ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {msg.isError ? <AlertCircle size={16} className="text-rose-600" /> : <CheckCircle2 size={16} className="text-emerald-600" />}
            <span>{msg.text}</span>
          </div>
          <button type="button" onClick={() => setMsg(null)} className="text-slate-500 hover:text-slate-700">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 mb-6 pb-px">
        <button
          type="button"
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'uom'
              ? 'border-[#0f52ba] text-[#0f52ba] bg-blue-50/40 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
          onClick={() => setActiveTab('uom')}
        >{UI_STRINGS.appAppAdminMastersPage.uOMMaster}{uoms.length}{UI_STRINGS.common.copyc7zu6c}</button>
        <button
          type="button"
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'categories'
              ? 'border-[#0f52ba] text-[#0f52ba] bg-blue-50/40 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
          onClick={() => setActiveTab('categories')}
        >{UI_STRINGS.appAppAdminMastersPage.categories}{categories.length}{UI_STRINGS.common.copyc7zu6c}</button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">{UI_STRINGS.appAppAdminMastersPage.loadingMasters}</span>
        </div>
      ) : activeTab === 'uom' ? (
        <div className="card bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs mb-6">
          <div className="table-responsive">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>{UI_STRINGS.common.code}</th>
                  <th style={{ minWidth: 200 }}>{UI_STRINGS.common.name}</th>
                  <th style={{ width: 160 }}>{UI_STRINGS.common.category2}</th>
                  <th style={{ minWidth: 220 }}>{UI_STRINGS.appAppAdminMastersPage.aliases}</th>
                </tr>
              </thead>
              <tbody>
                {uoms.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td>
                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                        {u.code}
                      </span>
                    </td>
                    <td className="font-semibold text-slate-900">{u.name}</td>
                    <td className="text-slate-600 text-xs">{u.category}</td>
                    <td className="text-slate-500 text-xs">{u.aliases ? JSON.parse(u.aliases).join(', ') : UI_STRINGS.common.copy4s9bsz}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs mb-6">
          <div className="table-responsive">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th style={{ width: 220 }}>{UI_STRINGS.common.category2}</th>
                  <th>{UI_STRINGS.common.subcategories}</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(cat => (
                  <tr key={cat.id} className="hover:bg-slate-50 transition-colors">
                    <td className="font-bold text-slate-900 align-top py-3">{cat.name}</td>
                    <td className="py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {cat.children?.map((sub: any) => (
                          <span key={sub.id} className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            {sub.name}
                          </span>
                        ))}
                        {!cat.children?.length && <span className="text-slate-400 text-xs italic">{UI_STRINGS.common.noSubcategories}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* UOM Modal */}
      {showUomModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowUomModal(false)}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <span className="modal-title">{UI_STRINGS.appAppAdminMastersPage.addUOM2}</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowUomModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={createUom}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">{UI_STRINGS.appAppAdminMastersPage.code}<span className="required">{UI_STRINGS.common.copyd1yn99}</span></label><input className="form-control" value={uomForm.code} onChange={e => setUomForm(f => ({ ...f, code: e.target.value }))} placeholder={UI_STRINGS.appAppAdminMastersPage.nOSSQMRMT} required /></div>
                <div className="form-group"><label className="form-label">{UI_STRINGS.appAppAdminMastersPage.name}<span className="required">{UI_STRINGS.common.copyd1yn99}</span></label><input className="form-control" value={uomForm.name} onChange={e => setUomForm(f => ({ ...f, name: e.target.value }))} required /></div>
                <div className="form-group"><label className="form-label">{UI_STRINGS.common.category2}</label>
                  <select className="form-control" value={uomForm.category} onChange={e => setUomForm(f => ({ ...f, category: e.target.value }))}>
                    {['COUNT', 'AREA', 'LENGTH', 'VOLUME', 'WEIGHT', 'ELECTRICAL', 'OTHER'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowUomModal(false)}>{UI_STRINGS.common.cancel}</button><button type="submit" className="btn btn-primary">{UI_STRINGS.appAppAdminMastersPage.create}</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCatModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCatModal(false)}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <span className="modal-title">{UI_STRINGS.appAppAdminMastersPage.addCategory}</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowCatModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={createCategory}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">{UI_STRINGS.appAppAdminMastersPage.name}<span className="required">{UI_STRINGS.common.copyd1yn99}</span></label><input className="form-control" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} required /></div>
                <div className="form-group"><label className="form-label">{UI_STRINGS.appAppAdminMastersPage.parentCategoryForSubcategory}</label>
                  <select className="form-control" value={catForm.parentId} onChange={e => setCatForm(f => ({ ...f, parentId: e.target.value }))}>
                    <option value="">{UI_STRINGS.appAppAdminMastersPage.topLevelCategory}</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">{UI_STRINGS.common.code}</label><input className="form-control" value={catForm.code} onChange={e => setCatForm(f => ({ ...f, code: e.target.value }))} placeholder={UI_STRINGS.appAppAdminMastersPage.optionalCode} /></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowCatModal(false)}>{UI_STRINGS.common.cancel}</button><button type="submit" className="btn btn-primary">{UI_STRINGS.appAppAdminMastersPage.create}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
