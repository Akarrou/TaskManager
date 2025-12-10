export interface DocumentTaskRelation {
  id: string;
  document_id: string;
  task_id: string;
  relation_type: 'linked' | 'embedded';
  position_in_document?: number;
  created_at: string;
  created_by?: string;
}

export interface TaskMentionData {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  type: 'epic' | 'feature' | 'task';
  task_number?: number;
  project_id: string;
}

export interface TaskSearchResult {
  id: string;
  title: string;
  task_number?: number;
  type: 'epic' | 'feature' | 'task';
  status: string;
  priority: string;
  project_id: string;
  parent_task_title?: string;
}
