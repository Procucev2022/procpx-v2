export type RfqMessagesRouteContext = { params: Promise<{ id: string }> };

export type RfqMessageCursor = {
  createdAt: Date;
  id: string;
};

export type RfqMessageCreateRequest = {
  message: string;
  isVendorSent: boolean;
  vendorId: string | null;
  senderRole: 'VENDOR' | 'BUYER';
  senderName: string;
};
