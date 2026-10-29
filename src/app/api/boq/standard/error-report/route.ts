// src/app/api/boq/standard/error-report/route.ts - Generates downloadable Error Report in Excel format
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isApiContext, apiError } from '@/lib/api-utils';
import * as XLSX from 'xlsx';

export async function POST(req: NextRequest) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;

  try {
    const body = await req.json();
    const { issues, fileName } = body;

    if (!issues || !Array.isArray(issues) || issues.length === 0) {
      return apiError('No issues to generate error report for.', 400);
    }

    const reportRows = issues.map((iss: any, idx: number) => ({
      'S.No.': idx + 1,
      'Row # in File': iss.rowNumber || '-',
      'Item Code': iss.itemCode || '-',
      'Description': iss.description || '-',
      'Severity': iss.severity || 'ERROR',
      'Issue Detected': iss.issue || '-',
      'Recommended Action': iss.action || 'Correct the field in your Excel and re-upload',
    }));

    const workbook = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(reportRows);

    ws['!cols'] = [
      { wch: 8 },
      { wch: 14 },
      { wch: 18 },
      { wch: 35 },
      { wch: 12 },
      { wch: 40 },
      { wch: 50 },
    ];

    XLSX.utils.book_append_sheet(workbook, ws, 'Validation_Issues');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const outName = `Validation_Error_Report_${(fileName || 'Standard_BOQ').replace(/\.[^/.]+$/, '')}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${outName}"`,
      },
    });
  } catch (err: any) {
    return apiError(err.message || 'Failed to generate error report.', 500);
  }
}
