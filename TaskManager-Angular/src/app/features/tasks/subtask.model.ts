export interface ISubtask {
  id: string;
  task_id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent' | 'None';
  created_at: string;
  updated_at: string;
  environment: 'frontend' | 'backend' | 'OPS' | null;
  slug: string;
  estimated_hours?: number;
  guideline_refs: string[];
  tags?: string[];
  task_number?: number;
} 