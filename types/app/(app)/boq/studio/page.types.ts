/** A BOQ header record as loaded into BOQ Studio (shape follows the /api/boq/[id] response). */
export type StudioBoqRecord = Record<string, unknown>;

/** One editable row in BOQ Studio's Manual Line Entry table (values are kept as typed text). */
export type ManualDraftLine = {
  key: string;
  description: string;
  specification: string;
  category: string;
  uom: string;
  quantity: string;
  rate: string;
};

export type ManualDraftLineField = Exclude<keyof ManualDraftLine, 'key'>;

/** A switchable column of the BOQ Line Items table, in on-screen order. */
export type BoqLineColumn = {
  key: string;
  label: string;
  /** Always shown; cannot be switched off. */
  locked: boolean;
  defaultVisible: boolean;
};

/** The editable fields of a BOQ line in BOQ Studio's in-place edit mode (shape of the lines API rows). */
export type StudioEditableLine = {
  id?: string;
  standardDescription?: string | null;
  originalDescription?: string | null;
  specification?: string | null;
  quantity?: number | null;
  uomRaw?: string | null;
  uom?: { code?: string | null } | null;
  location?: string | null;
  brand?: string | null;
  remarks?: string | null;
  aiUnitCost?: number | null;
};
