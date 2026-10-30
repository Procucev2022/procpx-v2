import zlib from 'node:zlib';
import fs from 'fs';
import { createWorker } from 'tesseract.js';
import {
  extractTextFromPdf,
  parseArchitecturalScheduleText,
  parseDrawingWithAiVision,
  parseOcrTextToDrawingItems,
  processDrawingFile,
} from '../src/lib/drawing-parser';

jest.mock('tesseract.js', () => ({ createWorker: jest.fn() }));

const createWorkerMock = createWorker as jest.Mock;

describe('extractTextFromPdf', () => {
  it('extracts Tj strings, escaped delimiters, and TJ arrays from uncompressed streams', () => {
    const pdf = Buffer.from([
      '%PDF-1.4',
      '<< /Length 100 >> stream',
      '(Wall tile) Tj (Door \\\\ panel) Tj [ (Panel ) 12 (light) ] TJ',
      'endstream',
      '%%EOF',
    ].join('\n'));

    expect(extractTextFromPdf(pdf)).toEqual(['Wall tile', 'Door \\ panel', 'Panel light']);
  });

  it('inflates compressed PDF streams and supports raw deflate data', () => {
    const makePdf = (compressed: Buffer) => Buffer.concat([
      Buffer.from('<< /Filter /FlateDecode >> stream\n'),
      compressed,
      Buffer.from('\nendstream'),
    ]);

    expect(extractTextFromPdf(makePdf(zlib.deflateSync(Buffer.from('(Compressed text) Tj'))))).toEqual(['Compressed text']);
    expect(extractTextFromPdf(makePdf(zlib.deflateRawSync(Buffer.from('(Raw compressed text) Tj'))))).toEqual(['Raw compressed text']);
  });

  it('uses literal-string fallback when no usable stream exists', () => {
    expect(extractTextFromPdf(Buffer.from('%PDF (Fallback title) Tj'))).toEqual(['Fallback title']);
    expect(extractTextFromPdf(Buffer.from('%PDF with no text'))).toEqual([]);
    expect(extractTextFromPdf(Buffer.from('stream\nunterminated'))).toEqual([]);
  });

  it('handles CRLF stream boundaries and malformed Flate streams without throwing', () => {
    expect(extractTextFromPdf(Buffer.from('<< >> stream\r\n(CRLF title) Tj\rendstream'))).toEqual(['CRLF title']);
    expect(extractTextFromPdf(Buffer.from('<< /FlateDecode >> stream\n(Not compressed) Tj\nendstream')))
      .toEqual(['Not compressed']);
  });
});

describe('parseArchitecturalScheduleText', () => {
  it('skips headings and parses marked rows with drawing references and uncertain quantities', () => {
    const result = parseArchitecturalScheduleText([
      'Drawing Ref: KND-A-104',
      'ARCHITECTURAL DRAWING',
      'SCHEDULE OF FINISHES',
      'ITEM DESCRIPTION QTY',
      'Drawing No: KND-A-104',
      '---',
      'A1-01 | LED panel light | 36W | Sales floor | NOS | 8',
      '2. | Wall tile | Vitrified 600x600 | Lobby | SQFT | pending',
      'Door installation | Fire rated | Lobby | 3 EA',
      'Paint finish | Acrylic emulsion | TBD',
    ]);

    expect(result).toMatchObject({ success: true, parserUsed: 'NATIVE_PDF_SCHEDULE', drawingReference: 'KND-A-104', totalDetected: 4 });
    expect(result.explicitCount).toBe(2);
    expect(result.uncertainCount).toBe(2);
    expect(result.items[0]).toMatchObject({ lineNumber: '1', mark: 'A1-01', category: 'Electrical', uom: 'NOS', quantity: 8 });
    expect(result.items[1]).toMatchObject({ mark: '2', category: 'Civil & Interior', uom: 'SQFT', quantity: null, quantityType: 'UNCERTAIN' });
    expect(result.items[2]).toMatchObject({ category: 'Civil & Interior', uom: 'EA', quantity: 3 });
    expect(result.warnings).toHaveLength(2);
  });

  it('classifies all supported disciplines and resolves known unit labels', () => {
    const rows = [
      ['floor tile', 'Civil & Interior', 'SQFT'],
      ['electrical cable', 'Electrical', 'MTR'],
      ['split AC unit', 'HVAC', 'NOS'],
      ['CPVC plumbing pipe', 'Plumbing', 'RFT'],
      ['fire extinguisher', 'Fire Fighting', 'NOS'],
      ['Cat6 data point', 'ELV / IT', 'NOS'],
      ['reception desk', 'Furniture', 'NOS'],
      ['wayfinding signage', 'Signage & Branding', 'NOS'],
    ] as const;
    const result = parseArchitecturalScheduleText(rows.map(([description, , uom], index) =>
      `${index + 1}. | ${description} | specification | area | ${uom} | ${index + 1}`,
    ));

    expect(result.items.map(({ category }) => category)).toEqual(rows.map(([, category]) => category));
    expect(result.items.map(({ uom }) => uom)).toEqual(rows.map(([, , uom]) => uom));
  });

  it('handles four-part and three-part rows, combined units, unknown units, and whitespace tables', () => {
    const result = parseArchitecturalScheduleText([
      'Light fitting | LED | NOS | 4',
      'Cable tray | galvanized | MTR | 2.5',
      'Painting | two coats | approximate quantity',
      'A-2  Copper cable  2.5 sqmm  Ceiling  RFT  8',
      'Pipe fitting | copper | 7 pcs',
    ]);

    expect(result.items[0]).toMatchObject({ specification: 'LED', quantity: 4, uom: 'NOS' });
    expect(result.items[1]).toMatchObject({ specification: 'galvanized', quantity: 2.5, uom: 'MTR' });
    expect(result.items[2]).toMatchObject({ specification: 'two coats', quantityType: 'UNCERTAIN' });
    expect(result.items[3]).toMatchObject({ mark: 'A-2', uom: 'RFT', quantity: 8 });
    expect(result.items[4]).toMatchObject({ quantity: 7, uom: 'NOS' });
  });

  it('resolves fallback unit spellings and reports missing numeric quantities', () => {
    const result = parseArchitecturalScheduleText([
      'Floor area | measured surface | 5 sft',
      'Pipe run | steel | 8 meters',
      'Cable route | ceiling | 3 running feet',
      'Pipe work | bathroom | quantity not recorded',
    ]);

    expect(result.items.map(({ uom }) => uom)).toEqual(['SQFT', 'MTR', 'RFT', 'NOS']);
    expect(result.items[3]).toMatchObject({ quantity: null, quantityType: 'UNCERTAIN' });
    expect(result.warnings).toHaveLength(1);
  });

  it('handles single-line numeric, pending, and unspecified quantities', () => {
    const result = parseArchitecturalScheduleText([
      'Ceiling light - panel - Qty: 6 NOS',
      'Ceiling light - panel - Qty: pending NOS',
      'Ceiling light - panel',
    ]);

    expect(result.items[0]).toMatchObject({ quantity: 6, quantityType: 'EXPLICIT', uom: 'NOS' });
    expect(result.items[1]).toMatchObject({ quantity: null, quantityType: 'UNCERTAIN' });
    expect(result.items[2]).toMatchObject({ quantity: null, quantityType: 'UNCERTAIN' });
  });

  it('parses single-line notes and returns an unsuccessful result for unmatched text', () => {
    const result = parseArchitecturalScheduleText([
      'Drawing # MEP-220',
      'Ceiling light - LED panel - Qty: 6 NOS',
      'Ceiling light - LED panel - Qty: 6 NOS - Location: Lobby',
      'General note with no procurement item',
    ]);
    expect(result.drawingReference).toBe('MEP-220');
    expect(result.items[0]).toMatchObject({ description: 'Ceiling light', quantity: 6, quantityType: 'EXPLICIT' });
    expect(result.items[1]).toMatchObject({ location: 'Lobby', quantityType: 'UNCERTAIN' });

    expect(parseArchitecturalScheduleText(['', '---', 'x', 'unmatched text']).success).toBe(false);
  });
});

describe('parseOcrTextToDrawingItems', () => {
  it('extracts menu boards, electrical/data points, support framing, and a site-check warning', () => {
    const result = parseOcrTextToDrawingItems(
      'Menu board: 2 screens front 55 inch, 940mm, UPS socket for each, cable point, support framing, beam checked on site',
      'store-dmb.png',
      'DMB-42',
    );

    expect(result.items.map(({ mark }) => mark)).toEqual(['DMB-01', 'E-UPS-01', 'E-PWR-01', 'IT-DATA-01', 'CIV-BOX-01', 'CIV-BEAM-01']);
    expect(result.items[0]).toMatchObject({ quantity: 2, drawingReference: 'DMB-42', category: 'ELV / IT' });
    expect(result.items[0].specification).toContain('55"');
    expect(result.items[4].quantity).toBeGreaterThan(0);
    expect(result.items[5].quantityType).toBe('UNCERTAIN');
    expect(result.warnings).toHaveLength(1);
  });

  it('chooses alternate screen counts and sizes and omits optional related items', () => {
    expect(parseOcrTextToDrawingItems('menuboard menuboard panels 32 inch', 'plan.png').items[0].quantity).toBe(2);
    expect(parseOcrTextToDrawingItems('3 screens DMB 43 inch', 'plan.png').items[0].quantity).toBe(3);
    expect(parseOcrTextToDrawingItems('menu screen front screen front 55 inch', 'plan.png').items[0].quantity).toBe(2);
    expect(parseOcrTextToDrawingItems('DMB screen board with 43 inch display', 'plan.png').items).toHaveLength(1);
    expect(parseOcrTextToDrawingItems('Digital menu board 4 screens 43 inch', 'plan.png').items).toHaveLength(1);
  });

  it('parses generic schedule OCR and returns no items for unrelated text', () => {
    const schedule = parseOcrTextToDrawingItems('Drawing No: A-15\n1. | Door | Fire rated | Lobby | NOS | 2', 'plan.png');
    expect(schedule.items).toHaveLength(1);
    expect(schedule.items[0].drawingReference).toBe('A-15');
    expect(parseOcrTextToDrawingItems('ordinary text with no matching item', 'plan.png')).toEqual({ items: [], warnings: [] });
  });
});

describe('AI drawing parser and file processing', () => {
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    global.fetch = jest.fn() as unknown as typeof fetch;
    createWorkerMock.mockReset();
  });

  afterEach(() => {
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiKey;
    global.fetch = originalFetch;
  });

  const response = (json: unknown, ok = true) => ({ ok, json: async () => json }) as Response;
  const fetchMock = () => global.fetch as jest.Mock;

  it('returns null without configured providers', async () => {
    await expect(parseDrawingWithAiVision(Buffer.from('drawing'), 'image/png')).resolves.toBeNull();
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('maps Gemini output and supplies defaults for incomplete items', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    fetchMock().mockResolvedValueOnce(response({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        drawingReference: 'AI-DWG-1',
        items: [
          { mark: 'E-1', description: 'Light fitting', category: 'Electrical', quantity: 4, confidence: 0.97 },
          { quantity: 'unknown' },
        ],
      }) }] } }],
    }));

    const result = await parseDrawingWithAiVision(Buffer.from('drawing'), 'image/png', 'fallback-ref');

    expect(result).toMatchObject({
      success: true,
      parserUsed: 'AI_GEMINI_VISION',
      drawingReference: 'AI-DWG-1',
      totalDetected: 2,
      explicitCount: 1,
      uncertainCount: 1,
    });
    expect(result?.items[0]).toMatchObject({ mark: 'E-1', quantity: 4, quantityType: 'EXPLICIT', confidence: 0.97 });
    expect(result?.items[1]).toMatchObject({
      description: 'Architectural Item 2', specification: 'As per architectural drawing', category: 'Civil & Interior',
      quantity: null, quantityType: 'UNCERTAIN', uncertainReason: 'Quantity unverified in drawing', confidence: 0.88,
    });
    expect(result?.warnings).toEqual(['1 items have uncertain quantities requiring verification.']);
  });

  it('returns null for failed or empty Gemini responses and warns on invalid JSON', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    fetchMock().mockResolvedValueOnce(response({}, false));
    await expect(parseDrawingWithAiVision(Buffer.from('drawing'), 'image/png')).resolves.toBeNull();

    fetchMock().mockResolvedValueOnce(response({ candidates: [{ content: { parts: [] } }] }));
    await expect(parseDrawingWithAiVision(Buffer.from('drawing'), 'image/png')).resolves.toBeNull();

    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock().mockResolvedValueOnce(response({ candidates: [{ content: { parts: [{ text: '{broken' }] } }] }));
    await expect(parseDrawingWithAiVision(Buffer.from('drawing'), 'image/png')).resolves.toBeNull();
    expect(warning).toHaveBeenCalledWith('Gemini vision extraction failed, falling back to native parser:', expect.any(String));
    warning.mockRestore();
  });

  it('maps OpenAI output and uses its default reference and warning fields', async () => {
    process.env.OPENAI_API_KEY = 'test-openai-key';
    fetchMock().mockResolvedValueOnce(response({
      choices: [{ message: { content: JSON.stringify({ items: [{ description: 'Door', quantity: 2 }] }) } }],
    }));

    const result = await parseDrawingWithAiVision(Buffer.from('drawing'), 'application/pdf', 'OPENAI-REF');
    expect(result).toMatchObject({
      success: true, parserUsed: 'AI_OPENAI_VISION', drawingReference: 'OPENAI-REF', explicitCount: 1, uncertainCount: 0,
    });
    expect(result?.items[0]).toMatchObject({ description: 'Door', quantity: 2, quantityType: 'EXPLICIT', drawingReference: 'OPENAI-REF' });
    expect(result?.warnings).toEqual([]);
  });

  it('falls back from Gemini to OpenAI and contains OpenAI failures', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    fetchMock()
      .mockRejectedValueOnce(new Error('Gemini unavailable'))
      .mockResolvedValueOnce(response({ choices: [{ message: { content: JSON.stringify({ items: [{ quantity: 1 }] }) } }] }));
    await expect(parseDrawingWithAiVision(Buffer.from('drawing'), 'image/jpeg')).resolves.toMatchObject({ parserUsed: 'AI_OPENAI_VISION' });

    fetchMock().mockResolvedValueOnce(response({ choices: [{ message: { content: 'not json' } }] }));
    await expect(parseDrawingWithAiVision(Buffer.from('drawing'), 'image/jpeg')).resolves.toBeNull();
    expect(warning).toHaveBeenCalledWith('OpenAI vision extraction failed, falling back to native parser:', expect.any(String));
    warning.mockRestore();
  });

  it('processes a text PDF natively, rejects unreadable PDFs, and rejects unsupported formats', async () => {
    const pdf = Buffer.from('<< >> stream\n(A-1 | Electrical cable | 2.5sqmm | Ceiling | MTR | 4) Tj\nendstream');
    await expect(processDrawingFile(pdf, 'boq.PDF', 'PDF-1')).resolves.toMatchObject({
      success: true, parserUsed: 'NATIVE_PDF_SCHEDULE', drawingReference: 'PDF-1', totalDetected: 1,
    });
    await expect(processDrawingFile(Buffer.from('%PDF no text'), 'scan.pdf')).rejects.toThrow('No extractable text or schedule tables');
    await expect(processDrawingFile(Buffer.from('%PDF (unmatched note) Tj'), 'note.pdf')).rejects.toThrow('No extractable text or schedule tables');
    await expect(processDrawingFile(Buffer.from('data'), 'drawing.svg')).rejects.toThrow('Unsupported drawing file type: .svg');
  });

  it('returns a successful AI result before local parsing when a provider is configured', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    fetchMock().mockResolvedValueOnce(response({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [{ description: 'AI item', quantity: 1 }] }) }] } }],
    }));

    await expect(processDrawingFile(Buffer.from('image-data'), 'drawing.png')).resolves.toMatchObject({
      success: true, parserUsed: 'AI_GEMINI_VISION', totalDetected: 1,
    });
    expect(createWorkerMock).not.toHaveBeenCalled();
  });

  it('runs local OCR with an explicit worker path and parses DMB items', async () => {
    const worker = {
      recognize: jest.fn().mockResolvedValue({ data: { text: 'DMB screen board with 4 screens and 43 inch panels' } }),
      terminate: jest.fn().mockResolvedValue(undefined),
    };
    createWorkerMock.mockResolvedValueOnce(worker);
    const exists = jest.spyOn(fs, 'existsSync').mockReturnValue(true);

    const result = await processDrawingFile(Buffer.from('image-data'), 'board.png', 'BOARD-1');

    expect(result).toMatchObject({ success: true, parserUsed: 'LOCAL_OCR_TESSERACT', drawingReference: 'BOARD-1', totalDetected: 1 });
    expect(createWorkerMock).toHaveBeenCalledWith('eng', 1, { workerPath: expect.stringContaining('node_modules') });
    expect(worker.recognize).toHaveBeenCalledWith(Buffer.from('image-data'));
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    exists.mockRestore();
  });

  it('uses the default OCR worker and the generic schedule fallback', async () => {
    const worker = {
      recognize: jest.fn().mockResolvedValue({ data: { text: 'Drawing No: A-51\n1. | Door | Fire rated | Lobby | NOS | 2' } }),
      terminate: jest.fn().mockResolvedValue(undefined),
    };
    createWorkerMock.mockResolvedValueOnce(worker);
    const exists = jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    const result = await processDrawingFile(Buffer.from('image-data'), 'door.jpeg');
    expect(result).toMatchObject({ success: true, parserUsed: 'LOCAL_OCR_TESSERACT', totalDetected: 1, explicitCount: 1 });
    expect(createWorkerMock).toHaveBeenCalledWith('eng');
    exists.mockRestore();
  });

  it.each([
    ['', 'Local OCR engine could not detect readable'],
    ['long text that does not describe a procurement item', "Local OCR engine recognized text in 'drawing.jpg' but could not extract structured CaPex items"],
  ])('wraps OCR content errors', async (text, message) => {
    createWorkerMock.mockResolvedValueOnce({
      recognize: jest.fn().mockResolvedValue({ data: { text } }),
      terminate: jest.fn().mockResolvedValue(undefined),
    });
    const exists = jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    await expect(processDrawingFile(Buffer.from('image-data'), 'drawing.jpg')).rejects.toThrow(`Drawing OCR processing failed: ${message}`);
    exists.mockRestore();
  });

  it('wraps worker startup and recognition failures with a readable message', async () => {
    createWorkerMock.mockRejectedValueOnce(new Error('worker startup failed'));
    const exists = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    await expect(processDrawingFile(Buffer.from('image-data'), 'drawing.png')).rejects.toThrow('Drawing OCR processing failed: worker startup failed');
    exists.mockRestore();
  });
});
