export interface ProjectDocumentListItem {
  id: string;
  name: string;
  category?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  uploadedBy?: string | null;
  uploadedAt: string | Date;
}

export interface ProjectDetailState {
  documents?: ProjectDocumentListItem[];
  _count?: { documents?: number; [key: string]: number | undefined };
  [key: string]: unknown;
}
