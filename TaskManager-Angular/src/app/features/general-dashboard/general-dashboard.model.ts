export interface IStat {
  title: string;
  value: number;
  icon: string;
  iconClass: string;
}

export interface DocumentsStats {
  total: number;
  recentCount: number;
  lastModified: Date | null;
}
