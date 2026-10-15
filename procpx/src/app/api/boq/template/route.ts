// src/app/api/boq/template/route.ts - Download proCPX Standard BOQ Template in XLSX format
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isApiContext } from '@/lib/api-utils';
import * as XLSX from 'xlsx';

export async function GET(req: NextRequest) {
  const ctx = await requireAuth('BOQ_VIEW');
  if (!isApiContext(ctx)) return ctx;

  const workbook = XLSX.utils.book_new();

  // Sheet 1: Instructions & Version
  const instructions = [
    ['proCPX Enterprise BOQ Standard Import Template', 'Version 2.0 (Dual-Workflow Ready)'],
    [''],
    ['INSTRUCTIONS FOR PROJECT USERS:'],
    ['1. Mandatory columns are marked with an asterisk (*).'],
    ['2. Ensure Cost Centre Code matches a registered Cost Centre in your project (e.g., CC-001).'],
    ['3. Use standard UOM codes: NOS, SQFT, SQM, RMT, MTR, KG, TON, LTR, CUM, KVA, KW, LS, LOT, POINT.'],
    ['4. All items will be parsed into a unified Draft BOQ for AI refinement and cost estimation.'],
    ['5. After preparation, you can explicitly select [ADD TO BUDGET] or [CREATE PR].'],
    ['6. Do not modify or remove header names in row 1 of the "BOQ_Data" sheet.'],
  ];
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructions);
  XLSX.utils.book_append_sheet(workbook, wsInstructions, 'Instructions');

  // Sheet 2: Main BOQ Data with Sample Data
  const sampleData = [
    {
      'Project ID *': 'CPX-P-000001',
      'Project Name': 'Premium Retail Flagship Store – Bengaluru',
      'Cost Centre Code *': 'CC-001',
      'Cost Centre Name': 'Retail Store Fitout',
      'Category *': 'Civil & Interior',
      'Sub-category': 'Flooring',
      'Item Code': 'CIV-FLR-001',
      'Item Description *': '600x600 Vitrified Floor Tile Commercial Grade',
      'Specification': 'Heavy-duty 10mm thickness, full-body vitrified tile with matte anti-skid surface',
      'Brand / Make': 'Kajaria / Somany',
      'Model / Reference': 'Grandezza Matte Series',
      'UOM *': 'SQFT',
      'Quantity *': 20000,
      'Wastage %': 5,
      'Drawing Reference': 'A-103',
      'Room / Area': 'Retail Hall',
      'Floor': 'Ground Floor',
      'Zone': 'Zone A',
      'Remarks': 'Sample line for retail customer area flooring',
    },
    {
      'Project ID *': 'CPX-P-000001',
      'Project Name': 'Premium Retail Flagship Store – Bengaluru',
      'Cost Centre Code *': 'CC-001',
      'Cost Centre Name': 'Retail Store Fitout',
      'Category *': 'Electrical',
      'Sub-category': 'Electrical Cable',
      'Item Code': 'ELE-CBL-001',
      'Item Description *': 'Electrical Cable 2.5 SQMM FRLS Multi-strand Copper',
      'Specification': '1100V grade fire retardant copper wire through 25mm PVC conduits',
      'Brand / Make': 'Polycab / Havells',
      'Model / Reference': 'Optima FRLS',
      'UOM *': 'MTR',
      'Quantity *': 10000,
      'Wastage %': 8,
      'Drawing Reference': 'E-201',
      'Room / Area': 'Storewide',
      'Floor': 'All Floors',
      'Zone': 'Circuit Main',
      'Remarks': 'Primary power delivery wiring',
    },
    {
      'Project ID *': 'CPX-P-000001',
      'Project Name': 'Premium Retail Flagship Store – Bengaluru',
      'Cost Centre Code *': 'CC-001',
      'Cost Centre Name': 'Retail Store Fitout',
      'Category *': 'HVAC',
      'Sub-category': 'Air Conditioning',
      'Item Code': 'HVA-AC-001',
      'Item Description *': '2.0 TR Inverter Split AC Unit 5 Star BEE',
      'Specification': 'Twin rotary inverter compressor with R32 eco-refrigerant and copper condenser',
      'Brand / Make': 'Daikin / Blue Star',
      'Model / Reference': 'FTKM Series',
      'UOM *': 'NOS',
      'Quantity *': 20,
      'Wastage %': 0,
      'Drawing Reference': 'M-301',
      'Room / Area': 'Retail Hall & Cashier',
      'Floor': 'Ground Floor',
      'Zone': 'Cooling Zone 1',
      'Remarks': 'Primary comfort cooling units',
    },
  ];
  const wsData = XLSX.utils.json_to_sheet(sampleData);
  XLSX.utils.book_append_sheet(workbook, wsData, 'BOQ_Data');

  // Sheet 3: Category & UOM Reference
  const categoriesRef = [
    ['Category', 'Standard Sub-categories'],
    ['Civil & Interior', 'Flooring, False Ceiling, Gypsum Partition, Painting, Doors, Glass Partition, Masonry'],
    ['Electrical', 'Electrical Cable, DB Panel, LED Light, Switches, Sockets, Earthing, Wiring / Cabling'],
    ['HVAC', 'Air Conditioning, Ventilation, Ducting, Chiller, Exhaust System'],
    ['Plumbing', 'Copper Pipe, Drain Pipe, Valves, Fittings, Sanitaryware'],
    ['Fire Fighting', 'Fire Extinguisher, Fire Alarm, Sprinkler, Hydrant'],
    ['ELV / IT', 'CCTV Camera, Data Point, Rack, Access Control, PA System, Networking'],
    ['Security', 'Boom Barrier, Baggage Scanner, Metal Detector, Intrusion Alarm'],
    ['Furniture', 'Workstations, Chairs, Cabinets, Counters, Display Units'],
    ['Signage & Branding', 'Fascia Signage, Directional Signage, In-Store Branding, Digital Signage Board'],
    ['Kitchen / F&B Equipment', 'Commercial Cooking Range, Refrigerators & Freezers, Stainless Steel Counters, Exhaust Hood, Dishwashers'],
    ['DG / UPS / Power Backup', 'Diesel Generator, Online UPS System, Battery Bank, AMF Panel'],
    ['AV / Digital', 'Video Wall, Sound System, Projectors, Conference AV System'],
    ['Specialist Works', 'Acoustic Treatment, Waterproofing, Epoxy Flooring, Thermal Insulation'],
    ['External Development', 'Paving & Roadworks, External Lighting, Boundary Wall & Fencing, Landscape Works'],
  ];
  const wsRef = XLSX.utils.aoa_to_sheet(categoriesRef);
  XLSX.utils.book_append_sheet(workbook, wsRef, 'Reference_Taxonomy');

  const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="proCPX_Standard_BOQ_Template_v2.xlsx"',
    },
  });
}
