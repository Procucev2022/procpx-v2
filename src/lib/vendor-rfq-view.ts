import {
  VENDOR_HIDDEN_NEGOTIATION_FIELDS,
  VENDOR_HIDDEN_RFQ_FIELDS,
  VENDOR_HIDDEN_RFQ_LINE_FIELDS,
} from './vendor-rfq-view.constants';

type LooseRecord = Record<string, unknown>;

function omitFields(record: LooseRecord, fields: readonly string[]): LooseRecord {
  const copy: LooseRecord = { ...record };
  for (const field of fields) delete copy[field];
  return copy;
}

/**
 * Returns the RFQ shape a vendor may see. It removes buyer reference prices from the RFQ, its lines, and its
 * negotiations, and leaves vendor-scoped fields (such as each vendor's own rounds) untouched.
 */
export function toVendorRfqView<T extends LooseRecord>(rfq: T): LooseRecord {
  const view = omitFields(rfq, VENDOR_HIDDEN_RFQ_FIELDS);
  if (Array.isArray(rfq.lines)) {
    view.lines = (rfq.lines as LooseRecord[]).map((line) => omitFields(line, VENDOR_HIDDEN_RFQ_LINE_FIELDS));
  }
  if (Array.isArray(rfq.negotiations)) {
    view.negotiations = (rfq.negotiations as LooseRecord[]).map((negotiation) => omitFields(negotiation, VENDOR_HIDDEN_NEGOTIATION_FIELDS));
  }
  return view;
}
