'use client';
// app/(app)/boq/upload/page.tsx - BOQ Upload Wizard
import { useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Check, AlertTriangle, FileSpreadsheet, CheckCircle2, CheckCircle, AlertOctagon } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import type { WizardStep } from "@app-types/app/(app)/boq/upload/page.types";
import { BOQ_FIELDS } from "./page.constants";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";



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
    if (!projectId) { setError(UI_STRINGS.appAppBoqUploadPage.projectIDIsMissingPleaseNavigateFromAProject); return; }
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('projectId', projectId);
    if (boqId) fd.append('boqId', boqId);

    const res = await fetch('/api/boq/upload', { method: 'POST', body: fd });
    const data = await res.json();
    setUploading(false);

    if (!res.ok) { setError(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.boqUploadFailedPleaseVerifyTheFileFormat })); return; }
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
    if (!columnMapping.description) { setError(UI_STRINGS.common.columnMappingIsIncompletePleaseMapDescriptionUOMAndQuantity); return; }
    if (!columnMapping.uom) { setError(UI_STRINGS.common.columnMappingIsIncompletePleaseMapUOM); return; }
    if (!columnMapping.quantity) { setError(UI_STRINGS.common.columnMappingIsIncompletePleaseMapQuantity); return; }

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
        title={UI_STRINGS.appAppBoqUploadPage.bOQUploadWizard}
        subtitle={UI_STRINGS.appAppBoqUploadPage.uploadAndMapExcelCSVLineItemsToStandardProCPXBOQFormat}
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
          <div className="card-header"><span className="card-title">{UI_STRINGS.appAppBoqUploadPage.step1UploadBOQFile}</span></div>
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
                <><div className="spinner" style={{ margin: '0 auto 12px' }} /><p>{UI_STRINGS.appAppBoqUploadPage.uploadingAndAnalysingFile}</p></>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                    <FileSpreadsheet size={40} color="#6366f1" strokeWidth={1.5} />
                  </div>
                  <p style={{ fontWeight: 600, marginBottom: 6 }}>{UI_STRINGS.appAppBoqUploadPage.dropYourBOQFileHereOrClickToBrowse}</p>
                  <p className="text-muted text-sm">{UI_STRINGS.appAppBoqUploadPage.supportedXlsxXlsCsv}</p>
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
            <span className="card-title">{UI_STRINGS.appAppBoqUploadPage.step2MapColumns}</span>
            <span className="text-muted text-sm">{UI_STRINGS.appAppBoqUploadPage.file}{uploadResult.fileName}</span>
          </div>
          <div className="card-body">
            {uploadResult.sheets?.length > 1 && (
              <div className="form-group">
                <label className="form-label">{UI_STRINGS.appAppBoqUploadPage.sheetToImport}</label>
                <select className="form-control" value={selectedSheet} onChange={e => setSelectedSheet(e.target.value)} style={{ maxWidth: 300 }}>
                  {uploadResult.sheets.map((s: string) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            <p className="text-muted mb-4" style={{ fontSize: 13 }}>{UI_STRINGS.appAppBoqUploadPage.mapYourExcelColumnsToTheStandardBOQFieldsRequiredFieldsAreMarked}</p>
            <div className="form-grid">
              {BOQ_FIELDS.map(field => (
                <div key={field.key} className="form-group">
                  <label className="form-label">
                    {field.label} {field.required && <span className="required">{UI_STRINGS.common.copyd1yn99}</span>}
                  </label>
                  <select
                    className="form-control"
                    value={columnMapping[field.key] || ''}
                    onChange={e => setColumnMapping(m => ({ ...m, [field.key]: e.target.value }))}
                  >
                    <option value="">{UI_STRINGS.appAppBoqUploadPage.ignoreNotInFile}</option>
                    {(uploadResult.columns || []).map((col: string) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {uploadResult.previewRows?.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>{UI_STRINGS.appAppBoqUploadPage.previewFirst5Rows}</p>
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
            <button className="btn btn-secondary" onClick={() => setStep('upload')}>{UI_STRINGS.appAppBoqUploadPage.back}</button>
            <button className="btn btn-primary" onClick={handleImport}>{UI_STRINGS.appAppBoqUploadPage.importBOQ}</button>
          </div>
        </div>
      )}

      {/* STEP 3: Importing */}
      {step === 'importing' && (
        <div className="card">
          <div className="card-body" style={{ textAlign: 'center', padding: 60 }}>
            <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto 16px', borderWidth: 3 }} />
            <p style={{ fontWeight: 600, fontSize: 15 }}>{UI_STRINGS.appAppBoqUploadPage.importingBOQLines}</p>
            <p className="text-muted">{UI_STRINGS.appAppBoqUploadPage.thisMayTakeAMomentForLargeFiles}</p>
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
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{UI_STRINGS.appAppBoqUploadPage.bOQImportedSuccessfully}</h2>
            <div style={{ maxWidth: 800, margin: '20px auto' }}>
              <SummaryCardGrid columns={4}>
                <SummaryCard
                  label={UI_STRINGS.common.totalLines}
                  value={importResult.imported}
                  secondary={UI_STRINGS.appAppBoqUploadPage.importedLines}
                  icon={<FileSpreadsheet size={16} />}
                  accent="default"
                />
                <SummaryCard
                  label={UI_STRINGS.common.valid}
                  value={importResult.valid}
                  secondary={UI_STRINGS.appAppBoqUploadPage.passedValidation}
                  icon={<CheckCircle size={16} />}
                  accent="emerald"
                />
                <SummaryCard
                  label={UI_STRINGS.common.warnings}
                  value={importResult.warnings}
                  secondary={UI_STRINGS.appAppBoqUploadPage.minorNotices}
                  icon={<AlertTriangle size={16} />}
                  accent="amber"
                />
                <SummaryCard
                  label={UI_STRINGS.common.errors}
                  value={importResult.errors}
                  secondary={UI_STRINGS.appAppBoqUploadPage.validationErrors}
                  icon={<AlertOctagon size={16} />}
                  accent="rose"
                />
              </SummaryCardGrid>
            </div>
            <div style={{ marginBottom: 20 }}>
              <p className="text-muted">{UI_STRINGS.appAppBoqUploadPage.qualityScore}</p>
              <div style={{ maxWidth: 300, margin: '8px auto' }}>
                <div className="quality-score">
                  <div className="quality-bar">
                    <div className="quality-fill" style={{ width: `${importResult.qualityScore}%`, background: importResult.qualityScore >= 80 ? '#059669' : importResult.qualityScore >= 50 ? '#d97706' : '#dc2626' }} />
                  </div>
                  <span className="quality-label">{importResult.qualityScore}{UI_STRINGS.common.copy8w4luo}</span>
                </div>
              </div>
            </div>
            <button className="btn btn-primary btn-lg" onClick={() => router.push(`/boq/${uploadResult.revisionId}`)}>{UI_STRINGS.common.openBOQWorkspace}</button>
          </div>
        </div>
      )}
    </div>
  );
}
