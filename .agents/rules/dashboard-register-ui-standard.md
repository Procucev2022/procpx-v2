# proCPX — Dashboard and Register Summary vs. Details UI Standard

## Core Rule
"Dashboard and register rows are concise summaries, not full-detail screens. Show only the fields needed to identify a record, understand its amount/status/stage, and take the next action. Put secondary descriptions, references, line items, and audit information in the existing View Details experience. Avoid cramped columns, repeated metadata, and duplicate actions."

## Background & Rationale
Across multiple modules (PR Dashboard, Approved PR Register, BOQ Workspace, RFQ Register), table rows previously suffered from overcrowded layouts where full project names, BOQ numbers, revisions, cost centre descriptions, category chips, technical scopes, and multiple action buttons were crammed into narrow table columns. This created visual noise, text clipping, and poor readability on standard and compact viewports.

## Standard Summary Columns for PR & Procurement Registers
A concise summary row must limit itself to the essential operational fields:
1. **Primary Business Identifier**: PR Number / BOQ Code (prominent `font-mono font-bold text-primary`)
2. **Short Description**: Concise title/package description preview (with readable width, single-line truncation with full text tooltip; avoid repeating project/BOQ labels inside the cell)
3. **Item Count**: Total line items (e.g., `8 items`)
4. **Cost Centre**: Concise cost centre code (e.g., `CC45`)
5. **Commercial Value / Amount**: Formatted currency (e.g., `₹ 11,33,150`, right-aligned)
6. **Approval Status**: Canonical status badge (e.g., `APPROVED`, `UNDER_REVIEW`, `DRAFT`)
7. **Current Stage**: Sourcing / workflow stage badge (e.g., `Quotation Comparison`, `Approved PR — Awaiting RFQ`)
8. **Linked Entities**: Quick count indicator (e.g., `1 RFQ`, `0 RFQs`)
9. **Action**: A single primary action: **View Details**

## Information Moving to View Details
The View Details experience (modal, drawer, or details workspace) must house all secondary, technical, and contextual information:
- Full package and scope descriptions
- Project name, project code, and project metadata
- Originating BOQ number, revision code, and quality health score
- Full cost centre code, name, and zone
- Category and subcategory taxonomies
- Complete line-item breakdown with canonical columns (`S.No.`, `Item Code`, `Item Description`, `Specification`, `Category`, `Quantity`, `UOM`, `Estimated Rate`, `Estimated Value`)
- Multi-round sourcing and linked RFQ / auction / negotiation records
- Approval history, reviewer notes, and audit timestamps
- Contextual next-step actions (e.g., "+ Create RFQ", "Open RFQ Workspace", "Edit Line")
