export type BoqReferenceCatalogKind = 'category' | 'uom';

export type BoqReferenceCatalogContext = {
  tenantId: string;
  userId: string;
  route: string;
  requestId?: string | null;
};

export type BoqReferenceCatalogSelection = {
  categories?: boolean;
  uoms?: boolean;
};

export type ActiveBoqCategoryReference = {
  id: string;
  name: string;
  parentId: string | null;
};

export type ActiveBoqUomReference = {
  id: string;
  code: string;
  aliases: string | null;
};

export type BoqReferenceCatalogResult =
  | { ok: true; categories: ActiveBoqCategoryReference[]; uoms: ActiveBoqUomReference[] }
  | {
    ok: false;
    kind: BoqReferenceCatalogKind;
    message: string;
    resultCountAtLeast: number;
    maxItems: number;
  };
