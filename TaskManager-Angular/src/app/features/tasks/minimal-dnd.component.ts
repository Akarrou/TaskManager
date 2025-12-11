import { Component } from '@angular/core';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-minimal-dnd',
  standalone: true,
  imports: [DragDropModule, CommonModule],
  template: `
    <div cdkDropList [cdkDropListData]="tasks" (cdkDropListDropped)="drop($event)">
      <div *ngFor="let task of tasks" cdkDrag>
        {{ task.title }}
      </div>
    </div>
  `
})
export class MinimalDndComponent {
  tasks = [{ title: 'Tâche 1' }, { title: 'Tâche 2' }];
  drop(event: CdkDragDrop<any[]>) {
  }
} 