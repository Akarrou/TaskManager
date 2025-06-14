export interface ISubtask {
  id: string;
  task_id: string;
  title: string;
  description?: string;
  status: string;
  created_at: string;
  updated_at: string;
  environment: 'frontend' | 'backend' | 'OPS' | null;
  slug: string;
  estimated_hours?: number;
  guideline_refs: string[];
} 