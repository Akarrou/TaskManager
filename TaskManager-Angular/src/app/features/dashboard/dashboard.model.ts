export interface IStat {
  title: string;
  value: number;
  icon: string;
  iconClass: string;
}

export interface ITask {
  title: string;
  status: 'in-progress' | 'todo' | 'completed';
  statusLabel: string;
  priority: 'high' | 'medium' | 'low';
  priorityLabel: string;
  assignee: string;
  dueDate: string;
} 