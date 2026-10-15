'use client';
// app/(app)/admin/masters/page.tsx - Masters management (UOM + Categories)
import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

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
    setMsg({ isError: false, text: 'UOM created successfully.' }); setShowUomModal(false); setUomForm({ code: '', name: '', category: 'COUNT' }); loadData();
  }

  async function createCategory(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/masters/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(catForm) });
    const d = await res.json();
    if (!res.ok) { setMsg({ isError: true, text: d.error }); return; }
    setMsg({ isError: false, text: 'Category created successfully.' }); setShowCatModal(false); setCatForm({ name: '', parentId: '', code: '' }); loadData();
  }

  return (
    <div className="page-content">
      <div className="top-header" style={{ margin: '-24px -24px 24px', padding: '0 24px' }}>
        <div><div className="page-title">Masters</div><div className="page-subtitle">UOM and Categories</div></div>
        {activeTab === 'uom' && <button className="btn btn-primary" onClick={() => setShowUomModal(true)}>+ Add UOM</button>}
        {activeTab === 'categories' && <button className="btn btn-primary" onClick={() => setShowCatModal(true)}>+ Add Category</button>}
      </div>

      {msg && (
        <div className={`alert ${msg.isError ? 'alert-error' : 'alert-success'} mb-4`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {msg.isError ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{msg.text}</span>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setMsg(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      <div className="tabs mb-4">
        <div className={`tab ${activeTab === 'uom' ? 'active' : ''}`} onClick={() => setActiveTab('uom')}>UOM Master ({uoms.length})</div>
        <div className={`tab ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>Categories ({categories.length})</div>
      </div>

      {loading ? (
        <div className="loading-overlay"><div className="spinner" /> Loading...</div>
      ) : activeTab === 'uom' ? (
        <div className="card">
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Aliases</th></tr></thead>
              <tbody>
                {uoms.map(u => (
                  <tr key={u.id}>
                    <td><span className="badge badge-info font-mono">{u.code}</span></td>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td className="text-muted">{u.category}</td>
                    <td className="text-muted text-sm">{u.aliases ? JSON.parse(u.aliases).join(', ') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Category</th><th>Subcategories</th></tr></thead>
              <tbody>
                {categories.map(cat => (
                  <tr key={cat.id}>
                    <td style={{ fontWeight: 700, verticalAlign: 'top', paddingTop: 14 }}>{cat.name}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 0' }}>
                        {cat.children?.map((sub: any) => (
                          <span key={sub.id} className="badge badge-draft">{sub.name}</span>
                        ))}
                        {!cat.children?.length && <span className="text-muted text-sm">No subcategories</span>}
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
              <span className="modal-title">Add UOM</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowUomModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={createUom}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Code <span className="required">*</span></label><input className="form-control" value={uomForm.code} onChange={e => setUomForm(f => ({ ...f, code: e.target.value }))} placeholder="NOS, SQM, RMT..." required /></div>
                <div className="form-group"><label className="form-label">Name <span className="required">*</span></label><input className="form-control" value={uomForm.name} onChange={e => setUomForm(f => ({ ...f, name: e.target.value }))} required /></div>
                <div className="form-group"><label className="form-label">Category</label>
                  <select className="form-control" value={uomForm.category} onChange={e => setUomForm(f => ({ ...f, category: e.target.value }))}>
                    {['COUNT', 'AREA', 'LENGTH', 'VOLUME', 'WEIGHT', 'ELECTRICAL', 'OTHER'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowUomModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Create</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCatModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCatModal(false)}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <span className="modal-title">Add Category</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowCatModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={createCategory}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Name <span className="required">*</span></label><input className="form-control" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} required /></div>
                <div className="form-group"><label className="form-label">Parent Category (for subcategory)</label>
                  <select className="form-control" value={catForm.parentId} onChange={e => setCatForm(f => ({ ...f, parentId: e.target.value }))}>
                    <option value="">— Top Level Category —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Code</label><input className="form-control" value={catForm.code} onChange={e => setCatForm(f => ({ ...f, code: e.target.value }))} placeholder="Optional code" /></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowCatModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Create</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
