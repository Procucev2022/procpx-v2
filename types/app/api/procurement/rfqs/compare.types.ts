export type RfqCompareRateCardRow = {
  description: string;
  rate: number;
  rateCardNumber: string;
  version: number;
  status: string;
  validFrom: string | Date;
  validTo: string | Date;
  vendorId: string;
  vendorName: string;
};
