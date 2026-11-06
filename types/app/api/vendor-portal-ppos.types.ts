export type VendorPpoLineView = {
  id: string;
  itemDescription: string;
  quantity: number;
  uom: string;
  unitRate: number;
  gstPercent: number;
  totalAmount: number;
};

export type VendorPpoRoutePage = {
  page: number;
  pageSize: number;
  skip: number;
};

export type VendorPpoRouteQuery = {
  page: number;
  pageSize: number;
  skip: number;
  search: string;
  ppoId: string | null;
};
