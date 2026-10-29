// src/app/api/boq/simple-template/download/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isApiContext } from '@/lib/api-utils';
import * as XLSX from 'xlsx';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const sampleRows = [
    {
      'S.No.': 1,
      'Item Description': '600x600 mm Vitrified Floor Tile',
      'Specification / Scope': 'Commercial grade heavy-duty matte finish floor tile',
      'UOM': 'SQFT',
      'Quantity': 2500,
      'Location / Area': 'Retail Sales Floor',
      'Brand / Make': 'Kajaria / Somany',
      'Remarks': 'Standard 10mm thickness',
    },
    {
      'S.No.': 2,
      'Item Description': '2.5 SQMM FRLS Copper Conductor Cable',
      'Specification / Scope': '1100V multi-strand copper cable in rigid PVC conduit',
      'UOM': 'MTR',
      'Quantity': 1800,
      'Location / Area': 'Main Power Distribution',
      'Brand / Make': 'Polycab / Havells',
      'Remarks': 'Fire-retardant low smoke',
    },
    {
      'S.No.': 3,
      'Item Description': '2x2 LED Recessed Panel 36W',
      'Specification / Scope': 'Commercial grade flicker-free 4000K neutral white LED',
      'UOM': 'NOS',
      'Quantity': 120,
      'Location / Area': 'Ceiling Grid',
      'Brand / Make': 'Philips / Wipro',
      'Remarks': 'Driver included',
    },
    {
      'S.No.': 4,
      'Item Description': 'Gypsum Board False Ceiling 12.5mm',
      'Specification / Scope': '12.5mm tapered edge moisture-resistant board with GI framing',
      'UOM': 'SQFT',
      'Quantity': 3800,
      'Location / Area': 'Store Perimeter & Entrance',
      'Brand / Make': 'Saint-Gobain Gyproc',
      'Remarks': 'Including tape and joint finish',
    },
    {
      'S.No.': 5,
      'Item Description': '6A/16A Modular Combined Switch & Socket',
      'Specification / Scope': 'Polycarbonate modular combined unit with base plate',
      'UOM': 'NOS',
      'Quantity': 85,
      'Location / Area': 'Counter & Display Islands',
      'Brand / Make': 'Schneider / Legrand',
      'Remarks': 'With safety shutter',
    },
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sampleRows);
  XLSX.utils.book_append_sheet(wb, ws, 'BOQ');

  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

  return new NextResponse(excelBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="proCPX_Simple_BOQ_Template.xlsx"',
    },
  });
}
