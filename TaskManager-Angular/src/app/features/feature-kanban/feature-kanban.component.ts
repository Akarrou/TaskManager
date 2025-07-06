import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Store, select } from '@ngrx/store';
import { Observable } from 'rxjs';

import { GenericKanbanComponent } from '../../shared/components/generic-kanban/generic-kanban.component';
import { ItemHeaderComponent } from '../../shared/components/item-header/item-header.component';
import { KanbanItem } from '../epic-kanban/models/kanban-item.model';
import { KanbanColumn } from '../epic-kanban/models/epic-board.model';
import { DEFAULT_KANBAN_COLUMNS } from '../epic-kanban/models/kanban-constants';
import { EpicKanbanActions } from '../epic-kanban/store/epic-kanban.actions';
import * as fromFeatureKanban from '../epic-kanban/store/epic-kanban.selectors';
import { Task } from '../../core/services/task';

@Component({
  selector: 'app-feature-kanban',
  standalone: true,
  imports: [CommonModule, GenericKanbanComponent, ItemHeaderComponent],
  templateUrl: './feature-kanban.component.html',
  styleUrls: ['./feature-kanban.component.scss'],
})
export class FeatureKanbanComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private store = inject(Store);
  private location = inject(Location);

  feature$: Observable<KanbanItem | null | undefined>;
  tasks$: Observable<KanbanItem[]>;
  loading$: Observable<boolean>;
  error$: Observable<string | null>;

  readonly columns: KanbanColumn[] = DEFAULT_KANBAN_COLUMNS;

  constructor() {
    console.log(this.store.pipe(select(fromFeatureKanban.selectCurrentFeatureAsKanbanItem)));
    this.feature$ = this.store.pipe(select(fromFeatureKanban.selectCurrentFeatureAsKanbanItem));
    this.tasks$ = this.store.pipe(select(fromFeatureKanban.selectTasksForCurrentFeatureAsKanbanItems));
    this.loading$ = this.store.pipe(select(fromFeatureKanban.selectFeatureTasksLoading));
    this.error$ = this.store.pipe(select(fromFeatureKanban.selectFeatureTasksError));
  }

  ngOnInit(): void {
    this.loadTasks();
  }

  loadTasks(): void {
    const featureId = this.route.snapshot.paramMap.get('featureId');
    if (featureId) {
      this.store.dispatch(EpicKanbanActions.loadFeatureTasks({ featureId }));
    }
  }

  onItemDropped(event: { item: KanbanItem; newStatus: Task['status'] }): void {
    this.store.dispatch(EpicKanbanActions.updateTaskStatus({
      taskId: event.item.id as string,
      newStatus: event.newStatus
    }));
  }

  onItemEdited(item: KanbanItem): void {
    console.log('Editing item:', item);
    // Future: a router navigation to an edit page or a dialog
  }

  onItemDeleted(item: KanbanItem): void {
    console.log('Deleting item:', item);
    this.store.dispatch(EpicKanbanActions.deleteTask({ taskId: item.id as string }));
  }

  onNavigateBack(): void {
    this.location.back();
  }
}

