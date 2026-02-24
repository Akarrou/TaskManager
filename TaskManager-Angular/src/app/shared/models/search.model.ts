export type SearchResultType = 'document' | 'task' | 'event';

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle?: string;
  icon: string;
  navigateTo: string;
  databaseId?: string;
  updatedAt?: string;
}

export interface SearchResponse {
  documents: SearchResult[];
  tasks: SearchResult[];
  events: SearchResult[];
  total: number;
}
