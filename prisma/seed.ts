// prisma/seed.ts - Comprehensive Phase-1 Demonstration Seed Data for proCPX
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding proCPX Phase-1 Demonstration Database...\n');

  const hash = (pw: string) => bcrypt.hash(pw, 12);
  const defaultPw = await hash('Demo@1234');

  // ============================================================
  // 1. TENANTS
  // ============================================================
  console.log('🏢 Creating Tenants...');
  const tenantA = await prisma.tenant.upsert({
    where: { slug: 'procucev-retail-demo' },
    update: { name: 'Procucev Retail Demo', status: 'ACTIVE' },
    create: {
      name: 'Procucev Retail Demo',
      slug: 'procucev-retail-demo',
      status: 'ACTIVE',
      config: JSON.stringify({ currency: 'INR', defaultSector: 'RETAIL' }),
    },
  });

  const tenantB = await prisma.tenant.upsert({
    where: { slug: 'procucev-hospitality-demo' },
    update: { name: 'Procucev Hospitality Demo', status: 'ACTIVE' },
    create: {
      name: 'Procucev Hospitality Demo',
      slug: 'procucev-hospitality-demo',
      status: 'ACTIVE',
      config: JSON.stringify({ currency: 'INR', defaultSector: 'HOSPITALITY' }),
    },
  });
  console.log(`  ✓ Tenant A: ${tenantA.name} (${tenantA.slug})`);
  console.log(`  ✓ Tenant B: ${tenantB.name} (${tenantB.slug})`);

  // ============================================================
  // 2. USERS (Tenant A - 8 Roles)
  // ============================================================
  console.log('\n👥 Creating Users for Tenant A (8 Personas)...');
  const tenantAUsers = [
    { email: 'super.admin@procucev-demo.local', name: 'Super Admin', role: 'SUPER_ADMIN' },
    { email: 'client.admin@procucev-demo.local', name: 'Client Admin', role: 'CLIENT_ADMIN' },
    { email: 'project.user@procucev-demo.local', name: 'Project User', role: 'PROJECT_USER' },
    { email: 'project.approver@procucev-demo.local', name: 'Project Approver', role: 'PROJECT_APPROVER' },
    { email: 'procurement.user@procucev-demo.local', name: 'Procurement User', role: 'PROCUREMENT_USER' },
    { email: 'finance.user@procucev-demo.local', name: 'Finance User', role: 'FINANCE_USER' },
    { email: 'category.manager@procucev-demo.local', name: 'Category Manager', role: 'CATEGORY_MANAGER' },
    { email: 'viewer@procucev-demo.local', name: 'Viewer User', role: 'VIEWER' },
  ];

  const userMapA: Record<string, string> = {};
  for (const u of tenantAUsers) {
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenantA.id, email: u.email } },
      update: { name: u.name, role: u.role, status: 'ACTIVE' },
      create: {
        tenantId: tenantA.id,
        email: u.email,
        name: u.name,
        passwordHash: defaultPw,
        role: u.role,
        status: 'ACTIVE',
      },
    });
    userMapA[u.role] = user.id;
    console.log(`  ✓ ${u.role.padEnd(20)} → ${u.email}`);
  }

  // Tenant B Users (Isolation Testing)
  console.log('\n👥 Creating Users for Tenant B...');
  const tenantBUsers = [
    { email: 'hospitality.admin@procucev-demo.local', name: 'Hospitality Admin', role: 'CLIENT_ADMIN' },
    { email: 'hospitality.user@procucev-demo.local', name: 'Hospitality Project User', role: 'PROJECT_USER' },
    { email: 'hospitality.approver@procucev-demo.local', name: 'Hospitality Approver', role: 'PROJECT_APPROVER' },
  ];

  const userMapB: Record<string, string> = {};
  for (const u of tenantBUsers) {
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenantB.id, email: u.email } },
      update: { name: u.name, role: u.role, status: 'ACTIVE' },
      create: {
        tenantId: tenantB.id,
        email: u.email,
        name: u.name,
        passwordHash: defaultPw,
        role: u.role,
        status: 'ACTIVE',
      },
    });
    userMapB[u.role] = user.id;
    console.log(`  ✓ Tenant B: ${u.role.padEnd(20)} → ${u.email}`);
  }

  // ============================================================
  // 3. UOM MASTERS (Tenant A & B)
  // ============================================================
  console.log('\n📐 Creating UOM Masters...');
  const uomDefs = [
    { code: 'NOS', name: 'Numbers', aliases: JSON.stringify(['nos', 'no', 'each', 'ea', 'pcs', 'number']), category: 'COUNT' },
    { code: 'SQFT', name: 'Square Feet', aliases: JSON.stringify(['sqft', 'sq ft', 'sq. ft', 'sf']), category: 'AREA' },
    { code: 'SQM', name: 'Square Metres', aliases: JSON.stringify(['sqm', 'sq m', 'm2']), category: 'AREA' },
    { code: 'RMT', name: 'Running Metres', aliases: JSON.stringify(['rmt', 'rm', 'running mtr']), category: 'LENGTH' },
    { code: 'RFT', name: 'Running Feet', aliases: JSON.stringify(['rft', 'running ft']), category: 'LENGTH' },
    { code: 'MTR', name: 'Metres', aliases: JSON.stringify(['mtr', 'm', 'meter', 'metre']), category: 'LENGTH' },
    { code: 'FT', name: 'Feet', aliases: JSON.stringify(['ft', 'feet']), category: 'LENGTH' },
    { code: 'CUM', name: 'Cubic Metres', aliases: JSON.stringify(['cum', 'cbm', 'm3']), category: 'VOLUME' },
    { code: 'LTR', name: 'Litres', aliases: JSON.stringify(['ltr', 'litre']), category: 'VOLUME' },
    { code: 'KG', name: 'Kilograms', aliases: JSON.stringify(['kg', 'kgs', 'kilogram']), category: 'WEIGHT' },
    { code: 'TON', name: 'Tons', aliases: JSON.stringify(['ton', 'tons', 'tonne']), category: 'WEIGHT' },
    { code: 'KVA', name: 'Kilovolt-ampere', aliases: JSON.stringify(['kva']), category: 'ELECTRICAL' },
    { code: 'KW', name: 'Kilowatt', aliases: JSON.stringify(['kw']), category: 'ELECTRICAL' },
    { code: 'LS', name: 'Lump Sum', aliases: JSON.stringify(['ls', 'lump sum', 'lumpsum']), category: 'OTHER' },
    { code: 'LOT', name: 'Lot', aliases: JSON.stringify(['lot', 'lots']), category: 'OTHER' },
    { code: 'POINT', name: 'Point', aliases: JSON.stringify(['point', 'points', 'port']), category: 'OTHER' },
  ];

  const uomMapA: Record<string, string> = {};
  for (const u of uomDefs) {
    const record = await prisma.uomMaster.upsert({
      where: { tenantId_code: { tenantId: tenantA.id, code: u.code } },
      update: {},
      create: { tenantId: tenantA.id, ...u, isActive: true },
    });
    uomMapA[u.code] = record.id;
  }

  // Tenant B UOMs
  for (const u of uomDefs) {
    await prisma.uomMaster.upsert({
      where: { tenantId_code: { tenantId: tenantB.id, code: u.code } },
      update: {},
      create: { tenantId: tenantB.id, ...u, isActive: true },
    });
  }
  console.log(`  ✓ ${uomDefs.length} UOMs created for Tenant A & Tenant B`);

  // ============================================================
  // 4. CATEGORIES (Tenant A)
  // ============================================================
  console.log('\n🗂 Creating Categories Taxonomy...');
  const catDefs = [
    { name: 'Civil & Interior', subs: ['Flooring', 'False Ceiling', 'Gypsum Partition', 'Painting', 'Doors', 'Glass Partition', 'Masonry'] },
    { name: 'HVAC', subs: ['Air Conditioning', 'Ventilation', 'Ducting', 'Chiller', 'Exhaust System'] },
    { name: 'Electrical', subs: ['Electrical Cable', 'DB Panel', 'LED Light', 'Switches', 'Sockets', 'Earthing', 'Wiring / Cabling'] },
    { name: 'Plumbing', subs: ['Copper Pipe', 'Drain Pipe', 'Valves', 'Fittings', 'Sanitaryware'] },
    { name: 'Fire Fighting', subs: ['Fire Extinguisher', 'Fire Alarm', 'Sprinkler', 'Hydrant'] },
    { name: 'ELV / IT', subs: ['CCTV Camera', 'Data Point', 'Rack', 'Access Control', 'PA System', 'Networking'] },
    { name: 'Security', subs: ['Boom Barrier', 'Baggage Scanner', 'Metal Detector', 'Intrusion Alarm'] },
    { name: 'Furniture', subs: ['Workstations', 'Chairs', 'Cabinets', 'Counters', 'Display Units'] },
    { name: 'Signage & Branding', subs: ['Fascia Signage', 'Directional Signage', 'In-Store Branding', 'Digital Signage Board'] },
    { name: 'Kitchen / F&B Equipment', subs: ['Commercial Cooking Range', 'Refrigerators & Freezers', 'Stainless Steel Counters', 'Exhaust Hood', 'Dishwashers'] },
    { name: 'DG / UPS / Power Backup', subs: ['Diesel Generator', 'Online UPS System', 'Battery Bank', 'AMF Panel'] },
    { name: 'AV / Digital', subs: ['Video Wall', 'Sound System', 'Projectors', 'Conference AV System'] },
    { name: 'Specialist Works', subs: ['Acoustic Treatment', 'Waterproofing', 'Epoxy Flooring', 'Thermal Insulation'] },
    { name: 'External Development', subs: ['Paving & Roadworks', 'External Lighting', 'Boundary Wall & Fencing', 'Landscape Works'] },
  ];

  const catMapA: Record<string, string> = {};
  for (let i = 0; i < catDefs.length; i++) {
    const item = catDefs[i];
    const parent = await prisma.category.upsert({
      where: { tenantId_name_parentId: { tenantId: tenantA.id, name: item.name, parentId: '' } },
      update: {},
      create: { tenantId: tenantA.id, name: item.name, level: 1, isActive: true, sortOrder: i },
    });
    catMapA[item.name] = parent.id;

    for (const sub of item.subs) {
      const child = await prisma.category.upsert({
        where: { tenantId_name_parentId: { tenantId: tenantA.id, name: sub, parentId: parent.id } },
        update: {},
        create: { tenantId: tenantA.id, name: sub, parentId: parent.id, level: 2, isActive: true },
      });
      catMapA[sub] = child.id;
    }
  }

  // Tenant B categories
  const parentB = await prisma.category.upsert({
    where: { tenantId_name_parentId: { tenantId: tenantB.id, name: 'Hospitality Suites Fitout', parentId: '' } },
    update: {},
    create: { tenantId: tenantB.id, name: 'Hospitality Suites Fitout', level: 1, isActive: true },
  });
  await prisma.category.upsert({
    where: { tenantId_name_parentId: { tenantId: tenantB.id, name: 'Luxury Bedding & Casegoods', parentId: parentB.id } },
    update: {},
    create: { tenantId: tenantB.id, name: 'Luxury Bedding & Casegoods', parentId: parentB.id, level: 2, isActive: true },
  });
  console.log(`  ✓ 7 Categories and 28 Subcategories seeded for Tenant A`);

  // ============================================================
  // 5. TENANT A PROJECTS (3 Realistic Projects)
  // ============================================================
  console.log('\n📁 Creating Tenant A Demo Projects...');

  // --- PROJECT 1: DRAFT BOQ with Validations, Errors & Warnings (CPX-P-000001) ---
  const project1 = await prisma.project.upsert({
    where: { tenantId_projectCode: { tenantId: tenantA.id, projectCode: 'CPX-P-000001' } },
    update: { status: 'BOQ_PREPARATION' },
    create: {
      tenantId: tenantA.id,
      projectCode: 'CPX-P-000001',
      name: 'Premium Retail Flagship Store – Bengaluru',
      description: 'High-street 25,000 sqft flagship retail store interior fit-out and MEP execution',
      sector: 'RETAIL',
      projectType: 'FIT_OUT',
      location: 'Indiranagar 100ft Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      areaSqFt: 25000,
      costCentre: 'RET-BLR-001',
      projectOwner: 'Project User',
      budget: 8500000,
      currency: 'INR',
      status: 'BOQ_PREPARATION',
      createdBy: userMapA['PROJECT_USER'],
    },
  });

  // Assign Project 1 Team
  const teamRoles = [
    { userId: userMapA['PROJECT_USER'], role: 'PROJECT_USER' },
    { userId: userMapA['PROJECT_APPROVER'], role: 'PROJECT_APPROVER' },
    { userId: userMapA['PROCUREMENT_USER'], role: 'PROCUREMENT_USER' },
    { userId: userMapA['FINANCE_USER'], role: 'FINANCE_USER' },
    { userId: userMapA['CATEGORY_MANAGER'], role: 'CATEGORY_MANAGER' },
  ];
  for (const t of teamRoles) {
    await prisma.projectTeam.upsert({
      where: { projectId_userId: { projectId: project1.id, userId: t.userId } },
      update: {},
      create: { projectId: project1.id, userId: t.userId, projectRole: t.role, assignedBy: userMapA['CLIENT_ADMIN'] },
    });
  }

  // Documents for Project 1
  await prisma.projectDocument.deleteMany({ where: { projectId: project1.id } });
  await prisma.projectDocument.createMany({
    data: [
      {
        tenantId: tenantA.id,
        projectId: project1.id,
        name: 'Original_Tender_BOQ_Bengaluru.xlsx',
        fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        fileSize: 45056,
        filePath: `/uploads/${tenantA.id}/${project1.id}/Original_Tender_BOQ_Bengaluru.xlsx`,
        uploadedBy: userMapA['PROJECT_USER'],
        category: 'ORIGINAL_BOQ',
      },
      {
        tenantId: tenantA.id,
        projectId: project1.id,
        name: 'Architectural_Fitout_Layout_v2.pdf',
        fileType: 'application/pdf',
        fileSize: 1843200,
        filePath: `/uploads/${tenantA.id}/${project1.id}/Architectural_Fitout_Layout_v2.pdf`,
        uploadedBy: userMapA['PROJECT_USER'],
        category: 'DRAWING',
      },
      {
        tenantId: tenantA.id,
        projectId: project1.id,
        name: 'Retail_Interior_Specs_2026.pdf',
        fileType: 'application/pdf',
        fileSize: 655360,
        filePath: `/uploads/${tenantA.id}/${project1.id}/Retail_Interior_Specs_2026.pdf`,
        uploadedBy: userMapA['CATEGORY_MANAGER'],
        category: 'SPECIFICATION',
      },
    ],
  });

  // ============================================================
  // 5.1 COST CENTRES FOR PROJECT 1 (First-Class Objects)
  // ============================================================
  console.log('\n🏢 Creating Project Cost Centres...');
  const ccDefs = [
    { code: 'CC-001', name: 'Retail Store Fitout', areaSqFt: 8500, location: 'Ground & First Floor', floorZone: 'Zone A - Retail Hall', description: 'Main retail customer hall, trial rooms and checkout floor space' },
    { code: 'CC-002', name: 'Kitchen / F&B', areaSqFt: 1500, location: 'First Floor Rear', floorZone: 'Zone B - Cafe & Prep', description: 'Live beverage bar, bakery counter and back-of-house kitchen' },
    { code: 'CC-003', name: 'External Development', areaSqFt: 2000, location: 'Building Perimeter', floorZone: 'Exterior Zone', description: 'Storefront pavement, façade cladding, outdoor branding & landscaping' },
    { code: 'CC-004', name: 'Signage', areaSqFt: 8500, location: 'Façade & In-Store', floorZone: 'Brand Zone', description: 'Main building fascia logo, wayfinding totems and directional signage' },
    { code: 'CC-005', name: 'IT / ELV', areaSqFt: 8500, location: 'Server Room & Hall', floorZone: 'ELV Zone', description: 'CCTV surveillance, POS cabling, server rack and WiFi network infrastructure' },
  ];

  const ccMapA: Record<string, any> = {};
  for (const cc of ccDefs) {
    const record = await prisma.costCentre.upsert({
      where: { tenantId_projectId_code: { tenantId: tenantA.id, projectId: project1.id, code: cc.code } },
      update: { name: cc.name, areaSqFt: cc.areaSqFt, location: cc.location, floorZone: cc.floorZone, description: cc.description },
      create: {
        tenantId: tenantA.id,
        projectId: project1.id,
        code: cc.code,
        name: cc.name,
        areaSqFt: cc.areaSqFt,
        location: cc.location,
        floorZone: cc.floorZone,
        description: cc.description,
        status: 'ACTIVE',
        createdBy: userMapA['PROJECT_USER'],
      },
    });
    ccMapA[cc.code] = record;
    console.log(`  ✓ Cost Centre: ${record.code} → ${record.name} (${record.areaSqFt} Sqft)`);
  }

  // ============================================================
  // 5.2 STANDARD BOQ LIBRARY ITEMS
  // ============================================================
  console.log('\n📚 Creating Standard BOQ Library Items...');
  const stdItems = [
    {
      itemCode: 'STD-CIV-001',
      sector: 'RETAIL',
      projectType: 'Store Fitout',
      category: 'Civil & Interior',
      subcategory: 'Flooring',
      standardDescription: '600 x 600 mm vitrified floor tile, commercial-grade, suitable for heavy-traffic retail application',
      detailedSpecification: 'Heavy-duty 10mm thickness, full-body vitrified tile with matte anti-skid surface, PEI Rating Group 5, installed with Polymer modified tile adhesive and epoxy grout joints.',
      uom: 'SQFT',
      brandMake: 'Kajaria / Somany / Nitco',
      benchmarkRate: 145.0,
      costDrivers: 'Tile grade, adhesive thickness, edge leveling clips',
    },
    {
      itemCode: 'STD-CIV-002',
      sector: 'RETAIL',
      projectType: 'Store Fitout',
      category: 'Civil & Interior',
      subcategory: 'False Ceiling',
      standardDescription: 'Gypsum Board False Ceiling (12.5mm Saint-Gobain) with Perimeter Cove',
      detailedSpecification: '12.5mm tapered edge moisture-resistant gypsum board screwed to galvanized steel framing (GI perimeter and intermediate channels @ 450mm c/c) with recessed LED strip cove detail.',
      uom: 'SQFT',
      brandMake: 'Saint-Gobain Gyproc / USG Boral',
      benchmarkRate: 115.0,
      costDrivers: 'GI gauge, suspension height, cove complexity',
    },
    {
      itemCode: 'STD-ELE-001',
      sector: 'RETAIL',
      projectType: 'Store Fitout',
      category: 'Electrical',
      subcategory: 'Electrical Cable',
      standardDescription: 'Electrical Cable 2.5 SQMM (FRLS Multi-strand Copper Conductors)',
      detailedSpecification: '1100V grade fire-retardant low smoke multi-strand electrolytic grade bright annealed copper conductor flexible wire drawn through 25mm heavy-gauge rigid PVC conduits.',
      uom: 'MTR',
      brandMake: 'Polycab / Havells / Finolex',
      benchmarkRate: 68.0,
      costDrivers: 'Copper commodity index, PVC conduit class',
    },
    {
      itemCode: 'STD-ELE-002',
      sector: 'RETAIL',
      projectType: 'Store Fitout',
      category: 'Electrical',
      subcategory: 'LED Light',
      standardDescription: 'LED Recessed Track Light Fixture (30W COB 4000K Neutral White)',
      detailedSpecification: 'Die-cast aluminum body with powder coat finish, Citizen COB LED chip, CRI > 90, 36 degree beam angle, integrated flicker-free constant current driver with 3-phase track adapter.',
      uom: 'NOS',
      brandMake: 'Philips / Wipro / Havells',
      benchmarkRate: 2450.0,
      costDrivers: 'Lumens/watt, CRI rating, driver warranty',
    },
    {
      itemCode: 'STD-HVA-001',
      sector: 'RETAIL',
      projectType: 'Store Fitout',
      category: 'HVAC',
      subcategory: 'Air Conditioning',
      standardDescription: '2.0 TR Inverter Split AC Unit (5 Star BEE Rated, Copper Condenser)',
      detailedSpecification: 'Twin rotary inverter compressor, Eco-friendly R32 refrigerant, anti-corrosive gold fin condenser coils, intelligent airflow with PM2.5 filter, wireless remote control.',
      uom: 'NOS',
      brandMake: 'Daikin / Mitsubishi / Blue Star',
      benchmarkRate: 54000.0,
      costDrivers: 'BEE Star rating, piping run length, outdoor mounting bracket',
    },
    {
      itemCode: 'STD-KIT-001',
      sector: 'HOSPITALITY',
      projectType: 'Kitchen',
      category: 'Kitchen / F&B Equipment',
      subcategory: 'Refrigerators & Freezers',
      standardDescription: 'Commercial SS 304 Under-Counter 2-Door Chiller (300 Litres)',
      detailedSpecification: 'Grade 304 food-grade stainless steel interior and exterior, Embraco compressor with R134a/R290, digital temperature controller (-2°C to +8°C), self-closing doors with magnetic gaskets.',
      uom: 'NOS',
      brandMake: 'Celfrost / Trufrost / Western',
      benchmarkRate: 78000.0,
      costDrivers: 'Compressor origin, SS 304 gauge, digital controller',
    },
    {
      itemCode: 'STD-KIT-002',
      sector: 'HOSPITALITY',
      projectType: 'Kitchen',
      category: 'Kitchen / F&B Equipment',
      subcategory: 'Stainless Steel Counters',
      standardDescription: 'Commercial Stainless Steel Prep Table with Splashback & Under-shelf (1500x600x850mm)',
      detailedSpecification: '16 SWG SS 304 top sheet with sound-deadening core, 18 SWG under-shelf, 38mm dia tubular legs with adjustable nylon bullet feet, 100mm rear splashback.',
      uom: 'NOS',
      brandMake: 'Custom Fabricated / Continental',
      benchmarkRate: 19500.0,
      costDrivers: 'SS 304 sheet thickness, sound deadening wooden core',
    },
    {
      itemCode: 'STD-SIG-001',
      sector: 'RETAIL',
      projectType: 'Store Fitout',
      category: 'Signage & Branding',
      subcategory: 'Fascia Signage',
      standardDescription: 'LED Backlit Acrylic 3D Channel Letter Signage on ACP Backing',
      detailedSpecification: 'Cast acrylic face letters with SS mirror gold or powder coated returns, high-efficiency Samsung LED modules (IP67), Meanwell waterproof SMPS power supply mounted on 3mm ACP sheet.',
      uom: 'SQFT',
      brandMake: 'Samsung LED / 3M Acrylic',
      benchmarkRate: 950.0,
      costDrivers: 'Letter depth, acrylic thickness, LED density',
    },
    {
      itemCode: 'STD-ELV-001',
      sector: 'RETAIL',
      projectType: 'Store Fitout',
      category: 'ELV / IT',
      subcategory: 'CCTV Camera',
      standardDescription: '4MP IP Dome Network Camera with WDR, IR 30m & Smart Analytics',
      detailedSpecification: '1/3" progressive scan CMOS, 2560x1440 @ 30fps, 2.8mm fixed lens, 120dB true WDR, H.265+ compression, vandal-resistant IK10 & weatherproof IP67 rated, PoE enabled.',
      uom: 'NOS',
      brandMake: 'Hikvision / Dahua / Honeywell',
      benchmarkRate: 4200.0,
      costDrivers: 'Resolution, analytics suite, vandal resistance',
    },
    {
      itemCode: 'STD-FUR-001',
      sector: 'RETAIL',
      projectType: 'Store Fitout',
      category: 'Furniture',
      subcategory: 'Counters',
      standardDescription: 'Modular Retail Checkout Cashier Counter with Solid Surface Top (1800x750mm)',
      detailedSpecification: 'Heavy-gauge commercial plywood structure with laminate finish, seamless 12mm Corian / Dupont solid surface working counter, built-in lockable cash drawer, cable manager and bag shelf.',
      uom: 'NOS',
      brandMake: 'Custom Fabricated / Hafele Hardware',
      benchmarkRate: 48000.0,
      costDrivers: 'Solid surface brand, lock mechanism, size',
    },
    {
      itemCode: 'STD-PLM-001',
      sector: 'RETAIL',
      projectType: 'Store Fitout',
      category: 'Plumbing',
      subcategory: 'Sanitaryware',
      standardDescription: 'Commercial Wall-Hung Ceramic Water Closet with Concealed Dual Flush Tank',
      detailedSpecification: 'Vitreous china rimless wall-hung WC with antibacterial glaze, UF soft-close seat cover, Geberit concealed cistern with pneumatic dual flush actuator plate.',
      uom: 'NOS',
      brandMake: 'Kohler / Jaquar / Hindware',
      benchmarkRate: 14500.0,
      costDrivers: 'Ceramic brand, cistern type, rimless design',
    },
    {
      itemCode: 'STD-FIR-001',
      sector: 'RETAIL',
      projectType: 'Store Fitout',
      category: 'Fire Fighting',
      subcategory: 'Fire Extinguisher',
      standardDescription: 'Stored Pressure Mono Ammonium Phosphate (MAP 50) ABC Dry Powder Fire Extinguisher 6 Kg',
      detailedSpecification: 'IS:15683 approved deep-drawn mild steel cylinder with EPDM discharge hose, brass squeeze lever, pressure gauge, CE certified.',
      uom: 'NOS',
      brandMake: 'Ceasefire / Kanex / Minimax',
      benchmarkRate: 3800.0,
      costDrivers: 'Extinguisher capacity, powder chemical grade',
    },
    // --- HOSPITALITY SECTOR ---
    {
      itemCode: 'STD-HSP-KIT-003',
      sector: 'HOSPITALITY',
      projectType: 'Kitchen',
      category: 'Kitchen / F&B Equipment',
      subcategory: 'Commercial Cooking Range',
      standardDescription: 'Commercial SS 304 4-Burner Heavy Duty Gas Range with Storage Shelf',
      detailedSpecification: 'Heavy duty CI pan supports with high-efficiency brass gas burners, pilot flame, SS drip trays, 16 SWG SS 304 top frame, needle control valves.',
      uom: 'NOS',
      brandMake: 'Continental / Trufrost / Custom',
      benchmarkRate: 42000.0,
      costDrivers: 'Burner capacity, SS gauge',
    },
    {
      itemCode: 'STD-HSP-FLR-001',
      sector: 'HOSPITALITY',
      projectType: 'Hotel',
      category: 'Civil & Interior',
      subcategory: 'Flooring',
      standardDescription: 'Commercial Acoustic Luxury Vinyl Tile (LVT) Wood Plank Flooring (3mm)',
      detailedSpecification: '0.55mm wear layer, polyurethane reinforced (PUR) surface treatment, micro-beveled edges, installed with specialized acrylic flooring adhesive.',
      uom: 'SQFT',
      brandMake: 'Gerflor / Armstrong / Tarkett',
      benchmarkRate: 185.0,
      costDrivers: 'Wear layer thickness, acoustic backing',
    },
    {
      itemCode: 'STD-HSP-HVA-002',
      sector: 'HOSPITALITY',
      projectType: 'Restaurant',
      category: 'HVAC',
      subcategory: 'Ventilation',
      standardDescription: 'Commercial Kitchen Island Exhaust Hood with SS Baffle Grease Filters & Centrifugal Fan',
      detailedSpecification: 'SS 304 18 SWG construction, removable flame-proof baffle filters, integrated oil collection gutter with drain plug, high-static backward curved centrifugal exhaust blower.',
      uom: 'NOS',
      brandMake: 'Carryaire / Waves / Systemair',
      benchmarkRate: 95000.0,
      costDrivers: 'Blower static pressure, SS hood perimeter',
    },
    // --- BANKING SECTOR ---
    {
      itemCode: 'STD-BNK-SEC-001',
      sector: 'BANKING',
      projectType: 'Branch',
      category: 'Security',
      subcategory: 'Intrusion Alarm',
      standardDescription: 'Class AA Heavy Duty Fire & Burglary Resistant Bank Strong Room Vault Door',
      detailedSpecification: 'Monolithic torch and drill resistant (TDR) slab barrier with 100mm door thickness, four-wheel indirect drive keyless combination locks and 12-point deadbolt locking mechanism.',
      uom: 'NOS',
      brandMake: 'Godrej Security / Gunnebo',
      benchmarkRate: 385000.0,
      costDrivers: 'TRTL rating, door plate thickness, lock certification',
    },
    {
      itemCode: 'STD-BNK-CIV-001',
      sector: 'BANKING',
      projectType: 'Branch',
      category: 'Civil & Interior',
      subcategory: 'Glass Partition',
      standardDescription: 'Ballistic Resistant Level 3 Security Glazing & Cash Teller Counter Countertop (12mm Toughened + PVB)',
      detailedSpecification: 'Multi-layer laminated ballistic bullet-resistant glass in heavy MS powder-coated subframe with stainless steel pass-through cash tray and integrated two-way electronic talk-thru intercom.',
      uom: 'RMT',
      brandMake: 'Saint-Gobain / Asahi Glass',
      benchmarkRate: 18500.0,
      costDrivers: 'Ballistic level, intercom clarity',
    },
    {
      itemCode: 'STD-BNK-ELE-001',
      sector: 'BANKING',
      projectType: 'Branch',
      category: 'Electrical',
      subcategory: 'DB Panel',
      standardDescription: 'Branch Essential & Non-Essential Dual Busbar Distribution Board Panel (125A 4P)',
      detailedSpecification: 'CRCA 16 SWG sheet enclosure with IP54 rating, Siemens / Schneider MCCB incomer, earth leakage relay and changeover switch for DG/UPS power segregation.',
      uom: 'NOS',
      brandMake: 'Schneider / L&T / Legrand',
      benchmarkRate: 65000.0,
      costDrivers: 'Enclosure IP rating, switchgear make',
    },
    // --- OFFICE / CORPORATE SECTOR ---
    {
      itemCode: 'STD-OFF-FUR-001',
      sector: 'OFFICE',
      projectType: 'Office',
      category: 'Furniture',
      subcategory: 'Workstations',
      standardDescription: 'Linear 4-Person Modular Enterprise Workstation Cluster (1200x600mm per desk)',
      detailedSpecification: '25mm pre-laminated engineered wood top with 2mm PVC edge banding, triangular steel loop leg frame in powder-coat finish, central acoustic fabric sandwich pinup tiles with raceway cable trays.',
      uom: 'NOS',
      brandMake: 'Featherlite / Godrej Interio / Haworth',
      benchmarkRate: 46000.0,
      costDrivers: 'Screen fabric grade, wire management raceways',
    },
    {
      itemCode: 'STD-OFF-CIV-001',
      sector: 'OFFICE',
      projectType: 'Office',
      category: 'Civil & Interior',
      subcategory: 'Flooring',
      standardDescription: 'Heavy Commercial Tufted Loop Pile Modular Carpet Tile (500x500mm)',
      detailedSpecification: '100% solution-dyed nylon 6,6 yarn, bitumen backing with fiberglass reinforcement, permanent anti-static treatment, CRI Green Label Plus certified, installed with tackifier adhesive.',
      uom: 'SQFT',
      brandMake: 'Interface / Shaw Contract / Milliken',
      benchmarkRate: 145.0,
      costDrivers: 'Yarn type, pile weight, backing stability',
    },
    {
      itemCode: 'STD-OFF-ELV-001',
      sector: 'OFFICE',
      projectType: 'Office',
      category: 'ELV / IT',
      subcategory: 'Networking',
      standardDescription: 'Category 6A F/UTP 10Gbps Structured Data Point with Dual Faceplate & Patch Cord',
      detailedSpecification: 'Shielded Cat6A 23 AWG LSZH solid copper cable pulled through dedicated GI raceway/conduit, terminated on tool-less keystone jacks in shuttered gang faceplate.',
      uom: 'POINT',
      brandMake: 'CommScope Systimax / Schneider Actassi',
      benchmarkRate: 1850.0,
      costDrivers: 'Channel certification, cable shielding class',
    },
  ];

  for (const item of stdItems) {
    await prisma.standardBoqItem.upsert({
      where: { tenantId_itemCode: { tenantId: tenantA.id, itemCode: item.itemCode } },
      update: { ...item },
      create: { tenantId: tenantA.id, ...item },
    });
  }
  console.log(`  ✓ ${stdItems.length} Standard BOQ Library items seeded`);

  // ============================================================
  // 5.3 BOQ 1 (FOR BUDGET) & REVISIONS
  // ============================================================
  const boq1 = await prisma.boq.upsert({
    where: { tenantId_boqCode: { tenantId: tenantA.id, boqCode: 'BOQ-000001' } },
    update: { status: 'DRAFT', costCentreId: ccMapA['CC-001'].id, purpose: 'BUDGET' },
    create: {
      tenantId: tenantA.id,
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      boqCode: 'BOQ-000001',
      status: 'DRAFT',
      purpose: 'BUDGET',
      createdBy: userMapA['PROJECT_USER'],
    },
  });

  // Revision R0 (Initial Raw Import with Approved Budget Contribution)
  const rev1R0 = await prisma.boqRevision.upsert({
    where: { boqId_revisionNumber: { boqId: boq1.id, revisionNumber: 0 } },
    update: {
      costCentreId: ccMapA['CC-001'].id,
      preparationStatus: 'READY_FOR_SUBMISSION',
      budgetStatus: 'BUDGET_APPROVED',
      sourceType: 'FIXED_TEMPLATE',
    },
    create: {
      tenantId: tenantA.id,
      boqId: boq1.id,
      costCentreId: ccMapA['CC-001'].id,
      revisionNumber: 0,
      revisionCode: 'R0',
      status: 'DRAFT',
      preparationStatus: 'READY_FOR_SUBMISSION',
      budgetStatus: 'BUDGET_APPROVED',
      sourceType: 'FIXED_TEMPLATE',
      originalFileName: 'Original_Tender_BOQ_Bengaluru.xlsx',
      notes: 'Initial raw import from Excel used for Cost Centre Budget Formation',
      totalLines: 4,
      validLines: 4,
      warningLines: 0,
      errorLines: 0,
      qualityScore: 95,
      createdById: userMapA['PROJECT_USER'],
      uploadedAt: new Date(Date.now() - 5 * 86400000),
    },
  });

  // Seed lines for rev1R0 (Budget Lines: Civil ₹25L, Electrical ₹8.5L, HVAC ₹10L = Total ₹43.5L)
  await prisma.boqLine.deleteMany({ where: { boqRevisionId: rev1R0.id } });
  const rev1R0Lines = [
    {
      ln: '1.01',
      orig: 'Vitrified tile flooring 600x600',
      std: '600 x 600 mm vitrified floor tile, commercial-grade',
      cat: 'Civil & Interior',
      sub: 'Flooring',
      uom: 'SQFT',
      qty: 20000,
      rate: 125,
      amount: 2500000,
      source: 'Approved Vendor Rate Card',
    },
    {
      ln: '2.01',
      orig: 'FRLS Copper wire 2.5 SQMM',
      std: 'Electrical Cable 2.5 SQMM (FRLS Copper)',
      cat: 'Electrical',
      sub: 'Electrical Cable',
      uom: 'MTR',
      qty: 10000,
      rate: 65,
      amount: 650000,
      source: 'Standard Catalogue',
    },
    {
      ln: '2.02',
      orig: 'LED Panel 36W',
      std: 'LED Recessed Panel Light (600x600mm, 36W)',
      cat: 'Electrical',
      sub: 'LED Light',
      uom: 'NOS',
      qty: 100,
      rate: 2000,
      amount: 200000,
      source: 'Standard Catalogue',
    },
    {
      ln: '3.01',
      orig: '2 Ton Split AC 5 Star',
      std: '2.0 TR Inverter Split AC Unit (5 Star BEE Rated)',
      cat: 'HVAC',
      sub: 'Air Conditioning',
      uom: 'NOS',
      qty: 20,
      rate: 50000,
      amount: 1000000,
      source: 'Approved Vendor Rate Card',
    },
  ];

  const createdR0Lines: any[] = [];
  for (const l of rev1R0Lines) {
    const line = await prisma.boqLine.create({
      data: {
        tenantId: tenantA.id,
        boqRevisionId: rev1R0.id,
        lineNumber: l.ln,
        originalDescription: l.orig,
        standardDescription: l.std,
        aiSuggestedDescription: l.std,
        aiReason: 'Standardized to CPX catalog specification with validated market benchmarks',
        aiConfidence: 0.94,
        aiUnitCost: l.rate,
        aiTotalCost: l.amount,
        costConfidence: 0.92,
        costSource: l.source,
        costMethod: 'WEIGHTED_MEDIAN',
        categoryId: catMapA[l.cat],
        subcategoryId: catMapA[l.sub],
        uomId: uomMapA[l.uom],
        uomRaw: l.uom,
        quantity: l.qty,
        validationStatus: 'VALID',
        benchmarkEligible: true,
      },
    });
    createdR0Lines.push(line);
  }

  // Create Budget Contribution for rev1R0 (APPROVED by Project Approver and Finance)
  const budgetContrib1 = await prisma.budgetContribution.create({
    data: {
      tenantId: tenantA.id,
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      boqId: boq1.id,
      boqRevisionId: rev1R0.id,
      totalEstimatedValue: 4350000,
      acceptedEstimatedValue: 4350000,
      status: 'APPROVED',
      submittedAt: new Date(Date.now() - 4 * 86400000),
      submittedBy: userMapA['PROJECT_USER'],
      projectApprovedAt: new Date(Date.now() - 3 * 86400000),
      projectApprovedBy: userMapA['PROJECT_APPROVER'],
      financeApprovedAt: new Date(Date.now() - 2 * 86400000),
      financeApprovedBy: userMapA['FINANCE_USER'],
      createdBy: userMapA['PROJECT_USER'],
    },
  });

  // Approvals audit records
  await prisma.budgetApproval.createMany({
    data: [
      {
        tenantId: tenantA.id,
        contributionId: budgetContrib1.id,
        approvalLevel: 'PROJECT_APPROVER',
        approverId: userMapA['PROJECT_APPROVER'],
        status: 'APPROVED',
        reason: 'Technical BOQ specifications and quantities verified against retail flagship layout A-103.',
        timestamp: new Date(Date.now() - 3 * 86400000),
      },
      {
        tenantId: tenantA.id,
        contributionId: budgetContrib1.id,
        approvalLevel: 'FINANCE',
        approverId: userMapA['FINANCE_USER'],
        status: 'APPROVED',
        reason: 'Capex budget allocation within approved FY26 Indiranagar expansion limits.',
        timestamp: new Date(Date.now() - 2 * 86400000),
      },
    ],
  });

  // Historical Budget Transactions
  await prisma.budgetTransaction.deleteMany({ where: { boqRevisionId: rev1R0.id } });
  await prisma.budgetTransaction.createMany({
    data: [
      {
        tenantId: tenantA.id,
        transactionCode: 'BTX-000001',
        projectId: project1.id,
        costCentreId: ccMapA['CC-001'].id,
        boqId: boq1.id,
        boqRevisionId: rev1R0.id,
        boqLineId: createdR0Lines[0].id,
        contributionId: budgetContrib1.id,
        category: 'Civil & Interior',
        subcategory: 'Flooring',
        amount: 2500000,
        quantity: 20000,
        rate: 125,
        status: 'APPROVED',
        reference: 'BOQ-000001 R0 Line 1.01',
        createdBy: userMapA['PROJECT_USER'],
      },
      {
        tenantId: tenantA.id,
        transactionCode: 'BTX-000002',
        projectId: project1.id,
        costCentreId: ccMapA['CC-001'].id,
        boqId: boq1.id,
        boqRevisionId: rev1R0.id,
        boqLineId: createdR0Lines[1].id,
        contributionId: budgetContrib1.id,
        category: 'Electrical',
        subcategory: 'Electrical Cable & Lighting',
        amount: 850000,
        quantity: 10100,
        rate: 84.15,
        status: 'APPROVED',
        reference: 'BOQ-000001 R0 Line 2.01 & 2.02',
        createdBy: userMapA['PROJECT_USER'],
      },
      {
        tenantId: tenantA.id,
        transactionCode: 'BTX-000003',
        projectId: project1.id,
        costCentreId: ccMapA['CC-001'].id,
        boqId: boq1.id,
        boqRevisionId: rev1R0.id,
        boqLineId: createdR0Lines[3].id,
        contributionId: budgetContrib1.id,
        category: 'HVAC',
        subcategory: 'Air Conditioning',
        amount: 1000000,
        quantity: 20,
        rate: 50000,
        status: 'APPROVED',
        reference: 'BOQ-000001 R0 Line 3.01',
        createdBy: userMapA['PROJECT_USER'],
      },
    ],
  });

  // Cost Centre 1 Budget Aggregate Record
  await prisma.budget.create({
    data: {
      tenantId: tenantA.id,
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      totalAmount: 4350000,
      approvedAmount: 4350000,
      pendingAmount: 0,
      status: 'APPROVED',
      createdBy: userMapA['PROJECT_USER'],
    },
  });

  // ============================================================
  // 5.4 BOQ 4 (FOR PR) ON CC-002 (Kitchen / F&B - 1,500 Sqft)
  // ============================================================
  const boq4 = await prisma.boq.upsert({
    where: { tenantId_boqCode: { tenantId: tenantA.id, boqCode: 'BOQ-000004' } },
    update: { status: 'DRAFT', costCentreId: ccMapA['CC-002'].id, purpose: 'PR' },
    create: {
      tenantId: tenantA.id,
      projectId: project1.id,
      costCentreId: ccMapA['CC-002'].id,
      boqCode: 'BOQ-000004',
      status: 'DRAFT',
      purpose: 'PR',
      createdBy: userMapA['PROJECT_USER'],
    },
  });

  const rev4R0 = await prisma.boqRevision.upsert({
    where: { boqId_revisionNumber: { boqId: boq4.id, revisionNumber: 0 } },
    update: {
      costCentreId: ccMapA['CC-002'].id,
      preparationStatus: 'READY_FOR_SUBMISSION',
      prStatus: 'PR_RELEASED_TO_PROCUREMENT',
      sourceType: 'STANDARD_BOQ',
    },
    create: {
      tenantId: tenantA.id,
      boqId: boq4.id,
      costCentreId: ccMapA['CC-002'].id,
      revisionNumber: 0,
      revisionCode: 'R0',
      status: 'DRAFT',
      preparationStatus: 'READY_FOR_SUBMISSION',
      prStatus: 'PR_RELEASED_TO_PROCUREMENT',
      sourceType: 'STANDARD_BOQ',
      notes: 'Kitchen & F&B Equipment BOQ generated from Standard Library for PR creation',
      totalLines: 6,
      validLines: 6,
      warningLines: 0,
      errorLines: 0,
      qualityScore: 98,
      createdById: userMapA['PROJECT_USER'],
      uploadedAt: new Date(Date.now() - 3 * 86400000),
    },
  });

  await prisma.boqLine.deleteMany({ where: { boqRevisionId: rev4R0.id } });
  const kitchenLines = [
    { ln: '1', desc: 'Commercial SS 304 Under-Counter 2-Door Chiller (300L)', cat: 'Kitchen / F&B Equipment', sub: 'Refrigerators & Freezers', uom: 'NOS', qty: 2, rate: 75000, val: 150000 },
    { ln: '2', desc: 'Commercial SS 304 Prep Table with Splashback (1500x600mm)', cat: 'Kitchen / F&B Equipment', sub: 'Stainless Steel Counters', uom: 'NOS', qty: 4, rate: 18500, val: 74000 },
    { ln: '3', desc: 'Heavy Duty 4-Burner Commercial Cooking Range with Oven', cat: 'Kitchen / F&B Equipment', sub: 'Commercial Cooking Range', uom: 'NOS', qty: 1, rate: 220000, val: 220000 },
    { ln: '4', desc: 'Commercial Kitchen Island Exhaust Hood with Baffle Filters', cat: 'Kitchen / F&B Equipment', sub: 'Exhaust Hood', uom: 'NOS', qty: 1, rate: 180000, val: 180000 },
    { ln: '5', desc: 'Undercounter Commercial Dishwasher (60 Racks/Hour)', cat: 'Kitchen / F&B Equipment', sub: 'Dishwashers', uom: 'NOS', qty: 1, rate: 250000, val: 250000 },
    { ln: '6', desc: 'Kitchen Utility Power, Gas Line & Water Filtration Hookup', cat: 'Kitchen / F&B Equipment', sub: 'Stainless Steel Counters', uom: 'LOT', qty: 1, rate: 626000, val: 626000 },
  ];

  const createdKitLines: any[] = [];
  for (const kl of kitchenLines) {
    const kLine = await prisma.boqLine.create({
      data: {
        tenantId: tenantA.id,
        boqRevisionId: rev4R0.id,
        lineNumber: kl.ln,
        originalDescription: kl.desc,
        standardDescription: kl.desc,
        aiSuggestedDescription: kl.desc,
        aiConfidence: 0.96,
        aiUnitCost: kl.rate,
        aiTotalCost: kl.val,
        costConfidence: 0.95,
        costSource: 'Approved Vendor Rate Card',
        categoryId: catMapA[kl.cat],
        subcategoryId: catMapA[kl.sub],
        uomId: uomMapA[kl.uom],
        uomRaw: kl.uom,
        quantity: kl.qty,
        validationStatus: 'VALID',
        benchmarkEligible: true,
      },
    });
    createdKitLines.push(kLine);
  }

  // Create PR-2026-000001 (Approved & Released to Procurement!)
  const pr1 = await prisma.procurementRequest.upsert({
    where: { tenantId_prNumber: { tenantId: tenantA.id, prNumber: 'PR-2026-000001' } },
    update: {
      status: 'PR_RELEASED_TO_PROCUREMENT',
      totalEstimatedValue: 1500000,
    },
    create: {
      tenantId: tenantA.id,
      prNumber: 'PR-2026-000001',
      projectId: project1.id,
      costCentreId: ccMapA['CC-002'].id,
      boqId: boq4.id,
      boqRevisionId: rev4R0.id,
      title: 'Kitchen & F&B Equipment Sourcing Package',
      purpose: 'PROCUREMENT_SOURCING',
      totalEstimatedValue: 1500000,
      totalLines: 6,
      status: 'PR_RELEASED_TO_PROCUREMENT',
      requestedBy: 'Project User',
      requestedDate: new Date(Date.now() - 3 * 86400000),
      requiredDate: new Date(Date.now() + 30 * 86400000),
      projectApprovedAt: new Date(Date.now() - 2 * 86400000),
      projectApprovedBy: userMapA['PROJECT_APPROVER'],
      releasedAt: new Date(Date.now() - 1 * 86400000),
      releasedBy: userMapA['PROJECT_APPROVER'],
    },
  });

  await prisma.pRLine.deleteMany({ where: { prId: pr1.id } });
  for (let i = 0; i < kitchenLines.length; i++) {
    const kl = kitchenLines[i];
    await prisma.pRLine.create({
      data: {
        tenantId: tenantA.id,
        prId: pr1.id,
        boqLineId: createdKitLines[i].id,
        lineNumber: String(i + 1),
        itemDescription: kl.desc,
        specification: 'Standard commercial grade equipment as per CC-002 kitchen layout',
        category: kl.cat,
        subcategory: kl.sub,
        uom: kl.uom,
        quantity: kl.qty,
        estimatedRate: kl.rate,
        estimatedValue: kl.val,
        costCentre: 'CC-002 Kitchen / F&B',
      },
    });
  }

  // Create PR Approval log
  await prisma.pRApproval.create({
    data: {
      tenantId: tenantA.id,
      prId: pr1.id,
      approverId: userMapA['PROJECT_APPROVER'],
      status: 'APPROVED',
      remarks: 'Kitchen equipment specifications approved for open competitive procurement sourcing.',
      timestamp: new Date(Date.now() - 2 * 86400000),
    },
  });

  // Dual purpose demonstration: PR-2026-000002 referencing BOQ-000001 R0 (Electrical items ₹8,50,000)
  const pr2 = await prisma.procurementRequest.upsert({
    where: { tenantId_prNumber: { tenantId: tenantA.id, prNumber: 'PR-2026-000002' } },
    update: {
      status: 'PR_PENDING_PROJECT_APPROVAL',
      totalEstimatedValue: 850000,
    },
    create: {
      tenantId: tenantA.id,
      prNumber: 'PR-2026-000002',
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      boqId: boq1.id,
      boqRevisionId: rev1R0.id,
      title: 'Flagship Retail Store Electrical Wiring & Lighting Package',
      purpose: 'PROCUREMENT_SOURCING',
      totalEstimatedValue: 850000,
      totalLines: 2,
      status: 'PR_PENDING_PROJECT_APPROVAL',
      requestedBy: 'Project User',
      requestedDate: new Date(),
      requiredDate: new Date(Date.now() + 45 * 86400000),
    },
  });

  await prisma.pRLine.deleteMany({ where: { prId: pr2.id } });
  await prisma.pRLine.createMany({
    data: [
      {
        tenantId: tenantA.id,
        prId: pr2.id,
        boqLineId: createdR0Lines[1].id,
        lineNumber: '1',
        itemDescription: 'Electrical Cable 2.5 SQMM (FRLS Copper)',
        specification: '1100V grade fire retardant copper wire through 25mm PVC conduits',
        category: 'Electrical',
        subcategory: 'Electrical Cable',
        uom: 'MTR',
        quantity: 10000,
        estimatedRate: 65,
        estimatedValue: 650000,
        costCentre: 'CC-001 Retail Store Fitout',
      },
      {
        tenantId: tenantA.id,
        prId: pr2.id,
        boqLineId: createdR0Lines[2].id,
        lineNumber: '2',
        itemDescription: 'LED Recessed Panel Light (600x600mm, 36W)',
        specification: '36W 4000K recessed troffer light with electronic driver',
        category: 'Electrical',
        subcategory: 'LED Light',
        uom: 'NOS',
        quantity: 100,
        estimatedRate: 2000,
        estimatedValue: 200000,
        costCentre: 'CC-001 Retail Store Fitout',
      },
    ],
  });

  // Revision R1 (Standardised BOQ)
  const rev1R1 = await prisma.boqRevision.upsert({
    where: { boqId_revisionNumber: { boqId: boq1.id, revisionNumber: 1 } },
    update: {},
    create: {
      tenantId: tenantA.id,
      boqId: boq1.id,
      revisionNumber: 1,
      revisionCode: 'R1',
      status: 'DRAFT',
      notes: 'UOM normalisation and catalog description mapping applied',
      totalLines: 32,
      validLines: 28,
      warningLines: 4,
      errorLines: 0,
      qualityScore: 92,
      createdById: userMapA['PROJECT_USER'],
      uploadedAt: new Date(Date.now() - 3 * 86400000),
    },
  });

  // Revision R2 (Active DRAFT Revision demonstrating validation rules & errors)
  const rev1R2 = await prisma.boqRevision.upsert({
    where: { boqId_revisionNumber: { boqId: boq1.id, revisionNumber: 2 } },
    update: {},
    create: {
      tenantId: tenantA.id,
      boqId: boq1.id,
      revisionNumber: 2,
      revisionCode: 'R2',
      status: 'DRAFT',
      notes: 'Project User manual modifications and validation test lines',
      totalLines: 32,
      validLines: 22,
      warningLines: 5,
      errorLines: 5,
      qualityScore: 78,
      createdById: userMapA['PROJECT_USER'],
      uploadedAt: new Date(Date.now() - 1 * 86400000),
    },
  });

  // Seed lines for R2
  await prisma.boqLine.deleteMany({ where: { boqRevisionId: rev1R2.id } });
  const r2Lines = [
    // Description standardisation demonstration lines
    {
      ln: '1.01',
      orig: 'AC 2 Ton',
      std: '2 TR Split AC (Inverter 5 Star)',
      cat: 'HVAC',
      sub: 'Air Conditioning',
      uomRaw: 'nos',
      uom: 'NOS',
      qty: 15,
      status: 'VALID',
      msgs: [],
    },
    {
      ln: '1.02',
      orig: '2 Ton AC',
      std: '2 TR Split AC (Inverter 5 Star)',
      cat: 'HVAC',
      sub: 'Air Conditioning',
      uomRaw: 'Nos.',
      uom: 'NOS',
      qty: 8,
      status: 'VALID',
      msgs: [],
    },
    {
      ln: '1.03',
      orig: '2T Split AC',
      std: '2 TR Split AC (Inverter 5 Star)',
      cat: 'HVAC',
      sub: 'Air Conditioning',
      uomRaw: 'Number',
      uom: 'NOS',
      qty: 6,
      status: 'VALID',
      msgs: [],
    },
    // UOM normalisation demonstration
    {
      ln: '1.04',
      orig: 'Vitrified Tile Flooring 600x600',
      std: 'Vitrified Tile Flooring (600x600mm)',
      cat: 'Civil & Interior',
      sub: 'Flooring',
      uomRaw: 'Sqft',
      uom: 'SQFT',
      qty: 22000,
      status: 'VALID',
      msgs: [],
    },
    {
      ln: '1.05',
      orig: 'Structural Steel Angles',
      std: 'Structural Steel MS Angle (50x50x6mm)',
      cat: 'Civil & Interior',
      sub: 'Gypsum Partition',
      uomRaw: 'Kgs',
      uom: 'KG',
      qty: 450,
      status: 'VALID',
      msgs: [],
    },
    // Deliberate validation error lines
    {
      ln: '2.01',
      orig: '',
      std: '',
      cat: 'Civil & Interior',
      sub: 'Painting',
      uomRaw: 'SQFT',
      uom: 'SQFT',
      qty: 1200,
      status: 'ERROR',
      msgs: [{ level: 'ERROR', code: 'DESC_MISSING', message: 'Description is required.' }],
    },
    {
      ln: '2.02',
      orig: 'LED Track Light (30W COB)',
      std: 'LED Track Light (30W COB)',
      cat: 'Electrical',
      sub: 'LED Light',
      uomRaw: '',
      uom: null,
      qty: 45,
      status: 'ERROR',
      msgs: [{ level: 'ERROR', code: 'UOM_MISSING', message: 'Unit of Measure (UOM) is required.' }],
    },
    {
      ln: '2.03',
      orig: 'Fire Alarm Smoke Detector',
      std: 'Fire Alarm Optical Smoke Detector',
      cat: 'Fire Fighting',
      sub: 'Fire Alarm',
      uomRaw: 'NOS',
      uom: 'NOS',
      qty: 0,
      status: 'ERROR',
      msgs: [{ level: 'ERROR', code: 'QTY_ZERO', message: 'Quantity must be greater than zero.' }],
    },
    {
      ln: '2.04',
      orig: 'PVC Conduit Pipe (25mm)',
      std: 'PVC Conduit Pipe (25mm Heavy Duty)',
      cat: 'Electrical',
      sub: 'Wiring / Cabling',
      uomRaw: 'MTR',
      uom: 'MTR',
      qty: -50,
      status: 'ERROR',
      msgs: [{ level: 'ERROR', code: 'QTY_NEGATIVE', message: 'Quantity cannot be negative.' }],
    },
    {
      ln: '1.01', // duplicate line number!
      orig: 'Duplicate Cable Run Line',
      std: 'Duplicate Cable Run Line',
      cat: 'Electrical',
      sub: 'Electrical Cable',
      uomRaw: 'MTR',
      uom: 'MTR',
      qty: 100,
      status: 'ERROR',
      msgs: [{ level: 'ERROR', code: 'LINE_DUPLICATE', message: 'Duplicate line number detected.' }],
    },
    // Deliberate validation warning lines
    {
      ln: '3.01',
      orig: 'Miscellaneous Junction Box (4x4)',
      std: 'Miscellaneous Junction Box (4x4)',
      cat: null, // uncategorised
      sub: null,
      uomRaw: 'NOS',
      uom: 'NOS',
      qty: 30,
      status: 'WARNING',
      msgs: [{ level: 'WARNING', code: 'CAT_MISSING', message: 'Category is not assigned.' }],
    },
    {
      ln: '3.02',
      orig: 'Door',
      std: 'Door',
      cat: 'Civil & Interior',
      sub: 'Doors',
      uomRaw: 'NOS',
      uom: 'NOS',
      qty: 5,
      status: 'WARNING',
      msgs: [{ level: 'WARNING', code: 'DESC_SHORT', message: 'Description is very short. Please verify.' }],
    },
    {
      ln: '3.03',
      orig: 'Cat6 LAN Cable Run',
      std: 'Cat6 LAN Cable Run (4 Pair UTP)',
      cat: 'ELV / IT',
      sub: 'Data Point',
      uomRaw: 'MTR',
      uom: 'MTR',
      qty: 12000000, // unusually high
      status: 'WARNING',
      msgs: [{ level: 'WARNING', code: 'QTY_HIGH', message: 'Quantity is unusually high. Please verify.' }],
    },
    // Valid standard lines across trades
    { ln: '4.01', orig: 'False Ceiling - Gypsum Board', std: 'False Ceiling - Gypsum Board (12.5mm)', cat: 'Civil & Interior', sub: 'False Ceiling', uomRaw: 'SQFT', uom: 'SQFT', qty: 20000, status: 'VALID', msgs: [] },
    { ln: '4.02', orig: 'Gypsum Partition Wall (Single Layer)', std: 'Gypsum Partition Wall (Single Layer 75mm)', cat: 'Civil & Interior', sub: 'Gypsum Partition', uomRaw: 'SQFT', uom: 'SQFT', qty: 8000, status: 'VALID', msgs: [] },
    { ln: '4.03', orig: 'Interior Painting - 2 Coats Acrylic Emulsion', std: 'Interior Painting - 2 Coats Acrylic Emulsion', cat: 'Civil & Interior', sub: 'Painting', uomRaw: 'SQFT', uom: 'SQFT', qty: 15000, status: 'VALID', msgs: [] },
    { ln: '4.04', orig: 'Main Entrance Door (Toughened Glass)', std: 'Main Entrance Door (Toughened Glass with Patch)', cat: 'Civil & Interior', sub: 'Doors', uomRaw: 'NOS', uom: 'NOS', qty: 4, status: 'VALID', msgs: [] },
    { ln: '4.05', orig: 'Electrical Cable - 2.5 SQMM (FRLS Copper)', std: 'Electrical Cable - 2.5 SQMM (FRLS Copper)', cat: 'Electrical', sub: 'Electrical Cable', uomRaw: 'MTR', uom: 'MTR', qty: 15000, status: 'VALID', msgs: [] },
    { ln: '4.06', orig: 'DB Panel - 4 Way TPN (100A Incomer)', std: 'DB Panel - 4 Way TPN (100A Incomer)', cat: 'Electrical', sub: 'DB Panel', uomRaw: 'NOS', uom: 'NOS', qty: 8, status: 'VALID', msgs: [] },
    { ln: '4.07', orig: 'LED Panel Light (600x600mm, 36W)', std: 'LED Panel Light (600x600mm, 36W)', cat: 'Electrical', sub: 'LED Light', uomRaw: 'NOS', uom: 'NOS', qty: 200, status: 'VALID', msgs: [] },
    { ln: '4.08', orig: 'Modular Switches (6A/16A Piano)', std: 'Modular Switches (6A/16A Piano)', cat: 'Electrical', sub: 'Switches', uomRaw: 'NOS', uom: 'NOS', qty: 140, status: 'VALID', msgs: [] },
    { ln: '4.09', orig: 'Copper Pipe (22mm OD Refrigerant)', std: 'Copper Pipe (22mm OD Refrigerant Type B)', cat: 'Plumbing', sub: 'Copper Pipe', uomRaw: 'MTR', uom: 'MTR', qty: 500, status: 'VALID', msgs: [] },
    { ln: '4.10', orig: 'PVC Drain Pipe (110mm SWR)', std: 'PVC Drain Pipe (110mm SWR)', cat: 'Plumbing', sub: 'Drain Pipe', uomRaw: 'MTR', uom: 'MTR', qty: 300, status: 'VALID', msgs: [] },
    { ln: '4.11', orig: 'ABC Fire Extinguisher (5 Kg Stored Pressure)', std: 'ABC Fire Extinguisher (5 Kg Stored Pressure)', cat: 'Fire Fighting', sub: 'Fire Extinguisher', uomRaw: 'NOS', uom: 'NOS', qty: 20, status: 'VALID', msgs: [] },
    { ln: '4.12', orig: 'IP CCTV Camera (2MP, Fixed Dome IR)', std: 'IP CCTV Camera (2MP, Fixed Dome IR)', cat: 'ELV / IT', sub: 'CCTV Camera', uomRaw: 'NOS', uom: 'NOS', qty: 24, status: 'VALID', msgs: [] },
    { ln: '4.13', orig: 'Network Rack (12U Wall Mount with PDU)', std: 'Network Rack (12U Wall Mount with PDU)', cat: 'ELV / IT', sub: 'Rack', uomRaw: 'NOS', uom: 'NOS', qty: 2, status: 'VALID', msgs: [] },
    { ln: '4.14', orig: 'Checkout Counter (Custom Fabricated Corian)', std: 'Checkout Counter (Custom Fabricated Corian)', cat: 'Furniture', sub: 'Counters', uomRaw: 'NOS', uom: 'NOS', qty: 4, status: 'VALID', msgs: [] },
    { ln: '4.15', orig: 'Display Shelving Unit (2m Height Metal)', std: 'Display Shelving Unit (2m Height Metal)', cat: 'Furniture', sub: 'Counters', uomRaw: 'NOS', uom: 'NOS', qty: 30, status: 'VALID', msgs: [] },
    { ln: '4.16', orig: 'Cashier Ergonomic Chair (High Back Mesh)', std: 'Cashier Ergonomic Chair (High Back Mesh)', cat: 'Furniture', sub: 'Chairs', uomRaw: 'NOS', uom: 'NOS', qty: 8, status: 'VALID', msgs: [] },
  ];

  for (const l of r2Lines) {
    await prisma.boqLine.create({
      data: {
        tenantId: tenantA.id,
        boqRevisionId: rev1R2.id,
        lineNumber: l.ln,
        originalDescription: l.orig,
        standardDescription: l.std,
        categoryId: l.cat ? catMapA[l.cat] : undefined,
        subcategoryId: l.sub ? catMapA[l.sub] : undefined,
        uomId: l.uom ? uomMapA[l.uom] : undefined,
        uomRaw: l.uomRaw,
        quantity: l.qty,
        validationStatus: l.status,
        validationMessages: JSON.stringify(l.msgs),
        benchmarkEligible: true,
      },
    });
  }
  console.log(`  ✓ Project 1: CPX-P-000001 created with BOQ Revisions R0, R1, R2`);

  // --- PROJECT 2: SUBMITTED / UNDER REVIEW BOQ (CPX-P-000002) ---
  const project2 = await prisma.project.upsert({
    where: { tenantId_projectCode: { tenantId: tenantA.id, projectCode: 'CPX-P-000002' } },
    update: { status: 'BOQ_REVIEW' },
    create: {
      tenantId: tenantA.id,
      projectCode: 'CPX-P-000002',
      name: 'Express Grocery Mart – Hyderabad',
      description: 'Neighborhood 12,500 sqft grocery format new build capex project',
      sector: 'RETAIL',
      projectType: 'NEW_BUILD',
      location: 'Gachibowli Financial District',
      city: 'Hyderabad',
      state: 'Telangana',
      country: 'India',
      areaSqFt: 12500,
      costCentre: 'RET-HYD-002',
      projectOwner: 'Project User',
      budget: 4200000,
      currency: 'INR',
      status: 'BOQ_REVIEW',
      createdBy: userMapA['PROJECT_USER'],
    },
  });

  const boq2 = await prisma.boq.upsert({
    where: { tenantId_boqCode: { tenantId: tenantA.id, boqCode: 'BOQ-000002' } },
    update: { status: 'SUBMITTED' },
    create: {
      tenantId: tenantA.id,
      projectId: project2.id,
      boqCode: 'BOQ-000002',
      status: 'SUBMITTED',
      createdBy: userMapA['PROJECT_USER'],
    },
  });

  // Revision R0: REJECTED by Project Approver
  await prisma.boqRevision.upsert({
    where: { boqId_revisionNumber: { boqId: boq2.id, revisionNumber: 0 } },
    update: {},
    create: {
      tenantId: tenantA.id,
      boqId: boq2.id,
      revisionNumber: 0,
      revisionCode: 'R0',
      status: 'REJECTED',
      rejectedAt: new Date(Date.now() - 2 * 86400000),
      rejectionReason: 'Missing civil foundation specifications and refrigeration unit quantities need re-estimation.',
      totalLines: 15,
      validLines: 10,
      errorLines: 3,
      warningLines: 2,
      qualityScore: 65,
      createdById: userMapA['PROJECT_USER'],
    },
  });

  // Revision R1: APPROVED (Approved Commercial Baseline for Hyderabad Grocery Mart)
  const rev2R1 = await prisma.boqRevision.upsert({
    where: { boqId_revisionNumber: { boqId: boq2.id, revisionNumber: 1 } },
    update: {
      status: 'APPROVED',
      approvedAt: new Date(Date.now() - 1 * 86400000),
      approvedById: userMapA['PROJECT_APPROVER'],
    },
    create: {
      tenantId: tenantA.id,
      boqId: boq2.id,
      revisionNumber: 1,
      revisionCode: 'R1',
      status: 'APPROVED',
      submittedAt: new Date(Date.now() - 3 * 86400000),
      approvedAt: new Date(Date.now() - 1 * 86400000),
      approvedById: userMapA['PROJECT_APPROVER'],
      totalLines: 18,
      validLines: 18,
      errorLines: 0,
      warningLines: 0,
      qualityScore: 98,
      createdById: userMapA['PROJECT_USER'],
      notes: 'Approved commercial baseline for Express Grocery Mart – Hyderabad',
    },
  });

  // Clean lines for submitted R1
  await prisma.boqLine.deleteMany({ where: { boqRevisionId: rev2R1.id } });
  const p2Lines = [
    { ln: '1', desc: 'Vitrified Tile Flooring (600x600mm)', cat: 'Civil & Interior', sub: 'Flooring', uom: 'SQFT', qty: 11000 },
    { ln: '2', desc: 'False Ceiling - Gypsum Board', cat: 'Civil & Interior', sub: 'False Ceiling', uom: 'SQFT', qty: 10000 },
    { ln: '3', desc: 'Interior Painting - Acrylic Emulsion', cat: 'Civil & Interior', sub: 'Painting', uom: 'SQFT', qty: 8500 },
    { ln: '4', desc: '4 TR Cassette AC (Inverter)', cat: 'HVAC', sub: 'Air Conditioning', uom: 'NOS', qty: 6 },
    { ln: '5', desc: 'Electrical Cable - 2.5 SQMM (FRLS)', cat: 'Electrical', sub: 'Electrical Cable', uom: 'MTR', qty: 6000 },
    { ln: '6', desc: 'LED Panel Light (600x600mm, 36W)', cat: 'Electrical', sub: 'LED Light', uom: 'NOS', qty: 90 },
    { ln: '7', desc: 'Checkout Cashier Counters', cat: 'Furniture', sub: 'Counters', uom: 'NOS', qty: 3 },
    { ln: '8', desc: 'Display Gondola Shelving (1.8m)', cat: 'Furniture', sub: 'Counters', uom: 'NOS', qty: 25 },
  ];
  for (const l of p2Lines) {
    await prisma.boqLine.create({
      data: {
        tenantId: tenantA.id,
        boqRevisionId: rev2R1.id,
        lineNumber: l.ln,
        originalDescription: l.desc,
        standardDescription: l.desc,
        categoryId: catMapA[l.cat],
        subcategoryId: catMapA[l.sub],
        uomId: uomMapA[l.uom],
        uomRaw: l.uom,
        quantity: l.qty,
        validationStatus: 'VALID',
        benchmarkEligible: true,
      },
    });
  }
  console.log(`  ✓ Project 2: CPX-P-000002 created with SUBMITTED Revision R1 in Approval Queue`);

  // --- PROJECT 3: APPROVED BOQ (CPX-P-000003) ---
  const project3 = await prisma.project.upsert({
    where: { tenantId_projectCode: { tenantId: tenantA.id, projectCode: 'CPX-P-000003' } },
    update: { status: 'BOQ_APPROVED' },
    create: {
      tenantId: tenantA.id,
      projectCode: 'CPX-P-000003',
      name: 'Hypermarket Anchor Store – Pune',
      description: 'Regional 45,000 sqft hypermarket flagship store complete fit-out',
      sector: 'RETAIL',
      projectType: 'FIT_OUT',
      location: 'Phoenix Market City, Viman Nagar',
      city: 'Pune',
      state: 'Maharashtra',
      country: 'India',
      areaSqFt: 45000,
      costCentre: 'RET-PUN-003',
      projectOwner: 'Project User',
      budget: 18000000,
      currency: 'INR',
      status: 'BOQ_APPROVED',
      createdBy: userMapA['PROJECT_USER'],
    },
  });

  const boq3 = await prisma.boq.upsert({
    where: { tenantId_boqCode: { tenantId: tenantA.id, boqCode: 'BOQ-000003' } },
    update: { status: 'APPROVED' },
    create: {
      tenantId: tenantA.id,
      projectId: project3.id,
      boqCode: 'BOQ-000003',
      status: 'APPROVED',
      createdBy: userMapA['PROJECT_USER'],
    },
  });

  const rev3R0 = await prisma.boqRevision.upsert({
    where: { boqId_revisionNumber: { boqId: boq3.id, revisionNumber: 0 } },
    update: {},
    create: {
      tenantId: tenantA.id,
      boqId: boq3.id,
      revisionNumber: 0,
      revisionCode: 'R0',
      status: 'APPROVED',
      submittedAt: new Date(Date.now() - 4 * 86400000),
      approvedAt: new Date(Date.now() - 2 * 86400000),
      approvedById: userMapA['PROJECT_APPROVER'],
      totalLines: 12,
      validLines: 12,
      errorLines: 0,
      warningLines: 0,
      qualityScore: 98,
      createdById: userMapA['PROJECT_USER'],
      notes: 'Approved commercial baseline for Pune hypermarket fit-out',
    },
  });

  await prisma.boqLine.deleteMany({ where: { boqRevisionId: rev3R0.id } });
  const p3Lines = [
    { ln: '1', desc: 'Heavy Duty Industrial Vitrified Tiles', cat: 'Civil & Interior', sub: 'Flooring', uom: 'SQFT', qty: 42000 },
    { ln: '2', desc: 'Acoustic False Ceiling Panels', cat: 'Civil & Interior', sub: 'False Ceiling', uom: 'SQFT', qty: 38000 },
    { ln: '3', desc: 'Chilled Water Fan Coil Units (5 TR)', cat: 'HVAC', sub: 'Air Conditioning', uom: 'NOS', qty: 24 },
    { ln: '4', desc: 'GI Sheet Metal Air Ducting (22 Gauge)', cat: 'HVAC', sub: 'Ducting', uom: 'SQFT', qty: 12000 },
    { ln: '5', desc: 'Main LT Distribution Switchboard (800A)', cat: 'Electrical', sub: 'DB Panel', uom: 'NOS', qty: 2 },
    { ln: '6', desc: 'Armoured Copper Power Cable (16 SQMM)', cat: 'Electrical', sub: 'Electrical Cable', uom: 'MTR', qty: 4000 },
    { ln: '7', desc: 'High Bay LED Lights (100W IP65)', cat: 'Electrical', sub: 'LED Light', uom: 'NOS', qty: 180 },
    { ln: '8', desc: 'Wet Pipe Sprinkler System Heads', cat: 'Fire Fighting', sub: 'Sprinkler', uom: 'NOS', qty: 350 },
    { ln: '9', desc: 'Analogue Addressable Fire Alarm Panel', cat: 'Fire Fighting', sub: 'Fire Alarm', uom: 'NOS', qty: 1 },
    { ln: '10', desc: 'Motorized Checkout Lanes with Conveyor', cat: 'Furniture', sub: 'Counters', uom: 'NOS', qty: 12 },
    { ln: '11', desc: 'Heavy Duty Pallet Racking Units', cat: 'Furniture', sub: 'Counters', uom: 'NOS', qty: 80 },
    { ln: '12', desc: 'IP CCTV Surveillance Cameras (4MP IR)', cat: 'ELV / IT', sub: 'CCTV Camera', uom: 'NOS', qty: 64 },
  ];
  for (const l of p3Lines) {
    await prisma.boqLine.create({
      data: {
        tenantId: tenantA.id,
        boqRevisionId: rev3R0.id,
        lineNumber: l.ln,
        originalDescription: l.desc,
        standardDescription: l.desc,
        categoryId: catMapA[l.cat],
        subcategoryId: catMapA[l.sub],
        uomId: uomMapA[l.uom],
        uomRaw: l.uom,
        quantity: l.qty,
        validationStatus: 'VALID',
        benchmarkEligible: true,
      },
    });
  }
  console.log(`  ✓ Project 3: CPX-P-000003 created with APPROVED Revision R0 (Immutable Baseline)`);

  // ============================================================
  // 6. TENANT B DEMO PROJECT (Hospitality - Isolation Testing)
  // ============================================================
  console.log('\n🏨 Creating Tenant B Project (Isolation Demonstration)...');
  const projectB = await prisma.project.upsert({
    where: { tenantId_projectCode: { tenantId: tenantB.id, projectCode: 'CPX-H-000001' } },
    update: {},
    create: {
      tenantId: tenantB.id,
      projectCode: 'CPX-H-000001',
      name: 'Grand Hyatt Luxury Suites Renovation – Mumbai',
      description: 'Exclusive 5-star presidential suites and executive lounge refurbishment',
      sector: 'HOSPITALITY',
      projectType: 'REFURBISHMENT',
      location: 'Santacruz East',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India',
      areaSqFt: 35000,
      costCentre: 'HOSP-BOM-001',
      projectOwner: 'Hospitality Project User',
      budget: 15000000,
      currency: 'INR',
      status: 'BOQ_PREPARATION',
      createdBy: userMapB['PROJECT_USER'],
    },
  });

  const boqB = await prisma.boq.upsert({
    where: { tenantId_boqCode: { tenantId: tenantB.id, boqCode: 'BOQ-H-000001' } },
    update: {},
    create: {
      tenantId: tenantB.id,
      projectId: projectB.id,
      boqCode: 'BOQ-H-000001',
      status: 'DRAFT',
      createdBy: userMapB['PROJECT_USER'],
    },
  });

  const revB = await prisma.boqRevision.upsert({
    where: { boqId_revisionNumber: { boqId: boqB.id, revisionNumber: 0 } },
    update: {},
    create: {
      tenantId: tenantB.id,
      boqId: boqB.id,
      revisionNumber: 0,
      revisionCode: 'R0',
      status: 'DRAFT',
      totalLines: 5,
      validLines: 5,
      errorLines: 0,
      warningLines: 0,
      qualityScore: 100,
      createdById: userMapB['PROJECT_USER'],
    },
  });

  await prisma.boqLine.deleteMany({ where: { boqRevisionId: revB.id } });
  await prisma.boqLine.create({
    data: {
      tenantId: tenantB.id,
      boqRevisionId: revB.id,
      lineNumber: '1',
      originalDescription: 'Italian Marble Flooring (Statuario 20mm)',
      standardDescription: 'Italian Marble Flooring (Statuario 20mm)',
      uomRaw: 'SQFT',
      quantity: 12000,
      validationStatus: 'VALID',
    },
  });
  console.log(`  ✓ Tenant B Project CPX-H-000001 created`);

  // ============================================================
  // 7. AUDIT TRAIL LOGS (Tenant A & B)
  // ============================================================
  console.log('\n🔍 Seeding Structured Audit Trail Events...');
  await prisma.auditLog.deleteMany({ where: { tenantId: tenantA.id } });
  const auditEvents = [
    {
      tenantId: tenantA.id,
      userId: userMapA['PROJECT_USER'],
      projectId: project1.id,
      entityType: 'PROJECT',
      entityId: project1.id,
      action: 'CREATE',
      description: 'Project CPX-P-000001 created: Premium Retail Flagship Store – Bengaluru',
      newValue: JSON.stringify({ projectCode: project1.projectCode, name: project1.name, budget: 8500000 }),
      createdAt: new Date(Date.now() - 6 * 86400000),
    },
    {
      tenantId: tenantA.id,
      userId: userMapA['PROJECT_USER'],
      projectId: project1.id,
      entityType: 'BOQ_REVISION',
      entityId: rev1R0.id,
      action: 'UPLOAD',
      description: 'Original BOQ spreadsheet uploaded: Original_Tender_BOQ_Bengaluru.xlsx (Revision R0)',
      newValue: JSON.stringify({ fileName: 'Original_Tender_BOQ_Bengaluru.xlsx', fileSize: 45056, revisionCode: 'R0' }),
      createdAt: new Date(Date.now() - 5 * 86400000),
    },
    {
      tenantId: tenantA.id,
      userId: userMapA['PROJECT_USER'],
      projectId: project1.id,
      entityType: 'BOQ_REVISION',
      entityId: rev1R1.id,
      action: 'STANDARDISE',
      description: 'BOQ Revision R1 standardised against enterprise UOM & catalog dictionary',
      oldValue: JSON.stringify({ qualityScore: 68, validLines: 20 }),
      newValue: JSON.stringify({ qualityScore: 92, validLines: 28, standardisedCount: 8 }),
      createdAt: new Date(Date.now() - 3 * 86400000),
    },
    {
      tenantId: tenantA.id,
      userId: userMapA['PROJECT_USER'],
      projectId: project2.id,
      entityType: 'BOQ_REVISION',
      entityId: boq2.id,
      action: 'SUBMIT',
      description: 'BOQ Revision R0 submitted for management review',
      createdAt: new Date(Date.now() - 2.5 * 86400000),
    },
    {
      tenantId: tenantA.id,
      userId: userMapA['PROJECT_APPROVER'],
      projectId: project2.id,
      entityType: 'BOQ_REVISION',
      entityId: boq2.id,
      action: 'REJECT',
      description: 'BOQ Revision R0 REJECTED by Project Approver: Missing civil foundation specifications and refrigeration unit quantities need re-estimation.',
      oldValue: JSON.stringify({ status: 'SUBMITTED' }),
      newValue: JSON.stringify({ status: 'REJECTED', rejectionReason: 'Missing civil foundation specifications and refrigeration unit quantities need re-estimation.' }),
      createdAt: new Date(Date.now() - 2 * 86400000),
    },
    {
      tenantId: tenantA.id,
      userId: userMapA['PROJECT_USER'],
      projectId: project2.id,
      entityType: 'BOQ_REVISION',
      entityId: rev2R1.id,
      action: 'SUBMIT',
      description: 'BOQ Revision R1 resubmitted after correcting civil specifications',
      oldValue: JSON.stringify({ revisionCode: 'R0', status: 'REJECTED' }),
      newValue: JSON.stringify({ revisionCode: 'R1', status: 'SUBMITTED' }),
      createdAt: new Date(Date.now() - 4 * 3600000),
    },
    {
      tenantId: tenantA.id,
      userId: userMapA['PROJECT_APPROVER'],
      projectId: project3.id,
      entityType: 'BOQ_REVISION',
      entityId: rev3R0.id,
      action: 'APPROVE',
      description: 'BOQ Revision R0 APPROVED as Immutable Commercial Baseline for Downstream Sourcing',
      oldValue: JSON.stringify({ status: 'SUBMITTED', isLocked: false }),
      newValue: JSON.stringify({ status: 'APPROVED', isLocked: true, approvedBy: 'project.approver@procucev-demo.local' }),
      createdAt: new Date(Date.now() - 2 * 86400000),
    },
  ];

  for (const ev of auditEvents) {
    await prisma.auditLog.create({ data: ev });
  }

  // Tenant B audit log (Isolation check)
  await prisma.auditLog.deleteMany({ where: { tenantId: tenantB.id } });
  await prisma.auditLog.create({
    data: {
      tenantId: tenantB.id,
      userId: userMapB['PROJECT_USER'],
      projectId: projectB.id,
      entityType: 'PROJECT',
      entityId: projectB.id,
      action: 'CREATE',
      description: 'Hospitality Project CPX-H-000001 initialized for Mumbai Luxury Suites',
      createdAt: new Date(),
    },
  });
  console.log(`  ✓ Audit Trail seeded with realistic chronological lifecycle events`);

  // ============================================================
  // 8. PROCUREMENT SOURCING ECOSYSTEM (VENDORS, RFQS, QUOTES, AWARDS)
  // ============================================================
  console.log('\n🏢 Creating Empanelled Sourcing Vendors...');
  const vendorDefsA = [
    {
      code: 'VND-0001',
      name: 'Apex Infrastructure & Contracting Pvt Ltd',
      contactPerson: 'Rajesh Sharma',
      email: 'vendor.apex@apex-infra.com',
      phone: '+91 98490 11223',
      categories: 'Civil & Structural',
      city: 'Hyderabad',
      state: 'Telangana',
      turnoverCrores: 45.0,
      experienceYears: 12,
      certifications: 'ISO 9001:2015, OHSAS 18001',
      complianceStatus: 'COMPLIANT',
      empanelmentStatus: 'APPROVED',
      performanceScore: 92.5,
      status: 'ACTIVE',
    },
    {
      code: 'VND-0002',
      name: 'BluePeak Engineering & MEP Solutions',
      contactPerson: 'Vikram Menon',
      email: 'sales@bluepeak-mep.com',
      phone: '+91 98840 22334',
      categories: 'HVAC & MEP',
      city: 'Bangalore',
      state: 'Karnataka',
      turnoverCrores: 32.5,
      experienceYears: 9,
      certifications: 'ISO 14001, BEE Certified',
      complianceStatus: 'COMPLIANT',
      empanelmentStatus: 'APPROVED',
      performanceScore: 89.0,
      status: 'ACTIVE',
    },
    {
      code: 'VND-0003',
      name: 'CraftLine Interior & Retail Fixtures',
      contactPerson: 'Sunil Agarwal',
      email: 'contracts@craftline-fixtures.in',
      phone: '+91 98201 33445',
      categories: 'Civil & Interior',
      city: 'Mumbai',
      state: 'Maharashtra',
      turnoverCrores: 28.0,
      experienceYears: 11,
      certifications: 'FSC Certified Wood, GreenPro',
      complianceStatus: 'COMPLIANT',
      empanelmentStatus: 'APPROVED',
      performanceScore: 91.0,
      status: 'ACTIVE',
    },
    {
      code: 'VND-0004',
      name: 'Zenith Retail Systems & Electrical Contracting',
      contactPerson: 'Pooja Reddy',
      email: 'tenders@zenith-retail.com',
      phone: '+91 99490 44556',
      categories: 'Electrical & IT',
      city: 'Hyderabad',
      state: 'Telangana',
      turnoverCrores: 38.0,
      experienceYears: 8,
      certifications: 'CEA Class-A Licensed, ISO 9001',
      complianceStatus: 'COMPLIANT',
      empanelmentStatus: 'APPROVED',
      performanceScore: 87.5,
      status: 'ACTIVE',
    },
  ];

  const vendorMapA: Record<string, any> = {};
  for (const vd of vendorDefsA) {
    const v = await prisma.vendor.upsert({
      where: { tenantId_code: { tenantId: tenantA.id, code: vd.code } },
      update: { ...vd },
      create: { tenantId: tenantA.id, ...vd },
    });
    vendorMapA[vd.code] = v;
    console.log(`  ✓ Vendor A: ${v.code} → ${v.name}`);
  }

  // Tenant B Vendor for tenant isolation verification
  const vendorB = await prisma.vendor.upsert({
    where: { tenantId_code: { tenantId: tenantB.id, code: 'VND-H001' } },
    update: {},
    create: {
      tenantId: tenantB.id,
      code: 'VND-H001',
      name: 'Grand Royal Hospitality Amenities & Interiors',
      contactPerson: 'David Fernandes',
      email: 'david@grandroyal-hospitality.com',
      categories: 'Hospitality Supplies',
      city: 'Mumbai',
      state: 'Maharashtra',
      turnoverCrores: 15.0,
      complianceStatus: 'COMPLIANT',
      empanelmentStatus: 'APPROVED',
      performanceScore: 85.0,
      status: 'ACTIVE',
    },
  });
  console.log(`  ✓ Tenant B Vendor: ${vendorB.code} → ${vendorB.name} (Isolated)`);

  // Fetch lines from approved Project 2 BOQ Revision R1 and Project 3 R0
  const rev2Lines = await prisma.boqLine.findMany({ where: { boqRevisionId: rev2R1.id } });
  const rev3Lines = await prisma.boqLine.findMany({ where: { boqRevisionId: rev3R0.id } });

  console.log('\n📝 Seeding RFQs across all 7 operational states...');

  // 1. DRAFT RFQ (Civil & Interior, Project 2)
  const rfq1 = await prisma.rfq.upsert({
    where: { tenantId_rfqNumber: { tenantId: tenantA.id, rfqNumber: 'RFQ-2026-000001' } },
    update: { status: 'DRAFT' },
    create: {
      tenantId: tenantA.id,
      projectId: project2.id,
      boqRevisionId: rev2R1.id,
      rfqNumber: 'RFQ-2026-000001',
      title: 'RFQ for Civil & Interior Works (Flooring & Partitions)',
      packageType: 'CATEGORY',
      packageName: 'Civil & Interior Works',
      scopeOfWork: 'Flooring, tiling, painting, and false ceiling for 12,500 sqft retail store',
      status: 'DRAFT',
      submissionDeadline: new Date(Date.now() + 14 * 86400000),
      commercialValidityDays: 60,
      estimatedBenchmarkValue: 1250000,
      totalLines: 3,
      createdById: userMapA['PROCUREMENT_USER'],
      lines: {
        create: rev2Lines.slice(0, 3).map((l, i) => ({
          tenantId: tenantA.id,
          boqLineId: l.id,
          lineNumber: `L-${i + 1}`,
          description: l.standardDescription || l.originalDescription,
          category: 'Civil & Interior',
          uom: l.uomRaw || 'SQFT',
          quantity: l.quantity,
          benchmarkRate: 85,
          benchmarkAmount: l.quantity * 85,
        })),
      },
    },
  });
  console.log(`  ✓ RFQ 1: DRAFT → ${rfq1.rfqNumber}`);

  // 2. RELEASED RFQ (HVAC Package, Project 2)
  const rfq2 = await prisma.rfq.upsert({
    where: { tenantId_rfqNumber: { tenantId: tenantA.id, rfqNumber: 'RFQ-2026-000002' } },
    update: { status: 'RELEASED' },
    create: {
      tenantId: tenantA.id,
      projectId: project2.id,
      boqRevisionId: rev2R1.id,
      rfqNumber: 'RFQ-2026-000002',
      title: 'RFQ for HVAC Air Conditioning Package',
      packageType: 'CATEGORY',
      packageName: 'HVAC Package',
      scopeOfWork: 'Supply, installation and commissioning of Inverter Cassette AC units and ducting',
      status: 'RELEASED',
      submissionDeadline: new Date(Date.now() + 10 * 86400000),
      commercialValidityDays: 60,
      estimatedBenchmarkValue: 850000,
      totalLines: 1,
      releasedAt: new Date(Date.now() - 2 * 86400000),
      createdById: userMapA['PROCUREMENT_USER'],
      lines: {
        create: rev2Lines.slice(3, 4).map((l, i) => ({
          tenantId: tenantA.id,
          boqLineId: l.id,
          lineNumber: `L-${i + 1}`,
          description: l.standardDescription || l.originalDescription,
          category: 'HVAC',
          uom: l.uomRaw || 'NOS',
          quantity: l.quantity,
          benchmarkRate: 140000,
          benchmarkAmount: l.quantity * 140000,
        })),
      },
      invitedVendors: {
        create: [
          { tenantId: tenantA.id, vendorId: vendorMapA['VND-0002'].id, invitationStatus: 'INVITED' },
          { tenantId: tenantA.id, vendorId: vendorMapA['VND-0004'].id, invitationStatus: 'INVITED' },
        ],
      },
    },
  });
  console.log(`  ✓ RFQ 2: RELEASED → ${rfq2.rfqNumber}`);

  // 3. RFQ WITH VENDOR RESPONSES (Electrical Package, Project 2)
  const rfq3 = await prisma.rfq.upsert({
    where: { tenantId_rfqNumber: { tenantId: tenantA.id, rfqNumber: 'RFQ-2026-000003' } },
    update: { status: 'VENDOR_RESPONSE_OPEN' },
    create: {
      tenantId: tenantA.id,
      projectId: project2.id,
      boqRevisionId: rev2R1.id,
      rfqNumber: 'RFQ-2026-000003',
      title: 'RFQ for Electrical Cabling & LED Lighting Package',
      packageType: 'CATEGORY',
      packageName: 'Electrical Package',
      status: 'VENDOR_RESPONSE_OPEN',
      submissionDeadline: new Date(Date.now() + 5 * 86400000),
      commercialValidityDays: 60,
      estimatedBenchmarkValue: 920000,
      totalLines: 2,
      releasedAt: new Date(Date.now() - 4 * 86400000),
      createdById: userMapA['PROCUREMENT_USER'],
      lines: {
        create: rev2Lines.slice(4, 6).map((l, i) => ({
          tenantId: tenantA.id,
          boqLineId: l.id,
          lineNumber: `L-${i + 1}`,
          description: l.standardDescription || l.originalDescription,
          category: 'Electrical',
          uom: l.uomRaw || 'NOS',
          quantity: l.quantity,
          benchmarkRate: i === 0 ? 95 : 2200,
          benchmarkAmount: i === 0 ? l.quantity * 95 : l.quantity * 2200,
        })),
      },
      invitedVendors: {
        create: [
          { tenantId: tenantA.id, vendorId: vendorMapA['VND-0001'].id, invitationStatus: 'SUBMITTED', submissionStatus: 'SUBMITTED' },
          { tenantId: tenantA.id, vendorId: vendorMapA['VND-0004'].id, invitationStatus: 'SUBMITTED', submissionStatus: 'SUBMITTED' },
        ],
      },
    },
    include: { lines: true },
  });

  // Seed Quotes for RFQ 3
  await prisma.quote.upsert({
    where: { rfqId_vendorId_quoteVersion: { rfqId: rfq3.id, vendorId: vendorMapA['VND-0001'].id, quoteVersion: 1 } },
    update: {},
    create: {
      tenantId: tenantA.id,
      rfqId: rfq3.id,
      vendorId: vendorMapA['VND-0001'].id,
      quoteNumber: 'QTE-2026-000001',
      quoteVersion: 1,
      status: 'SUBMITTED',
      totalBaseAmount: 730000,
      taxAmount: 131400,
      totalQuoteAmount: 861400,
      commercialTerms: 'Free delivery, 30 days payment, warranty 12 months',
      submittedAt: new Date(Date.now() - 1 * 86400000),
      submittedBy: userMapA['PROCUREMENT_USER'],
      lines: {
        create: rfq3.lines.map((rl: any) => ({
          tenantId: tenantA.id,
          rfqLineId: rl.id,
          unitRate: rl.benchmarkRate * 0.94,
          taxPercent: 18.0,
          discountPercent: 0,
          lineTotal: rl.quantity * (rl.benchmarkRate * 0.94) * 1.18,
        })),
      },
    },
  });
  console.log(`  ✓ RFQ 3: VENDOR_RESPONSE_OPEN → ${rfq3.rfqNumber} with submitted quote`);

  // 4. RFQ UNDER COMPARISON (Retail Fixtures Package, Project 2)
  const rfq4 = await prisma.rfq.upsert({
    where: { tenantId_rfqNumber: { tenantId: tenantA.id, rfqNumber: 'RFQ-2026-000004' } },
    update: { status: 'COMPARISON' },
    create: {
      tenantId: tenantA.id,
      projectId: project2.id,
      boqRevisionId: rev2R1.id,
      rfqNumber: 'RFQ-2026-000004',
      title: 'RFQ for Checkout Counters & Display Shelving Package',
      packageType: 'CATEGORY',
      packageName: 'Retail Fixtures Package',
      status: 'COMPARISON',
      estimatedBenchmarkValue: 1450000,
      totalLines: 2,
      releasedAt: new Date(Date.now() - 6 * 86400000),
      createdById: userMapA['PROCUREMENT_USER'],
      lines: {
        create: rev2Lines.slice(6, 8).map((l, i) => ({
          tenantId: tenantA.id,
          boqLineId: l.id,
          lineNumber: `L-${i + 1}`,
          description: l.standardDescription || l.originalDescription,
          category: 'Furniture',
          uom: l.uomRaw || 'NOS',
          quantity: l.quantity,
          benchmarkRate: i === 0 ? 85000 : 38000,
          benchmarkAmount: i === 0 ? l.quantity * 85000 : l.quantity * 38000,
        })),
      },
      invitedVendors: {
        create: [
          { tenantId: tenantA.id, vendorId: vendorMapA['VND-0001'].id, invitationStatus: 'SUBMITTED', submissionStatus: 'SUBMITTED' },
          { tenantId: tenantA.id, vendorId: vendorMapA['VND-0003'].id, invitationStatus: 'SUBMITTED', submissionStatus: 'SUBMITTED' },
        ],
      },
    },
    include: { lines: true },
  });

  // 2 quotes for RFQ 4
  await prisma.quote.upsert({
    where: { rfqId_vendorId_quoteVersion: { rfqId: rfq4.id, vendorId: vendorMapA['VND-0001'].id, quoteVersion: 1 } },
    update: {},
    create: {
      tenantId: tenantA.id,
      rfqId: rfq4.id,
      vendorId: vendorMapA['VND-0001'].id,
      quoteNumber: 'QTE-2026-000002',
      quoteVersion: 1,
      status: 'SUBMITTED',
      totalBaseAmount: 1180000,
      taxAmount: 212400,
      totalQuoteAmount: 1392400,
      submittedAt: new Date(Date.now() - 2 * 86400000),
    },
  });

  await prisma.quote.upsert({
    where: { rfqId_vendorId_quoteVersion: { rfqId: rfq4.id, vendorId: vendorMapA['VND-0003'].id, quoteVersion: 1 } },
    update: {},
    create: {
      tenantId: tenantA.id,
      rfqId: rfq4.id,
      vendorId: vendorMapA['VND-0003'].id,
      quoteNumber: 'QTE-2026-000003',
      quoteVersion: 1,
      status: 'SUBMITTED',
      totalBaseAmount: 1100000,
      taxAmount: 198000,
      totalQuoteAmount: 1298000, // L1
      submittedAt: new Date(Date.now() - 2 * 86400000),
    },
  });
  console.log(`  ✓ RFQ 4: COMPARISON → ${rfq4.rfqNumber} with 2 compared quotes (L1: CraftLine)`);

  // 5. RFQ UNDER NEGOTIATION (Civil & Flooring, Project 2)
  const rfq5 = await prisma.rfq.upsert({
    where: { tenantId_rfqNumber: { tenantId: tenantA.id, rfqNumber: 'RFQ-2026-000005' } },
    update: { status: 'NEGOTIATION' },
    create: {
      tenantId: tenantA.id,
      projectId: project2.id,
      boqRevisionId: rev2R1.id,
      rfqNumber: 'RFQ-2026-000005',
      title: 'RFQ for Vitrified Tile Flooring & Base Works',
      packageType: 'SELECTED_LINES',
      packageName: 'Flooring Package',
      status: 'NEGOTIATION',
      estimatedBenchmarkValue: 980000,
      totalLines: 1,
      releasedAt: new Date(Date.now() - 7 * 86400000),
      createdById: userMapA['PROCUREMENT_USER'],
      lines: {
        create: [
          {
            tenantId: tenantA.id,
            boqLineId: rev2Lines[0]?.id,
            lineNumber: 'L-1',
            description: 'Vitrified Tile Flooring (600x600mm)',
            category: 'Civil & Interior',
            uom: 'SQFT',
            quantity: 11000,
            benchmarkRate: 89,
            benchmarkAmount: 979000,
          },
        ],
      },
      invitedVendors: {
        create: [
          { tenantId: tenantA.id, vendorId: vendorMapA['VND-0001'].id, invitationStatus: 'SUBMITTED', submissionStatus: 'SUBMITTED' },
        ],
      },
    },
  });

  // Initial quote and Negotiation record
  await prisma.quote.upsert({
    where: { rfqId_vendorId_quoteVersion: { rfqId: rfq5.id, vendorId: vendorMapA['VND-0001'].id, quoteVersion: 1 } },
    update: {},
    create: {
      tenantId: tenantA.id,
      rfqId: rfq5.id,
      vendorId: vendorMapA['VND-0001'].id,
      quoteNumber: 'QTE-2026-000004',
      quoteVersion: 1,
      status: 'UNDER_EVALUATION',
      totalBaseAmount: 920000,
      taxAmount: 165600,
      totalQuoteAmount: 1085600,
    },
  });

  const neg5 = await prisma.negotiation.create({
    data: {
      tenantId: tenantA.id,
      rfqId: rfq5.id,
      status: 'ACTIVE',
      currentRound: 2,
      bestQuoteAmount: 890000,
      rounds: {
        create: [
          {
            tenantId: tenantA.id,
            vendorId: vendorMapA['VND-0001'].id,
            roundNumber: 1,
            previousQuoteAmount: 1085600,
            counterOfferAmount: 900000,
            revisedQuoteAmount: 950000,
            savingsAmount: 135600,
            savingsPercent: 12.5,
            status: 'CONCLUDED',
            notes: 'Round 1: Vendor offered 12.5% discount',
          },
          {
            tenantId: tenantA.id,
            vendorId: vendorMapA['VND-0001'].id,
            roundNumber: 2,
            previousQuoteAmount: 950000,
            counterOfferAmount: 880000,
            revisedQuoteAmount: 890000,
            savingsAmount: 60000,
            savingsPercent: 6.3,
            status: 'ROUND_ACTIVE',
            notes: 'Round 2: Agreed on free transport and final ₹ 8.9L price',
          },
        ],
      },
    },
  });
  console.log(`  ✓ RFQ 5: NEGOTIATION → ${rfq5.rfqNumber} with Round 1 & Round 2 logged`);

  // 6. RFQ WITH FINAL LOCKED RATES (Lighting & Power, Project 2)
  const rfq6 = await prisma.rfq.upsert({
    where: { tenantId_rfqNumber: { tenantId: tenantA.id, rfqNumber: 'RFQ-2026-000006' } },
    update: { status: 'FINAL_RATE_LOCKED' },
    create: {
      tenantId: tenantA.id,
      projectId: project2.id,
      boqRevisionId: rev2R1.id,
      rfqNumber: 'RFQ-2026-000006',
      title: 'RFQ for LED Lighting & Fixture Supply',
      packageType: 'CATEGORY',
      packageName: 'Lighting Package',
      status: 'FINAL_RATE_LOCKED',
      estimatedBenchmarkValue: 350000,
      totalLines: 1,
      createdById: userMapA['PROCUREMENT_USER'],
      finalLockedAt: new Date(Date.now() - 1 * 86400000),
      finalLockedById: userMapA['PROCUREMENT_USER'],
      lines: {
        create: [
          {
            tenantId: tenantA.id,
            lineNumber: 'L-1',
            description: 'LED Panel Light (600x600mm, 36W)',
            category: 'Electrical',
            uom: 'NOS',
            quantity: 90,
            benchmarkRate: 3888,
            benchmarkAmount: 350000,
          },
        ],
      },
      invitedVendors: {
        create: [
          { tenantId: tenantA.id, vendorId: vendorMapA['VND-0004'].id, invitationStatus: 'SUBMITTED', submissionStatus: 'SUBMITTED' },
        ],
      },
    },
  });

  await prisma.quote.upsert({
    where: { rfqId_vendorId_quoteVersion: { rfqId: rfq6.id, vendorId: vendorMapA['VND-0004'].id, quoteVersion: 1 } },
    update: {},
    create: {
      tenantId: tenantA.id,
      rfqId: rfq6.id,
      vendorId: vendorMapA['VND-0004'].id,
      quoteNumber: 'QTE-2026-000005',
      quoteVersion: 1,
      status: 'ACCEPTED',
      totalBaseAmount: 255000,
      taxAmount: 45900,
      totalQuoteAmount: 300900, // 14% savings locked
    },
  });
  console.log(`  ✓ RFQ 6: FINAL_RATE_LOCKED → ${rfq6.rfqNumber} (Locked at ₹ 3,00,900)`);

  // 7. AWARD RECOMMENDATION PENDING APPROVAL (Fitout Package, Project 3)
  const rfq7 = await prisma.rfq.upsert({
    where: { tenantId_rfqNumber: { tenantId: tenantA.id, rfqNumber: 'RFQ-2026-000007' } },
    update: { status: 'AWARD_RECOMMENDED' },
    create: {
      tenantId: tenantA.id,
      projectId: project3.id,
      boqRevisionId: rev3R0.id,
      rfqNumber: 'RFQ-2026-000007',
      title: 'RFQ for Flagship Store Commercial Fit-Out Package',
      packageType: 'ENTIRE_BOQ',
      packageName: 'Turnkey Fitout Package',
      status: 'AWARD_RECOMMENDED',
      estimatedBenchmarkValue: 2450000,
      totalLines: 3,
      releasedAt: new Date(Date.now() - 10 * 86400000),
      createdById: userMapA['PROCUREMENT_USER'],
      lines: {
        create: rev3Lines.slice(0, 3).map((l, i) => ({
          tenantId: tenantA.id,
          boqLineId: l.id,
          lineNumber: `L-${i + 1}`,
          description: l.standardDescription || l.originalDescription,
          category: 'Civil & Interior',
          uom: l.uomRaw || 'SQFT',
          quantity: l.quantity,
          benchmarkRate: 20,
          benchmarkAmount: l.quantity * 20,
        })),
      },
      invitedVendors: {
        create: [
          { tenantId: tenantA.id, vendorId: vendorMapA['VND-0003'].id, invitationStatus: 'SUBMITTED', submissionStatus: 'SUBMITTED' },
        ],
      },
    },
  });

  const quote7 = await prisma.quote.upsert({
    where: { rfqId_vendorId_quoteVersion: { rfqId: rfq7.id, vendorId: vendorMapA['VND-0003'].id, quoteVersion: 1 } },
    update: {},
    create: {
      tenantId: tenantA.id,
      rfqId: rfq7.id,
      vendorId: vendorMapA['VND-0003'].id,
      quoteNumber: 'QTE-2026-000006',
      quoteVersion: 1,
      status: 'ACCEPTED',
      totalBaseAmount: 1850000,
      taxAmount: 333000,
      totalQuoteAmount: 2183000,
    },
  });

  await prisma.awardRecommendation.create({
    data: {
      tenantId: tenantA.id,
      rfqId: rfq7.id,
      recommendedVendorId: vendorMapA['VND-0003'].id,
      originalQuoteAmount: 2350000,
      finalNegotiatedAmount: 2183000,
      benchmarkAmount: 2450000,
      totalSavingsAmount: 267000,
      savingsPercent: 10.9,
      technicalStatus: 'COMPLIANT',
      commercialStatus: 'BEST_VALUE',
      justification: 'Recommended for award: L1 compliant offer delivering ₹ 2.67L capex savings with 45-day guaranteed completion.',
      status: 'PENDING_APPROVAL',
      submittedById: userMapA['PROCUREMENT_USER'],
    },
  });
  console.log(`  ✓ RFQ 7: AWARD_RECOMMENDED → ${rfq7.rfqNumber} (Pending Finance Approval)`);

  // 8. AWARDED RFQ WITH ISSUED PPO (Project 3)
  const rfq8 = await prisma.rfq.upsert({
    where: { tenantId_rfqNumber: { tenantId: tenantA.id, rfqNumber: 'RFQ-2026-000008' } },
    update: { status: 'AWARDED' },
    create: {
      tenantId: tenantA.id,
      projectId: project3.id,
      boqRevisionId: rev3R0.id,
      rfqNumber: 'RFQ-2026-000008',
      title: 'RFQ for High Bay LED Lights & Power Distribution',
      packageType: 'CATEGORY',
      packageName: 'Electrical High Bay Package',
      status: 'AWARDED',
      estimatedBenchmarkValue: 1650000,
      totalLines: 1,
      createdById: userMapA['PROCUREMENT_USER'],
      lines: {
        create: [
          {
            tenantId: tenantA.id,
            lineNumber: 'L-1',
            description: 'High Bay LED Lights (100W IP65)',
            category: 'Electrical',
            uom: 'NOS',
            quantity: 180,
            benchmarkRate: 9166,
            benchmarkAmount: 1650000,
          },
        ],
      },
      invitedVendors: {
        create: [
          { tenantId: tenantA.id, vendorId: vendorMapA['VND-0004'].id, invitationStatus: 'SUBMITTED', submissionStatus: 'SUBMITTED' },
        ],
      },
    },
  });

  const ppo8 = await prisma.ppo.upsert({
    where: { tenantId_ppoNumber: { tenantId: tenantA.id, ppoNumber: 'PPO-2026-000001' } },
    update: {},
    create: {
      tenantId: tenantA.id,
      projectId: project3.id,
      rfqId: rfq8.id,
      vendorId: vendorMapA['VND-0004'].id,
      ppoNumber: 'PPO-2026-000001',
      title: 'Purchase Order for High Bay LED Lights',
      totalValue: 1480000,
      currency: 'INR',
      status: 'ISSUED',
      deliveryTerms: 'Ex-site delivery within 21 days',
      paymentTerms: '30 days net from progressive inspection',
      taxDetails: 'GST 18% included',
      issuedAt: new Date(Date.now() - 1 * 86400000),
      createdById: userMapA['PROCUREMENT_USER'],
    },
  });

  const rfq8Lines = await prisma.rfqLine.findMany({ where: { rfqId: rfq8.id } });
  await prisma.ppoLine.deleteMany({ where: { ppoId: ppo8.id } });
  await prisma.ppoLine.create({
    data: {
      tenantId: tenantA.id,
      ppoId: ppo8.id,
      projectId: project3.id,
      rfqLineId: rfq8Lines[0]?.id,
      vendorId: vendorMapA['VND-0004'].id,
      lineNumber: 'L-1',
      itemDescription: 'High Bay LED Lights (100W IP65)',
      category: 'Electrical',
      uom: 'NOS',
      orderedQuantity: 180,
      orderedUnitRate: 8222.22,
      orderedAmount: 1480000,
      totalOrderValue: 1480000,
      status: 'OPEN',
    },
  });
  console.log(`  ✓ RFQ 8: AWARDED with PPO → ${ppo8.ppoNumber} (₹ 14,80,000)`);

  // Seed sample Reverse Auction on RFQ 3
  const auc1 = await prisma.auction.upsert({
    where: { tenantId_auctionNumber: { tenantId: tenantA.id, auctionNumber: 'AUC-2026-000001' } },
    update: {},
    create: {
      tenantId: tenantA.id,
      rfqId: rfq3.id,
      auctionNumber: 'AUC-2026-000001',
      auctionType: 'REVERSE_AUCTION',
      title: 'Reverse E-Auction for Electrical Cabling & Accessories',
      startingPrice: 920000,
      minDecrement: 5000,
      currentLowestBid: 855000,
      startTime: new Date(Date.now() - 3600000),
      endTime: new Date(Date.now() + 3600000),
      status: 'LIVE',
      bidVisibility: 'RANK_ONLY',
      bids: {
        create: [
          { tenantId: tenantA.id, vendorId: vendorMapA['VND-0001'].id, bidNumber: 1, bidAmount: 910000, rank: 2, timestamp: new Date(Date.now() - 2500000) },
          { tenantId: tenantA.id, vendorId: vendorMapA['VND-0004'].id, bidNumber: 2, bidAmount: 885000, rank: 1, timestamp: new Date(Date.now() - 1800000) },
          { tenantId: tenantA.id, vendorId: vendorMapA['VND-0001'].id, bidNumber: 3, bidAmount: 855000, rank: 1, timestamp: new Date(Date.now() - 600000) },
        ],
      },
    },
  });
  console.log(`  ✓ Reverse Auction seeded: ${auc1.auctionNumber} (Live with 3 bids)`);

  // ============================================================
  // 9. AUDIT LOGS FOR PROCUREMENT ACTIONS
  // ============================================================
  console.log('\n🔍 Seeding Procurement Audit Log Entries...');
  const procurementAudits = [
    {
      tenantId: tenantA.id,
      userId: userMapA['PROCUREMENT_USER'],
      projectId: project2.id,
      entityType: 'RFQ',
      entityId: rfq1.id,
      action: 'RFQ_CREATED',
      description: 'Draft RFQ RFQ-2026-000001 created from Approved BOQ Revision R1 (Civil & Interior)',
    },
    {
      tenantId: tenantA.id,
      userId: userMapA['PROCUREMENT_USER'],
      projectId: project2.id,
      entityType: 'RFQ',
      entityId: rfq2.id,
      action: 'RFQ_RELEASED',
      description: 'RFQ RFQ-2026-000002 released to 2 invited MEP vendors',
    },
    {
      tenantId: tenantA.id,
      userId: userMapA['PROCUREMENT_USER'],
      projectId: project2.id,
      entityType: 'QUOTE',
      entityId: rfq3.id,
      action: 'QUOTE_SUBMITTED',
      description: 'Vendor quote QTE-2026-000001 submitted by Apex Infrastructure for RFQ-2026-000003',
    },
    {
      tenantId: tenantA.id,
      userId: userMapA['PROCUREMENT_USER'],
      projectId: project2.id,
      entityType: 'RFQ',
      entityId: rfq4.id,
      action: 'QUOTE_COMPARED',
      description: 'Commercial quote comparison matrix calculated for RFQ-2026-000004 (2 quotes, L1: CraftLine)',
    },
    {
      tenantId: tenantA.id,
      userId: userMapA['PROCUREMENT_USER'],
      projectId: project2.id,
      entityType: 'NEGOTIATION',
      entityId: neg5.id,
      action: 'NEGOTIATION_ROUND_CREATED',
      description: 'Negotiation Round 2 concluded for RFQ-2026-000005 with Apex Infrastructure at ₹ 8,90,000',
    },
    {
      tenantId: tenantA.id,
      userId: userMapA['PROCUREMENT_USER'],
      projectId: project2.id,
      entityType: 'RFQ',
      entityId: rfq6.id,
      action: 'FINAL_RATE_LOCKED',
      description: 'Final rates locked for RFQ-2026-000006 with Zenith Retail at ₹ 3,00,900 (Savings: 14%)',
    },
    {
      tenantId: tenantA.id,
      userId: userMapA['PROCUREMENT_USER'],
      projectId: project3.id,
      entityType: 'AWARD',
      entityId: rfq7.id,
      action: 'AWARD_RECOMMENDED',
      description: 'Award recommended for CraftLine Interior on RFQ-2026-000007 (Value: ₹ 21.83L, Savings: 10.9%)',
    },
    {
      tenantId: tenantA.id,
      userId: userMapA['PROCUREMENT_USER'],
      projectId: project3.id,
      entityType: 'PPO',
      entityId: ppo8.id,
      action: 'PPO_CREATED',
      description: 'PPO-2026-000001 issued to Zenith Retail Systems for ₹ 14,80,000',
    },
  ];

  for (const pa of procurementAudits) {
    await prisma.auditLog.create({ data: pa });
  }
  console.log(`  ✓ ${procurementAudits.length} procurement audit events registered`);

  // ============================================================
  // 10. BUDGET → PR → RFQ → PPO → ACTUAL TRACEABILITY SEEDING (PROJECT 1)
  // ============================================================
  console.log('\n📊 Seeding Full Relational Lineage: Budget → PR → RFQ → PPO → Actual Cost...');

  // 10.1 Add Section 12 MCCB & Cladding Overrun Line to rev1R0
  const mccbLine = await prisma.boqLine.create({
    data: {
      tenantId: tenantA.id,
      boqRevisionId: rev1R0.id,
      lineNumber: '2.03',
      originalDescription: '63A 4P MCCB Panel Mount',
      standardDescription: '63A 4P MCCB',
      aiSuggestedDescription: '63A 4P MCCB',
      aiReason: 'Standardized DB component specification',
      aiConfidence: 0.96,
      aiUnitCost: 8000,
      aiTotalCost: 80000,
      costConfidence: 0.95,
      costSource: 'Standard Catalogue',
      costMethod: 'WEIGHTED_MEDIAN',
      categoryId: catMapA['Electrical'],
      subcategoryId: catMapA['DB Panel'] || catMapA['Switches'],
      uomId: uomMapA['NOS'],
      uomRaw: 'NOS',
      quantity: 10,
      validationStatus: 'VALID',
      benchmarkEligible: true,
    },
  });

  const claddingLine = await prisma.boqLine.create({
    data: {
      tenantId: tenantA.id,
      boqRevisionId: rev1R0.id,
      lineNumber: '1.02',
      originalDescription: 'Acoustic Fabric Cladding 25mm',
      standardDescription: 'Acoustic Wall Cladding Panels',
      aiSuggestedDescription: 'Acoustic Wall Cladding Panels',
      aiReason: 'Architectural wall treatment standard catalog',
      aiConfidence: 0.91,
      aiUnitCost: 300,
      aiTotalCost: 150000,
      costConfidence: 0.90,
      costSource: 'Vendor Benchmark',
      costMethod: 'WEIGHTED_MEDIAN',
      categoryId: catMapA['Civil & Interior'],
      subcategoryId: catMapA['Gypsum Partition'] || catMapA['Flooring'],
      uomId: uomMapA['SQFT'],
      uomRaw: 'SQFT',
      quantity: 500,
      validationStatus: 'VALID',
      benchmarkEligible: true,
    },
  });

  // Add Budget Transactions for these lines
  await prisma.budgetTransaction.createMany({
    data: [
      {
        tenantId: tenantA.id,
        transactionCode: 'BTX-000004',
        projectId: project1.id,
        costCentreId: ccMapA['CC-001'].id,
        boqId: boq1.id,
        boqRevisionId: rev1R0.id,
        boqLineId: mccbLine.id,
        contributionId: budgetContrib1.id,
        category: 'Electrical',
        subcategory: 'DB Panel',
        uom: 'NOS',
        amount: 80000,
        quantity: 10,
        rate: 8000,
        status: 'APPROVED',
        reference: 'BOQ-000001 R0 Line 2.03',
        createdBy: userMapA['PROJECT_USER'],
      },
      {
        tenantId: tenantA.id,
        transactionCode: 'BTX-000005',
        projectId: project1.id,
        costCentreId: ccMapA['CC-001'].id,
        boqId: boq1.id,
        boqRevisionId: rev1R0.id,
        boqLineId: claddingLine.id,
        contributionId: budgetContrib1.id,
        category: 'Civil & Interior',
        subcategory: 'Gypsum Partition',
        uom: 'SQFT',
        amount: 150000,
        quantity: 500,
        rate: 300,
        status: 'APPROVED',
        reference: 'BOQ-000001 R0 Line 1.02',
        createdBy: userMapA['PROJECT_USER'],
      },
    ],
  });

  await prisma.budgetContribution.update({
    where: { id: budgetContrib1.id },
    data: {
      totalEstimatedValue: 4580000,
      acceptedEstimatedValue: 4580000,
    },
  });

  // 10.2 Create Procurement Request (PR) referencing BOQ lines
  const prProject1 = await prisma.procurementRequest.upsert({
    where: { tenantId_prNumber: { tenantId: tenantA.id, prNumber: 'PR-2026-000001' } },
    update: {},
    create: {
      tenantId: tenantA.id,
      prNumber: 'PR-2026-000001',
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      boqId: boq1.id,
      boqRevisionId: rev1R0.id,
      title: 'PR for Retail Store Fitout - Civil & Electrical Packages',
      status: 'PR_RELEASED_TO_PROCUREMENT',
      requestedBy: userMapA['PROJECT_USER'],
      totalEstimatedValue: 2730000,
      totalLines: 4,
      projectApprovedAt: new Date(Date.now() - 2 * 86400000),
      projectApprovedBy: userMapA['PROJECT_APPROVER'],
      releasedAt: new Date(Date.now() - 2 * 86400000),
      releasedBy: userMapA['PROJECT_APPROVER'],
    },
  });

  await prisma.pRLine.deleteMany({ where: { prId: prProject1.id } });

  // PR Line 1: Floor Tile Split Part 1 (8,000 sqft)
  const prLineFloor1 = await prisma.pRLine.create({
    data: {
      tenantId: tenantA.id,
      prId: prProject1.id,
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      boqId: boq1.id,
      boqRevisionId: rev1R0.id,
      boqLineId: createdR0Lines[0].id,
      lineNumber: 'PR-L1',
      itemDescription: createdR0Lines[0].standardDescription,
      category: 'Civil & Interior',
      subcategory: 'Flooring',
      uom: 'SQFT',
      quantity: 8000,
      estimatedRate: 125,
      estimatedValue: 1000000,
    },
  });

  // PR Line 2: Floor Tile Split Part 2 (12,000 sqft)
  const prLineFloor2 = await prisma.pRLine.create({
    data: {
      tenantId: tenantA.id,
      prId: prProject1.id,
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      boqId: boq1.id,
      boqRevisionId: rev1R0.id,
      boqLineId: createdR0Lines[0].id,
      lineNumber: 'PR-L2',
      itemDescription: createdR0Lines[0].standardDescription,
      category: 'Civil & Interior',
      subcategory: 'Flooring',
      uom: 'SQFT',
      quantity: 12000,
      estimatedRate: 125,
      estimatedValue: 1500000,
    },
  });

  // PR Line 3: 63A 4P MCCB (10 Nos)
  const prLineMccb = await prisma.pRLine.create({
    data: {
      tenantId: tenantA.id,
      prId: prProject1.id,
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      boqId: boq1.id,
      boqRevisionId: rev1R0.id,
      boqLineId: mccbLine.id,
      lineNumber: 'PR-L3',
      itemDescription: mccbLine.standardDescription,
      category: 'Electrical',
      subcategory: 'DB Panel',
      uom: 'NOS',
      quantity: 10,
      estimatedRate: 8000,
      estimatedValue: 80000,
    },
  });

  // PR Line 4: Acoustic Wall Cladding (500 sqft)
  const prLineCladding = await prisma.pRLine.create({
    data: {
      tenantId: tenantA.id,
      prId: prProject1.id,
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      boqId: boq1.id,
      boqRevisionId: rev1R0.id,
      boqLineId: claddingLine.id,
      lineNumber: 'PR-L4',
      itemDescription: claddingLine.standardDescription,
      category: 'Civil & Interior',
      subcategory: 'Gypsum Partition',
      uom: 'SQFT',
      quantity: 500,
      estimatedRate: 300,
      estimatedValue: 150000,
    },
  });

  // 10.3 Create RFQ Lines retaining PR Line & BOQ Line IDs
  const rfqFitout = await prisma.rfq.upsert({
    where: { tenantId_rfqNumber: { tenantId: tenantA.id, rfqNumber: 'RFQ-2026-000009' } },
    update: {},
    create: {
      tenantId: tenantA.id,
      projectId: project1.id,
      prId: prProject1.id,
      boqRevisionId: rev1R0.id,
      rfqNumber: 'RFQ-2026-000009',
      title: 'RFQ for Fitout Flooring & Electrical Packages',
      status: 'AWARDED',
      packageType: 'CATEGORY',
      packageName: 'Store Fitout Master RFQ',
      totalLines: 4,
      createdById: userMapA['PROCUREMENT_USER'],
    },
  });

  await prisma.rfqLine.deleteMany({ where: { rfqId: rfqFitout.id } });

  const rfqLineFloor1 = await prisma.rfqLine.create({
    data: {
      tenantId: tenantA.id,
      rfqId: rfqFitout.id,
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      boqId: boq1.id,
      boqRevisionId: rev1R0.id,
      boqLineId: createdR0Lines[0].id,
      prLineId: prLineFloor1.id,
      lineNumber: 'RFQ-L1',
      description: prLineFloor1.itemDescription,
      category: 'Civil & Interior',
      subcategory: 'Flooring',
      uom: 'SQFT',
      quantity: 8000,
      benchmarkRate: 125,
      benchmarkAmount: 1000000,
    },
  });

  const rfqLineFloor2 = await prisma.rfqLine.create({
    data: {
      tenantId: tenantA.id,
      rfqId: rfqFitout.id,
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      boqId: boq1.id,
      boqRevisionId: rev1R0.id,
      boqLineId: createdR0Lines[0].id,
      prLineId: prLineFloor2.id,
      lineNumber: 'RFQ-L2',
      description: prLineFloor2.itemDescription,
      category: 'Civil & Interior',
      subcategory: 'Flooring',
      uom: 'SQFT',
      quantity: 12000,
      benchmarkRate: 125,
      benchmarkAmount: 1500000,
    },
  });

  const rfqLineMccb = await prisma.rfqLine.create({
    data: {
      tenantId: tenantA.id,
      rfqId: rfqFitout.id,
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      boqId: boq1.id,
      boqRevisionId: rev1R0.id,
      boqLineId: mccbLine.id,
      prLineId: prLineMccb.id,
      lineNumber: 'RFQ-L3',
      description: prLineMccb.itemDescription,
      category: 'Electrical',
      subcategory: 'DB Panel',
      uom: 'NOS',
      quantity: 10,
      benchmarkRate: 8000,
      benchmarkAmount: 80000,
    },
  });

  const rfqLineCladding = await prisma.rfqLine.create({
    data: {
      tenantId: tenantA.id,
      rfqId: rfqFitout.id,
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      boqId: boq1.id,
      boqRevisionId: rev1R0.id,
      boqLineId: claddingLine.id,
      prLineId: prLineCladding.id,
      lineNumber: 'RFQ-L4',
      description: prLineCladding.itemDescription,
      category: 'Civil & Interior',
      subcategory: 'Gypsum Partition',
      uom: 'SQFT',
      quantity: 500,
      benchmarkRate: 300,
      benchmarkAmount: 150000,
    },
  });

  // 10.4 Create Multiple POs / PPOs against the BOQ lines
  // PO-001 (PPO-2026-000002): Vendor Apex, 8,000 sqft Flooring @ ₹120 = ₹9,60,000
  const po1 = await prisma.ppo.upsert({
    where: { tenantId_ppoNumber: { tenantId: tenantA.id, ppoNumber: 'PPO-2026-000002' } },
    update: {},
    create: {
      tenantId: tenantA.id,
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      rfqId: rfqFitout.id,
      vendorId: vendorMapA['VND-0001'].id,
      ppoNumber: 'PPO-2026-000002',
      title: 'PO for Store Flooring Phase-1 (Apex)',
      totalValue: 960000,
      currency: 'INR',
      status: 'ISSUED',
      createdById: userMapA['PROCUREMENT_USER'],
    },
  });

  await prisma.ppoLine.deleteMany({ where: { ppoId: po1.id } });
  const po1Line = await prisma.ppoLine.create({
    data: {
      tenantId: tenantA.id,
      ppoId: po1.id,
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      boqId: boq1.id,
      boqRevisionId: rev1R0.id,
      boqLineId: createdR0Lines[0].id,
      prLineId: prLineFloor1.id,
      rfqLineId: rfqLineFloor1.id,
      vendorId: vendorMapA['VND-0001'].id,
      lineNumber: 'POL-1',
      itemDescription: prLineFloor1.itemDescription,
      category: 'Civil & Interior',
      subcategory: 'Flooring',
      uom: 'SQFT',
      orderedQuantity: 8000,
      orderedUnitRate: 120,
      orderedAmount: 960000,
      totalOrderValue: 960000,
      completedQuantity: 4800, // 60% partial completion
      completedAmount: 576000,
      status: 'PARTIALLY_COMPLETED',
    },
  });

  // PO-002 (PPO-2026-000003): Vendor CraftLine, 12,000 sqft Flooring @ ₹118 = ₹14,16,000
  // (SECOND PO MAPPED TO THE SAME BOQ LINE!)
  const po2 = await prisma.ppo.upsert({
    where: { tenantId_ppoNumber: { tenantId: tenantA.id, ppoNumber: 'PPO-2026-000003' } },
    update: {},
    create: {
      tenantId: tenantA.id,
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      rfqId: rfqFitout.id,
      vendorId: vendorMapA['VND-0002'].id,
      ppoNumber: 'PPO-2026-000003',
      title: 'PO for Store Flooring Phase-2 (CraftLine)',
      totalValue: 1416000,
      currency: 'INR',
      status: 'ISSUED',
      createdById: userMapA['PROCUREMENT_USER'],
    },
  });

  await prisma.ppoLine.deleteMany({ where: { ppoId: po2.id } });
  const po2Line = await prisma.ppoLine.create({
    data: {
      tenantId: tenantA.id,
      ppoId: po2.id,
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      boqId: boq1.id,
      boqRevisionId: rev1R0.id,
      boqLineId: createdR0Lines[0].id, // Same BOQ Line!
      prLineId: prLineFloor2.id,
      rfqLineId: rfqLineFloor2.id,
      vendorId: vendorMapA['VND-0002'].id,
      lineNumber: 'POL-1',
      itemDescription: prLineFloor2.itemDescription,
      category: 'Civil & Interior',
      subcategory: 'Flooring',
      uom: 'SQFT',
      orderedQuantity: 12000,
      orderedUnitRate: 118,
      orderedAmount: 1416000,
      totalOrderValue: 1416000,
      completedQuantity: 12000, // 100% completion
      completedAmount: 1380000,
      status: 'COMPLETED',
    },
  });

  // PO-003 (PPO-2026-000004): 63A 4P MCCB (Prompt Section 12 Line Example)
  // Ordered Qty: 10, PO Rate: ₹7,500, Committed: ₹75,000
  const po3 = await prisma.ppo.upsert({
    where: { tenantId_ppoNumber: { tenantId: tenantA.id, ppoNumber: 'PPO-2026-000004' } },
    update: {},
    create: {
      tenantId: tenantA.id,
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      rfqId: rfqFitout.id,
      vendorId: vendorMapA['VND-0004'].id,
      ppoNumber: 'PPO-2026-000004',
      title: 'PO for 63A 4P MCCB Panel (Zenith)',
      totalValue: 75000,
      currency: 'INR',
      status: 'ISSUED',
      createdById: userMapA['PROCUREMENT_USER'],
    },
  });

  await prisma.ppoLine.deleteMany({ where: { ppoId: po3.id } });
  const po3Line = await prisma.ppoLine.create({
    data: {
      tenantId: tenantA.id,
      ppoId: po3.id,
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      boqId: boq1.id,
      boqRevisionId: rev1R0.id,
      boqLineId: mccbLine.id,
      prLineId: prLineMccb.id,
      rfqLineId: rfqLineMccb.id,
      vendorId: vendorMapA['VND-0004'].id,
      lineNumber: 'POL-1',
      itemDescription: prLineMccb.itemDescription,
      category: 'Electrical',
      subcategory: 'DB Panel',
      uom: 'NOS',
      orderedQuantity: 10,
      orderedUnitRate: 7500,
      orderedAmount: 75000,
      totalOrderValue: 75000,
      completedQuantity: 10,
      completedAmount: 74000,
      status: 'COMPLETED',
    },
  });

  // PO-004 (PPO-2026-000005): Acoustic Wall Cladding (Overrun Example)
  // Ordered Qty: 500, PO Rate: ₹320, Committed: ₹1,60,000
  const po4 = await prisma.ppo.upsert({
    where: { tenantId_ppoNumber: { tenantId: tenantA.id, ppoNumber: 'PPO-2026-000005' } },
    update: {},
    create: {
      tenantId: tenantA.id,
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      rfqId: rfqFitout.id,
      vendorId: vendorMapA['VND-0003'].id,
      ppoNumber: 'PPO-2026-000005',
      title: 'PO for Acoustic Wall Cladding (Sterling)',
      totalValue: 160000,
      currency: 'INR',
      status: 'ISSUED',
      createdById: userMapA['PROCUREMENT_USER'],
    },
  });

  await prisma.ppoLine.deleteMany({ where: { ppoId: po4.id } });
  const po4Line = await prisma.ppoLine.create({
    data: {
      tenantId: tenantA.id,
      ppoId: po4.id,
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      boqId: boq1.id,
      boqRevisionId: rev1R0.id,
      boqLineId: claddingLine.id,
      prLineId: prLineCladding.id,
      rfqLineId: rfqLineCladding.id,
      vendorId: vendorMapA['VND-0003'].id,
      lineNumber: 'POL-1',
      itemDescription: prLineCladding.itemDescription,
      category: 'Civil & Interior',
      subcategory: 'Gypsum Partition',
      uom: 'SQFT',
      orderedQuantity: 500,
      orderedUnitRate: 320,
      orderedAmount: 160000,
      totalOrderValue: 160000,
      completedQuantity: 500,
      completedAmount: 165000,
      status: 'COMPLETED',
    },
  });

  // 10.5 Create Actual Cost Transactions
  // Transaction 1: Partial execution on PO-001 (60% = 4,800 sqft @ ₹120 = ₹5,76,000)
  await prisma.actualCostTransaction.deleteMany({ where: { projectId: project1.id } });

  await prisma.actualCostTransaction.create({
    data: {
      tenantId: tenantA.id,
      transactionCode: 'ACT-2026-000001',
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      category: 'Civil & Interior',
      subcategory: 'Flooring',
      boqId: boq1.id,
      boqRevisionId: rev1R0.id,
      boqLineId: createdR0Lines[0].id,
      prId: prProject1.id,
      prLineId: prLineFloor1.id,
      rfqId: rfqFitout.id,
      rfqLineId: rfqLineFloor1.id,
      ppoId: po1.id,
      ppoLineId: po1Line.id,
      vendorId: vendorMapA['VND-0001'].id,
      uom: 'SQFT',
      actualQuantity: 4800,
      actualUnitRate: 120,
      actualAmount: 576000,
      totalActualAmount: 576000,
      source: 'PO_COMPLETION',
      status: 'APPROVED',
      completionReference: 'PROGRESS-CERT-01',
      remarks: '60% flooring milestone completed and inspected on site.',
      createdBy: userMapA['PROCUREMENT_USER'],
    },
  });

  // Transaction 2: Full execution on PO-002 (12,000 sqft @ ₹115 negotiated site discount = ₹13,80,000)
  await prisma.actualCostTransaction.create({
    data: {
      tenantId: tenantA.id,
      transactionCode: 'ACT-2026-000002',
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      category: 'Civil & Interior',
      subcategory: 'Flooring',
      boqId: boq1.id,
      boqRevisionId: rev1R0.id,
      boqLineId: createdR0Lines[0].id, // Same BOQ line!
      prId: prProject1.id,
      prLineId: prLineFloor2.id,
      rfqId: rfqFitout.id,
      rfqLineId: rfqLineFloor2.id,
      ppoId: po2.id,
      ppoLineId: po2Line.id,
      vendorId: vendorMapA['VND-0002'].id,
      uom: 'SQFT',
      actualQuantity: 12000,
      actualUnitRate: 115,
      actualAmount: 1380000,
      totalActualAmount: 1380000,
      source: 'INVOICE',
      status: 'APPROVED',
      completionReference: 'INV-2026-8812',
      remarks: 'Final tax invoice cleared against GRN-2026-09.',
      createdBy: userMapA['FINANCE_USER'],
    },
  });

  // Transaction 3: 63A 4P MCCB (Prompt Section 12 Example)
  // Actual Qty: 10, Actual Rate: ₹7,400, Actual Amount: ₹74,000
  // Budget ₹80,000, Committed ₹75,000, Actual ₹74,000 -> Saving vs Budget ₹6,000 (7.5%)
  await prisma.actualCostTransaction.create({
    data: {
      tenantId: tenantA.id,
      transactionCode: 'ACT-2026-000003',
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      category: 'Electrical',
      subcategory: 'DB Panel',
      boqId: boq1.id,
      boqRevisionId: rev1R0.id,
      boqLineId: mccbLine.id,
      prId: prProject1.id,
      prLineId: prLineMccb.id,
      rfqId: rfqFitout.id,
      rfqLineId: rfqLineMccb.id,
      ppoId: po3.id,
      ppoLineId: po3Line.id,
      vendorId: vendorMapA['VND-0004'].id,
      uom: 'NOS',
      actualQuantity: 10,
      actualUnitRate: 7400,
      actualAmount: 74000,
      totalActualAmount: 74000,
      source: 'PO_COMPLETION',
      status: 'APPROVED',
      completionReference: 'GRN-2026-104',
      remarks: 'Prompt Section 12 reference MCCB delivery and installation signoff.',
      createdBy: userMapA['PROCUREMENT_USER'],
    },
  });

  // Transaction 4: Acoustic Cladding Overrun Item
  // Budget ₹1,50,000, Committed ₹1,60,000, Actual ₹1,65,000 -> Over Budget by ₹15,000
  await prisma.actualCostTransaction.create({
    data: {
      tenantId: tenantA.id,
      transactionCode: 'ACT-2026-000004',
      projectId: project1.id,
      costCentreId: ccMapA['CC-001'].id,
      category: 'Civil & Interior',
      subcategory: 'Gypsum Partition',
      boqId: boq1.id,
      boqRevisionId: rev1R0.id,
      boqLineId: claddingLine.id,
      prId: prProject1.id,
      prLineId: prLineCladding.id,
      rfqId: rfqFitout.id,
      rfqLineId: rfqLineCladding.id,
      ppoId: po4.id,
      ppoLineId: po4Line.id,
      vendorId: vendorMapA['VND-0003'].id,
      uom: 'SQFT',
      actualQuantity: 500,
      actualUnitRate: 330,
      actualAmount: 165000,
      totalActualAmount: 165000,
      source: 'GRN',
      status: 'APPROVED',
      completionReference: 'GRN-2026-140',
      remarks: 'Overrun due to unexpected acoustic sub-wall dampening treatment.',
      createdBy: userMapA['PROCUREMENT_USER'],
    },
  });

  console.log(`  ✓ Relational lineage established:`);
  console.log(`    - 4 PR Lines linked to BOQ Lines`);
  console.log(`    - 4 RFQ Lines linked to PR & BOQ Lines`);
  console.log(`    - 4 POs / PPO Lines linked to RFQ, PR & BOQ Lines (including 2 POs on single Floor Tile BOQ line)`);
  console.log(`    - 4 Actual Cost Transactions (including Partial Execution 60% and Prompt Section 12 MCCB Saving)`);
  const uploadDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const sampleRows = [
    { 'Line No': '1', 'Item Description': 'AC 2 Ton', 'UOM': 'nos', 'Quantity': 12, 'Category': 'HVAC', 'Specification': 'Inverter 5 Star' },
    { 'Line No': '2', 'Item Description': '2 Ton AC', 'UOM': 'Nos.', 'Quantity': 8, 'Category': 'HVAC', 'Specification': 'Split AC Unit' },
    { 'Line No': '3', 'Item Description': '2T Split AC', 'UOM': 'Number', 'Quantity': 4, 'Category': 'HVAC', 'Specification': 'Wall Mounted' },
    { 'Line No': '4', 'Item Description': 'Vitrified Tile Flooring 600x600', 'UOM': 'Sqft', 'Quantity': 18000, 'Category': 'Civil & Interior', 'Specification': 'Anti-skid matte finish' },
    { 'Line No': '5', 'Item Description': 'False Ceiling Gypsum Board', 'UOM': 'Sqft', 'Quantity': 15000, 'Category': 'Civil & Interior', 'Specification': '12.5mm Saint-Gobain' },
    { 'Line No': '6', 'Item Description': 'Electrical Cable 2.5 SQMM', 'UOM': 'MTR', 'Quantity': 8000, 'Category': 'Electrical', 'Specification': 'FRLS Copper' },
    { 'Line No': '7', 'Item Description': 'LED Panel Light 600x600', 'UOM': 'Each', 'Quantity': 150, 'Category': 'Electrical', 'Specification': '36W Cool White' },
    { 'Line No': '8', 'Item Description': 'Fire Extinguisher ABC 5Kg', 'UOM': 'NOS', 'Quantity': 16, 'Category': 'Fire Fighting', 'Specification': 'Stored pressure type' },
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sampleRows);
  XLSX.utils.book_append_sheet(wb, ws, 'BOQ_Main_Sheet');
  const sampleFilePath = path.join(uploadDir, 'sample_boq_upload.xlsx');
  XLSX.writeFile(wb, sampleFilePath);
  console.log(`  ✓ Sample test spreadsheet generated at: ${sampleFilePath}`);

  console.log('\n============================================================');
  console.log('🎉 PHASE-1 DEMO DATABASE SEEDED SUCCESSFULLY!');
  console.log('============================================================');
}

main()
  .catch(e => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
