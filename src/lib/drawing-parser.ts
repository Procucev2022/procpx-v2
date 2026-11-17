import zlib from 'zlib';
import type { ExtractedDrawingItem, DrawingParseResult } from "@app-types/lib/drawing-parser.types";
export type { ExtractedDrawingItem, DrawingParseResult };
import { CATEGORY_RULES, KNOWN_UOMS } from "./drawing-parser.constants";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { logEvent } from "@/lib/observability/server-logger";



function resolveCategory(text: string): string {
  const lower = text.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) {
        return rule.category;
      }
    }
  }
  return 'Civil & Interior';
}

function resolveUom(text: string): string {
  const upper = text.toUpperCase();
  for (const u of KNOWN_UOMS) {
    const regex = new RegExp(`\\b${u}\\b`, 'i');
    if (regex.test(upper)) return u;
  }
  if (upper.includes('SFT') || upper.includes('SQ.FT') || upper.includes('SQ FT')) return 'SQFT';
  if (upper.includes('NO.') || upper.includes('NUM') || upper.includes('PCS') || upper.includes('PIECE')) return 'NOS';
  if (upper.includes('METER') || upper.includes('METRE') || upper.includes('M.')) return 'MTR';
  if (upper.includes('RUNNING') || upper.includes('RMT') || upper.includes('R.FT')) return 'RFT';
  return 'NOS';
}

/**
 * Extracts plain text strings from a PDF buffer (supports uncompressed & FlateDecode streams).
 */
export function extractTextFromPdf(pdfBuffer: Buffer): string[] {
  const extractedLines: string[] = [];
  let offset = 0;

  while (offset < pdfBuffer.length) {
    const streamStart = pdfBuffer.indexOf('stream', offset);
    if (streamStart === -1) break;

    const dictStart = pdfBuffer.lastIndexOf('<<', streamStart);
    let isFlate = false;
    if (dictStart !== -1 && streamStart - dictStart < 500) {
      const dict = pdfBuffer.slice(dictStart, streamStart).toString('ascii');
      if (dict.includes('FlateDecode')) {
        isFlate = true;
      }
    }

    let dataStart = streamStart + 6;
    if (pdfBuffer[dataStart] === 0x0d && pdfBuffer[dataStart + 1] === 0x0a) {
      dataStart += 2;
    } else if (pdfBuffer[dataStart] === 0x0a || pdfBuffer[dataStart] === 0x0d) {
      dataStart += 1;
    }

    const streamEnd = pdfBuffer.indexOf('endstream', dataStart);
    if (streamEnd === -1) break;

    const streamData = pdfBuffer.slice(dataStart, streamEnd);
    offset = streamEnd + 9;

    let rawText = '';
    if (isFlate) {
      try {
        const decompressed = zlib.inflateSync(streamData);
        rawText = decompressed.toString('utf-8');
      } catch {
        try {
          const rawDecompressed = zlib.inflateRawSync(streamData);
          rawText = rawDecompressed.toString('utf-8');
        } catch {
          rawText = streamData.toString('utf-8');
        }
      }
    } else {
      rawText = streamData.toString('utf-8');
    }

    // Extract (...) Tj or (...) ' or (...) "
    const tjRegex = /\(([^)]+)\)\s*(?:Tj|'|")/g;
    let match;
    while ((match = tjRegex.exec(rawText)) !== null) {
      const val = match[1].replace(/\\([()\\])/g, '$1').trim();
      if (val) extractedLines.push(val);
    }

    // Extract [ (str1) 123 (str2) ] TJ
    const arrayTjRegex = /\[([^\]]+)\]\s*TJ/g;
    while ((match = arrayTjRegex.exec(rawText)) !== null) {
      const inner = match[1];
      const strRegex = /\(([^)]+)\)/g;
      let innerMatch;
      let combined = '';
      while ((innerMatch = strRegex.exec(inner)) !== null) {
        combined += innerMatch[1].replace(/\\([()\\])/g, '$1');
      }
      combined = combined.trim();
      if (combined) extractedLines.push(combined);
    }
  }

  // Fallback: check uncompressed literal strings in buffer
  if (extractedLines.length === 0) {
    const raw = pdfBuffer.toString('utf-8');
    const tjRegex = /\(([^)]+)\)\s*(?:Tj|'|")/g;
    let match;
    while ((match = tjRegex.exec(raw)) !== null) {
      const val = match[1].replace(/\\([()\\])/g, '$1').trim();
      if (val) extractedLines.push(val);
    }
  }

  return extractedLines;
}

/**
 * Parses architectural schedule lines from extracted PDF text.
 */
export function parseArchitecturalScheduleText(
  lines: string[],
  defaultDwgRef: string = 'DWG-A-101'
): DrawingParseResult {
  const items: ExtractedDrawingItem[] = [];
  const warnings: string[] = [];

  let drawingReference = defaultDwgRef;
  for (const line of lines) {
    const dwgMatch = line.match(/(?:Drawing\s*(?:No|Ref|#)?[:.\s]*)([A-Z0-9_-]+)/i);
    if (dwgMatch && dwgMatch[1]) {
      drawingReference = dwgMatch[1];
      break;
    }
  }

  let lineNumber = 1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('---') || trimmed.length < 5) continue;

    if (
      trimmed.toUpperCase().includes('ARCHITECTURAL DRAWING') ||
      trimmed.toUpperCase().includes('SCHEDULE OF FINISHES') ||
      (trimmed.toUpperCase().includes('ITEM DESCRIPTION') && trimmed.toUpperCase().includes('QTY')) ||
      trimmed.startsWith('Drawing No:')
    ) {
      continue;
    }

    const parts = trimmed.includes('|')
      ? trimmed.split('|').map(s => s.trim())
      : trimmed.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);

    if (parts.length >= 3) {
      let mark = '';
      let desc = '';
      let spec = '';
      let loc = '';
      let uom = 'NOS';
      let qtyVal: number | null = null;
      let qtyType: 'EXPLICIT' | 'CALCULATED' | 'UNCERTAIN' = 'EXPLICIT';
      let uncertainReason: string | undefined = undefined;

      const firstPart = parts[0];
      const markMatch = firstPart.match(/^([A-Z0-9]{1,4}[-:][0-9A-Z]*|[0-9]{1,3}[.)])\s*(.*)$/i);
      if (markMatch) {
        mark = markMatch[1].replace(/[:.)]/g, '');
        desc = markMatch[2].replace(/^[:.\s-]+/, '').trim() || firstPart;
      } else {
        desc = firstPart;
      }

      const lastPart = parts[parts.length - 1];
      const secondLast = parts.length > 3 ? parts[parts.length - 2] : '';

      const qtyNumberMatch = lastPart.match(/^([0-9]+(?:\.[0-9]+)?)$/);
      if (qtyNumberMatch) {
        qtyVal = parseFloat(qtyNumberMatch[1]);
        qtyType = 'EXPLICIT';
        if (secondLast && KNOWN_UOMS.includes(secondLast.toUpperCase())) {
          uom = secondLast.toUpperCase();
        } else {
          uom = resolveUom(trimmed);
        }
      } else if (/unverified|pending|tbd|by architect|approx|site|calc/i.test(lastPart)) {
        qtyVal = null;
        qtyType = 'UNCERTAIN';
        uncertainReason = `Quantity specified as '${lastPart}' in drawing schedule; requires field verification.`;
        if (secondLast && KNOWN_UOMS.includes(secondLast.toUpperCase())) {
          uom = secondLast.toUpperCase();
        } else {
          uom = resolveUom(trimmed);
        }
      } else {
        const combinedMatch = lastPart.match(/([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z]+)/);
        if (combinedMatch) {
          qtyVal = parseFloat(combinedMatch[1]);
          qtyType = 'EXPLICIT';
          uom = resolveUom(combinedMatch[2]);
        } else {
          qtyVal = null;
          qtyType = 'UNCERTAIN';
          uncertainReason = 'No explicit numeric quantity verified in schedule line.';
          uom = resolveUom(lastPart);
        }
      }

      if (parts.length >= 5) {
        spec = parts[1];
        loc = parts[2];
      } else if (parts.length === 4) {
        if (secondLast && KNOWN_UOMS.includes(secondLast.toUpperCase())) {
          spec = parts[1];
          loc = '';
        } else {
          spec = parts[1];
          loc = parts[2];
        }
      } else if (parts.length === 3) {
        spec = parts[1];
      }

      const category = resolveCategory(`${desc} ${spec}`);

      if (qtyType === 'UNCERTAIN') {
        warnings.push(`Line ${lineNumber} (${desc}): ${uncertainReason}`);
      }

      items.push({
        lineNumber: String(lineNumber++),
        mark: mark || undefined,
        description: desc,
        specification: spec || `${desc} as per architectural drawing ${drawingReference}`,
        category,
        uom,
        quantity: qtyVal,
        quantityType: qtyType,
        uncertainReason,
        location: loc || undefined,
        confidence: qtyType === 'EXPLICIT' ? 0.92 : 0.65,
        drawingReference,
        sheet: 'Sheet 01',
      });
      continue;
    }

    // Single-line fallback
    const lineRegex = /(?:([0-9]+)[.)]\s*)?([^,-]+(?:tile|door|glass|ceiling|light|cable|partition|ac|pipe|paint|desk|panel)[^,-]*)(?:[-–,]\s*(.*?))?(?:[-–,]\s*(?:Qty|Quantity)[:.\s]*([0-9]+(?:\.[0-9]+)?|[A-Za-z]+))?(?:\s*([A-Za-z]{2,5}))?(?:[-–,]\s*(?:Location|Room)[:.\s]*(.*?))?$/i;
    const itemMatch = trimmed.match(lineRegex);
    if (itemMatch && itemMatch[2]) {
      const desc = itemMatch[2].trim();
      const spec = itemMatch[3]?.trim() || '';
      const rawQty = itemMatch[4]?.trim();
      const rawUom = itemMatch[5]?.trim();
      const loc = itemMatch[6]?.trim();

      let qtyVal: number | null = null;
      let qtyType: 'EXPLICIT' | 'CALCULATED' | 'UNCERTAIN' = 'UNCERTAIN';
      let uncertainReason: string | undefined = undefined;

      if (rawQty && !isNaN(Number(rawQty))) {
        qtyVal = parseFloat(rawQty);
        qtyType = 'EXPLICIT';
      } else if (rawQty && /unverified|pending|tbd/i.test(rawQty)) {
        qtyVal = null;
        qtyType = 'UNCERTAIN';
        uncertainReason = `Quantity '${rawQty}' unverified in drawing notes.`;
      } else {
        qtyVal = null;
        qtyType = 'UNCERTAIN';
        uncertainReason = 'No explicit numeric quantity found in drawing note.';
      }

      const uom = rawUom ? resolveUom(rawUom) : resolveUom(trimmed);
      const category = resolveCategory(`${desc} ${spec}`);

      items.push({
        lineNumber: String(lineNumber++),
        description: desc,
        specification: spec || `${desc} as specified in drawing`,
        category,
        uom,
        quantity: qtyVal,
        quantityType: qtyType,
        uncertainReason,
        location: loc || undefined,
        confidence: qtyType === 'EXPLICIT' ? 0.88 : 0.60,
        drawingReference,
        sheet: 'Sheet 01',
      });
    }
  }

  const explicitCount = items.filter(i => i.quantityType === 'EXPLICIT').length;
  const uncertainCount = items.filter(i => i.quantityType === 'UNCERTAIN').length;

  return {
    success: items.length > 0,
    parserUsed: 'NATIVE_PDF_SCHEDULE',
    drawingReference,
    totalDetected: items.length,
    explicitCount,
    uncertainCount,
    items,
    warnings,
  };
}

/**
 * AI Provider Vision Client: Calls Gemini or OpenAI if configured in process.env.
 */
export async function parseDrawingWithAiVision(
  fileBuffer: Buffer,
  mimeType: string,
  drawingRef: string = 'DWG-A-101'
): Promise<DrawingParseResult | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;

  if (geminiKey) {
    try {
      const base64Data = fileBuffer.toString('base64');
      const prompt = `You are an expert CaPex procurement engineer and architectural estimator.
Analyze this architectural drawing, floor plan, finishes schedule, or equipment legend (Drawing Ref: ${drawingRef}).
Extract all distinct CaPex BOQ candidate line items shown in schedules, legends, and plan callouts.
Return STRICT JSON format adhering to this structure:
{
  "drawingReference": "${drawingRef}",
  "items": [
    {
      "mark": "D-01 or null",
      "description": "Clear descriptive name",
      "specification": "Detailed materials, dimensions, or standards from notes",
      "category": "Civil & Interior | Electrical | HVAC | Plumbing | Fire Fighting | ELV / IT | Furniture | Signage & Branding",
      "uom": "SQFT | NOS | MTR | RFT | CUM | SET",
      "quantity": 12,
      "quantityType": "EXPLICIT | CALCULATED | UNCERTAIN",
      "uncertainReason": "Reason if quantity is null or uncertain, else null",
      "location": "Room or floor name if stated, else null",
      "confidence": 0.95
    }
  ]
}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  { inlineData: { mimeType, data: base64Data } },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1,
            },
          }),
        }
      );

      if (res.ok) {
        const json = await res.json();
        const rawContent = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawContent) {
          const parsed = JSON.parse(rawContent);
          const rawItems = parsed.items || [];
          const items: ExtractedDrawingItem[] = rawItems.map((r: any, idx: number) => ({
            lineNumber: String(idx + 1),
            mark: r.mark || undefined,
            description: interpolateUiString(UI_STRINGS.common.value1, { "value1": r.description || `Architectural Item ${idx + 1}` }),
            specification: r.specification || 'As per architectural drawing',
            category: r.category || 'Civil & Interior',
            uom: r.uom || 'NOS',
            quantity: typeof r.quantity === 'number' ? r.quantity : null,
            quantityType: r.quantityType || (typeof r.quantity === 'number' ? 'EXPLICIT' : 'UNCERTAIN'),
            uncertainReason: r.uncertainReason || (typeof r.quantity !== 'number' ? 'Quantity unverified in drawing' : undefined),
            location: r.location || undefined,
            confidence: r.confidence || 0.88,
            drawingReference: parsed.drawingReference || drawingRef,
          }));

          const explicitCount = items.filter(i => i.quantityType === 'EXPLICIT').length;
          const uncertainCount = items.filter(i => i.quantityType === 'UNCERTAIN').length;

          return {
            success: items.length > 0,
            parserUsed: 'AI_GEMINI_VISION',
            providerMessage: 'Extracted using Google Gemini Multimodal Vision API.',
            drawingReference: parsed.drawingReference || drawingRef,
            totalDetected: items.length,
            explicitCount,
            uncertainCount,
            items,
            warnings: uncertainCount > 0 ? [`${uncertainCount} items have uncertain quantities requiring verification.`] : [],
          };
        }
      }
    } catch (err: any) {
      logEvent('warn', 'boq.drawing_extraction_fallback', {
        operation: 'extract_drawing_items', provider: 'gemini', fallback: 'native_parser', error: err,
      });
    }
  }

  if (openAiKey) {
    try {
      const base64Data = fileBuffer.toString('base64');
      const dataUri = `data:${mimeType};base64,${base64Data}`;
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an architectural drawing estimator. Output valid JSON only with keys drawingReference and items array.',
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: interpolateUiString(UI_STRINGS.libDrawingParser.extractAllCaPexBOQItemsFromThisDrawingRefDrawingRefNeverInventQuantitiesUseNullIfUnverified, { "drawingRef": drawingRef }) },
                { type: 'image_url', image_url: { url: dataUri } },
              ],
            },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          const rawItems = parsed.items || [];
          const items: ExtractedDrawingItem[] = rawItems.map((r: any, idx: number) => ({
            lineNumber: String(idx + 1),
            mark: r.mark || undefined,
            description: interpolateUiString(UI_STRINGS.common.value1, { "value1": r.description || `Architectural Item ${idx + 1}` }),
            specification: r.specification || 'As per architectural drawing',
            category: r.category || 'Civil & Interior',
            uom: r.uom || 'NOS',
            quantity: typeof r.quantity === 'number' ? r.quantity : null,
            quantityType: r.quantityType || (typeof r.quantity === 'number' ? 'EXPLICIT' : 'UNCERTAIN'),
            uncertainReason: r.uncertainReason || (typeof r.quantity !== 'number' ? 'Quantity unverified in drawing' : undefined),
            location: r.location || undefined,
            confidence: r.confidence || 0.88,
            drawingReference: parsed.drawingReference || drawingRef,
          }));

          const explicitCount = items.filter(i => i.quantityType === 'EXPLICIT').length;
          const uncertainCount = items.filter(i => i.quantityType === 'UNCERTAIN').length;

          return {
            success: items.length > 0,
            parserUsed: 'AI_OPENAI_VISION',
            providerMessage: 'Extracted using OpenAI GPT-4o Vision API.',
            drawingReference: parsed.drawingReference || drawingRef,
            totalDetected: items.length,
            explicitCount,
            uncertainCount,
            items,
            warnings: uncertainCount > 0 ? [`${uncertainCount} items have uncertain quantities requiring verification.`] : [],
          };
        }
      }
    } catch (err: any) {
      logEvent('warn', 'boq.drawing_extraction_fallback', {
        operation: 'extract_drawing_items', provider: 'openai', fallback: 'native_parser', error: err,
      });
    }
  }

  return null;
}

/**
 * Main unified extraction function: Processes drawing file buffer and returns structured items.
 */
export async function processDrawingFile(
  fileBuffer: Buffer,
  fileName: string,
  drawingRef: string = 'DWG-A-101'
): Promise<DrawingParseResult> {
  const ext = fileName.split('.').pop()?.toLowerCase();

  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
  };
  const mimeType = mimeMap[ext || ''] || 'application/octet-stream';

  // 1. Try configured AI Vision first if API key configured
  if (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY) {
    const aiResult = await parseDrawingWithAiVision(fileBuffer, mimeType, drawingRef);
    if (aiResult && aiResult.success && aiResult.items.length > 0) {
      return aiResult;
    }
  }

  // 2. If PDF, use native architectural schedule & text parser
  if (ext === 'pdf') {
    const textLines = extractTextFromPdf(fileBuffer);
    if (textLines.length > 0) {
      const scheduleResult = parseArchitecturalScheduleText(textLines, drawingRef);
      if (scheduleResult.success && scheduleResult.items.length > 0) {
        return scheduleResult;
      }
    }

    throw new Error(
      interpolateUiString(UI_STRINGS.common.value1, { "value1": `No extractable text or schedule tables found in the uploaded PDF '${fileName}'. ` +
      `If this is a scanned raster drawing, an AI Vision provider key (GEMINI_API_KEY or OPENAI_API_KEY) in .env is required to read raster pixels.` })
    );
  }

  // 3. Raster images need an AI Vision provider: the Cloudflare Worker runtime
  // cannot host a local OCR engine (no worker_threads or filesystem access).
  if (['png', 'jpg', 'jpeg'].includes(ext || '')) {
    throw new Error(UI_STRINGS.libDrawingParser.localOCRIsNotAvailableInCloudflareWorkersConfigureAIVisionForImageDrawings);
  }

  throw new Error(interpolateUiString(UI_STRINGS.libDrawingParser.unsupportedDrawingFileTypeExtSupportedFormatsArePdfPngJpgJpeg, { "ext": ext }));
}
