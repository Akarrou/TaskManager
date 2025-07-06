export interface KanbanItem {
    id: string | number;
    title: string;
    description?: string;
    status: 'pending' | 'in_progress' | 'review' | 'completed' | 'cancelled' | string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    type: 'epic' | 'feature' | 'task';
    task_number?: number;
    type_icon?: string;
    tags?: string[];
    assignee?: string;
    dueDate?: string;
    prd_slug?: string;
    environment?: string[];
    subItems?: KanbanItem[];
    progress?: {
        completed: number;
        total: number;
        percentage: number;
    };
}
