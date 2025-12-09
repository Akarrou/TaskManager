import { Component, input, output, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { Task, TaskService } from '../../../core/services/task';

export type RelationType = 'blocks' | 'blocked_by' | 'relates_to' | 'duplicates' | 'parent_of' | 'child_of';

export interface TaskRelation {
  id?: string;
  source_task_id: string;
  target_task_id: string;
  relation_type: RelationType;
  created_at?: string;
  // Virtual fields for display
  targetTask?: Task;
}

interface RelationTypeOption {
  value: RelationType;
  label: string;
  icon: string;
  reverseLabel: string;
}

@Component({
  selector: 'app-task-relations',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatTooltipModule,
    MatDialogModule
  ],
  templateUrl: './task-relations.component.html',
  styleUrls: ['./task-relations.component.scss']
})
export class TaskRelationsComponent implements OnInit {
  private taskService = inject(TaskService);

  currentTaskId = input<string>();
  relations = input<TaskRelation[]>([]);

  relationsChange = output<TaskRelation[]>();

  allTasks = signal<Task[]>([]);
  localRelations = signal<TaskRelation[]>([]);
  searchQuery = signal<string>('');
  selectedRelationType = signal<RelationType>('relates_to');
  isAddingRelation = signal<boolean>(false);

  relationTypes: RelationTypeOption[] = [
    { value: 'blocks', label: 'Bloque', icon: 'block', reverseLabel: 'Bloqué par' },
    { value: 'blocked_by', label: 'Bloqué par', icon: 'do_not_disturb_on', reverseLabel: 'Bloque' },
    { value: 'relates_to', label: 'Lié à', icon: 'link', reverseLabel: 'Lié à' },
    { value: 'duplicates', label: 'Duplique', icon: 'content_copy', reverseLabel: 'Dupliqué par' },
    { value: 'parent_of', label: 'Parent de', icon: 'account_tree', reverseLabel: 'Enfant de' },
    { value: 'child_of', label: 'Enfant de', icon: 'subdirectory_arrow_right', reverseLabel: 'Parent de' }
  ];

  // Filtered tasks for autocomplete
  filteredTasks = computed(() => {
    const query = this.searchQuery().toLowerCase();
    const currentId = this.currentTaskId();
    const existingRelationIds = this.localRelations().map(r => r.target_task_id);

    return this.allTasks()
      .filter(task => {
        // Exclude current task
        if (task.id === currentId) return false;
        // Exclude already related tasks
        if (existingRelationIds.includes(task.id!)) return false;
        // Filter by search query
        if (!query) return true;
        return (
          task.title.toLowerCase().includes(query) ||
          (task.task_number && task.task_number.toString().includes(query)) ||
          (task.slug && task.slug.toLowerCase().includes(query))
        );
      })
      .slice(0, 10); // Limit results
  });

  // Group relations by type for display
  groupedRelations = computed(() => {
    const relations = this.localRelations();
    const groups: { type: RelationTypeOption; relations: TaskRelation[] }[] = [];

    this.relationTypes.forEach(type => {
      const typeRelations = relations.filter(r => r.relation_type === type.value);
      if (typeRelations.length > 0) {
        groups.push({ type, relations: typeRelations });
      }
    });

    return groups;
  });

  async ngOnInit() {
    // Load all tasks for selection
    await this.taskService.loadTasks();
    this.allTasks.set(this.taskService.tasks());

    // Initialize local relations
    this.localRelations.set(this.relations());

    // Enrich relations with task details
    this.enrichRelations();
  }

  private enrichRelations() {
    const tasks = this.allTasks();
    this.localRelations.update(relations =>
      relations.map(relation => ({
        ...relation,
        targetTask: tasks.find(t => t.id === relation.target_task_id)
      }))
    );
  }

  toggleAddRelation() {
    this.isAddingRelation.update(v => !v);
    if (!this.isAddingRelation()) {
      this.searchQuery.set('');
    }
  }

  onSearchChange(value: string) {
    this.searchQuery.set(value);
  }

  onRelationTypeChange(value: RelationType) {
    this.selectedRelationType.set(value);
  }

  addRelation(task: Task) {
    if (!task.id || !this.currentTaskId()) return;

    const newRelation: TaskRelation = {
      source_task_id: this.currentTaskId()!,
      target_task_id: task.id,
      relation_type: this.selectedRelationType(),
      targetTask: task
    };

    this.localRelations.update(relations => [...relations, newRelation]);
    this.emitChanges();

    // Reset form
    this.searchQuery.set('');
    this.isAddingRelation.set(false);
  }

  removeRelation(relation: TaskRelation) {
    this.localRelations.update(relations =>
      relations.filter(r =>
        !(r.target_task_id === relation.target_task_id && r.relation_type === relation.relation_type)
      )
    );
    this.emitChanges();
  }

  private emitChanges() {
    // Remove virtual fields before emitting
    const cleanRelations = this.localRelations().map(({ targetTask, ...r }) => r);
    this.relationsChange.emit(cleanRelations);
  }

  getRelationIcon(type: RelationType): string {
    return this.relationTypes.find(t => t.value === type)?.icon || 'link';
  }

  getRelationLabel(type: RelationType): string {
    return this.relationTypes.find(t => t.value === type)?.label || type;
  }

  getStatusClass(status: string): string {
    return `status-${status}`;
  }

  getStatusLabel(status: string): string {
    const statusMap: { [key: string]: string } = {
      pending: 'À faire',
      in_progress: 'En cours',
      completed: 'Terminée',
      cancelled: 'Annulée'
    };
    return statusMap[status] || status;
  }

  trackByRelation(index: number, relation: TaskRelation): string {
    return `${relation.target_task_id}-${relation.relation_type}`;
  }
}
