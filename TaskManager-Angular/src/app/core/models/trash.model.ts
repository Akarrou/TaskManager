export type TrashItemType = 'document' | 'project' | 'event' | 'database' | 'database_row' | 'comment' | 'spreadsheet';

export interface TrashItem {
  id: string;
  item_type: TrashItemType;
  item_id: string;
  item_table: string;
  display_name: string;
  parent_info: Record<string, string> | null;
  user_id: string;
  deleted_at: string;
  expires_at: string;
}
