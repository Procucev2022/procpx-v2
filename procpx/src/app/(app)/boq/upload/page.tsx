'use client';
// app/(app)/boq/upload/page.tsx - BOQ Upload Wizard
import { useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Check, AlertTriangle, FileSpreadsheet, CheckCircle2, CheckCircle, AlertOctagon } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';

type WizardStep = 'upload' | 'map' | 'preview' | 'importing' | 'done';

const BOQ_FIELDS = [
  { key: 'lineNumber', label: 'S.No.', required: false },
  { key: 'itemCode', label: 'Item Code', required: false },
  { key: 'category', label: 'Category', required: false },
  { key: 'subcategory', label: 'Sub-category', required: false },
  { key: 'description', label: 'Item Description', required: true },
  { key: 'specification', label: 'BOQ Description', required: false },
  { key: 'uom', label: 'UOM', required: true },
  { key: 'quantity', label: 'Quantity', required: true },
  { key: 'location', label: 'Location', required: false },
  { key: 'drawingReference', label: 'Drawing Reference', required: false },
  { key: 'brand', label: 'Brand', required: false },
  { key: 'model', label: 'Model', required: false },
  { key: 'material', label: 'Material', required: false },
  { key: 'grade', label: 'Grade', required: false },
  { key: 'remarks', label: 'Remarks', required: false },
];

export default function BoqUploadPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const projectId = searchParams.get('projectId') || '';
  const boqId = searchParams.get('boqId') || '';

  const [step, setStep] = useState<WizardStep>('upload');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [importResult, setImportResult] = useState<any>(null);

  const handleFile = async (file: File) => {
    setError('');
    if (!projectId) { setError('Project ID is missing. Please navigate from a project.'); return; }
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('projectId', projectId);
    if (boqId) fd.append('boqId', boqId);

    const res = await fetch('/api/boq/upload', { method: 'POST', body: fd });
    const data = await res.json();
    setUploading(false);

    if (!res.ok) { setError(data.error || 'BOQ upload failed. Please verify the file format.'); return; }
    setUploadResult(data);
    setSelectedSheet(data.sheets?.[0] || '');

    // Auto-map obvious column matches
    const autoMap: Record<string, string> = {};
    const cols: string[] = data.columns || [];
    BOQ_FIELDS.forEach(field => {
      const match = cols.find(c => {
        const cl = c.toLowerCase();
        return (
          cl.includes(field.key.toLowerCase()) ||
          (field.key === 'description' && cl.match(/item\s*desc|desc|description/)) ||
          (field.key === 'specification' && cl.match(/boq\s*desc|spec|specification/)) ||
          (field.key === 'uom' && cl.match(/uom|unit/)) ||
          (field.key === 'quantity' && cl.match(/qty|quantity|nos/)) ||
          (field.key === 'lineNumber' && cl.match(/s\.?no|sl\.?\s*no|line/)) ||
          (field.key === 'itemCode' && cl.match(/item\s*code|code/)) ||
          (field.key === 'category' && cl.match(/category/)) ||
          (field.key === 'subcategory' && cl.match(/sub-?category/))
        );
      });
      if (match) autoMap[field.key] = match;
    });
    setColumnMapping(autoMap);
    setStep('map');
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [projectId]);

  const handleImport = async () => {
    setError('');
    if (!columnMapping.description) { setError('Column mapping is incomplete. Please map Description, UOM and Quantity.'); return; }
    if (!columnMapping.uom) { setError('Column mapping is incomplete. Please map UOM.'); return; }
    if (!columnMapping.quantity) { setError('Column mapping is incomplete. Please map Quantity.'); return; }

    setStep('importing');
    const res = await fetch('/api/boq/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revisionId: uploadResult.revisionId, sheetName: selectedSheet, columnMapping }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setStep('map'); return; }
    setImportResult(data);
    setStep('done');
  };

  const currentStepNum = { upload: 1, map: 2, preview: 3, importing: 3, done: 4 }[step];

  return (
    <div className="page-content">
      <PageHeader
        title="BOQ Upload Wizard"
        subtitle="Upload and map Excel / CSV line items to standard ProCPX BOQ format"
        backHref={projectId ? `/projects/${projectId}` : '/boq'}
        backLabel="← Back to BOQ Register"
      />

      {/* Step Indicator */}
      <div className="step-wizard mb-6">
        {['Upload File', 'Map Columns', 'Import', 'Complete'].map((label, i) => (
          <div key={i} className="flex items-center" style={{ flex: 1 }}>
            <div className={`step ${i + 1 === currentStepNum ? 'active' : i + 1 < currentStepNum ? 'done' : ''}`}>
              <div className="step-num">{i + 1 < currentStepNum ? <Check size={12} strokeWidth={3} /> : i + 1}</div>
              <div className="step-label">{label}</div>
            </div>
            {i < 3 && <div className={`step-line ${i + 1 < currentStepNum ? 'done' : ''}`} />}
          </div>
        ))}
      </div>

      {error && (
        <div className="alert alert-error mb-4" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* STEP 1: Upload */}
      {step === 'upload' && (
        <div className="card">
          <div className="card-header"><span className="card-title">Step 1: Upload BOQ File</span></div>
          <div className="card-body">
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => document.getElementById('file-input')?.click()}
              style={{
                border: `2px dashed ${dragging ? 'var(--brand-600)' : 'var(--surface-border)'}`,
                borderRadius: 12, padding: '48px 24px', textAlign: 'center', cursor: 'pointer',
                background: dragging ? '#eef2ff' : 'var(--surface-bg)',
                transition: 'all 0.2s',
              }}
            >
              {uploading ? (
                <><div className="spinner" style={{ margin: '0 auto 12px' }} /><p>Uploading and analysing file...</p></>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                    <FileSpreadsheet size={40} color="#6366f1" strokeWidth={1.5} />
                  </div>
                  <p style={{ fontWeight: 600, marginBottom: 6 }}>Drop your BOQ file here, or click to browse</p>
                  <p className="text-muted text-sm">Supported: .xlsx, .xls, .csv</p>
                </>
              )}
              <input id="file-input" type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Map Columns */}
      {step === 'map' && uploadResult && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Step 2: Map Columns</span>
            <span className="text-muted text-sm">File: {uploadResult.fileName}</span>
          </div>
          <div className="card-body">
            {uploadResult.sheets?.length > 1 && (
              <div className="form-group">
                <label className="form-label">Sheet to Import</label>
                <select className="form-control" value={selectedSheet} onChange={e => setSelectedSheet(e.target.value)} style={{ maxWidth: 300 }}>
                  {uploadResult.sheets.map((s: string) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            <p className="text-muted mb-4" style={{ fontSize: 13 }}>
              Map your Excel columns to the standard BOQ fields. Required fields are marked *.
            </p>
            <div className="form-grid">
              {BOQ_FIELDS.map(field => (
                <div key={field.key} className="form-group">
                  <label className="form-label">
                    {field.label} {field.required && <span className="required">*</span>}
                  </label>
                  <select
                    className="form-control"
                    value={columnMapping[field.key] || ''}
                    onChange={e => setColumnMapping(m => ({ ...m, [field.key]: e.target.value }))}
                  >
                    <option value="">— Ignore / Not in file —</option>
                    {(uploadResult.columns || []).map((col: string) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {uploadResult.previewRows?.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Preview (first 5 rows)</p>
                <div className="table-wrapper" style={{ maxHeight: 200, overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>{Object.keys(uploadResult.previewRows[0]).slice(0, 8).map((col: string) => <th key={col}>{col}</th>)}</tr>
                    </thead>
                    <tbody>
                      {uploadResult.previewRows.map((row: any, i: number) => (
                        <tr key={i}>
                          {Object.keys(uploadResult.previewRows[0]).slice(0, 8).map((col: string) => (
                            <td key={col} style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row[col]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <div className="card-footer flex gap-3" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setStep('upload')}>← Back</button>
            <button className="btn btn-primary" onClick={handleImport}>Import BOQ →</button>
          </div>
        </div>
      )}

      {/* STEP 3: Importing */}
      {step === 'importing' && (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: 60 }}>
            <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto 16px', borderWidth: 3 }} />
            <p style={{ fontWeight: 600, fontSize: 15 }}>Importing BOQ Lines...</p>
            <p className="text-muted">This may take a moment for large files.</p>
          </div>
        </div>
      )}

      {/* STEP 4: Done */}
      {step === 'done' && importResult && (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <CheckCircle2 size={48} color="#059669" strokeWidth={1.5} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>BOQ Imported Successfully</h2>
            <div style={{ maxWidth: 800, margin: '20px auto' }}>
              <SummaryCardGrid columns={4}>
                <SummaryCard
                  label="Total Lines"
                  value={importResult.imported}
                  secondary="Imported lines"
                  icon={<FileSpreadsheet size={16} />}
                  accent="default"
                />
                <SummaryCard
                  label="Valid"
                  value={importResult.valid}
                  secondary="Passed validation"
                  icon={<CheckCircle size={16} />}
                  accent="emerald"
                />
                <SummaryCard
                  label="Warnings"
                  value={importResult.warnings}
                  secondary="Minor notices"
                  icon={<AlertTriangle size={16} />}
                  accent="amber"
                />
                <SummaryCard
                  label="Errors"
                  value={importResult.errors}
                  secondary="Validation errors"
                  icon={<AlertOctagon size={16} />}
                  accent="rose"
                />
              </SummaryCardGrid>
            </div>
            <div style={{ marginBottom: 20 }}>
              <p className="text-muted">Quality Score:</p>
              <div style={{ maxWidth: 300, margin: '8px auto' }}>
                <div className="quality-score">
                  <div className="quality-bar">
                    <div className="quality-fill" style={{ width: `${importResult.qualityScore}%`, background: importResult.qualityScore >= 80 ? '#059669' : importResult.qualityScore >= 50 ? '#d97706' : '#dc2626' }} />
                  </div>
                  <span className="quality-label">{importResult.qualityScore}%</span>
                </div>
              </div>
            </div>
            <button className="btn btn-primary btn-lg" onClick={() => router.push(`/boq/${uploadResult.revisionId}`)}>
              Open BOQ Workspace →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
