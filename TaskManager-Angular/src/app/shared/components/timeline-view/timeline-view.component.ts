import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { Task } from '../../../core/services/task';

interface TimelineTask extends Task {
  startDate: Date;
  endDate: Date;
  duration: number; // in days
  offset: number; // percentage from start
  width: number; // percentage width
}

@Component({
  selector: 'app-timeline-view',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule, MatMenuModule],
  templateUrl: './timeline-view.component.html',
  styleUrls: ['./timeline-view.component.scss']
})
export class TimelineViewComponent {
  tasks = input.required<Task[]>();

  taskEdit = output<Task>();
  taskDelete = output<string>();

  currentDate = signal(new Date());
  zoomLevel = signal<'week' | 'month' | 'quarter'>('month');

  // Timeline range
  timelineStart = computed(() => {
    const date = new Date(this.currentDate());
    const zoom = this.zoomLevel();

    if (zoom === 'week') {
      // Start of current week (Monday)
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(date.setDate(diff));
    } else if (zoom === 'month') {
      // Start of current month
      return new Date(date.getFullYear(), date.getMonth(), 1);
    } else {
      // Start of current quarter
      const quarter = Math.floor(date.getMonth() / 3);
      return new Date(date.getFullYear(), quarter * 3, 1);
    }
  });

  timelineEnd = computed(() => {
    const start = this.timelineStart();
    const zoom = this.zoomLevel();

    if (zoom === 'week') {
      return new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
    } else if (zoom === 'month') {
      return new Date(start.getFullYear(), start.getMonth() + 1, 0);
    } else {
      return new Date(start.getFullYear(), start.getMonth() + 3, 0);
    }
  });

  timelineDays = computed(() => {
    const start = this.timelineStart();
    const end = this.timelineEnd();
    const days: Date[] = [];

    const current = new Date(start);
    while (current <= end) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return days;
  });

  // Timeline header (weeks/months)
  timelineHeaders = computed(() => {
    const zoom = this.zoomLevel();
    const days = this.timelineDays();

    if (zoom === 'week') {
      return days.map(d => ({
        label: d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' }),
        span: 1
      }));
    } else if (zoom === 'month') {
      // Group by week
      const weeks: { label: string; span: number }[] = [];
      let currentWeek = -1;

      days.forEach(d => {
        const weekNum = this.getWeekNumber(d);
        if (weekNum !== currentWeek) {
          weeks.push({
            label: `Sem. ${weekNum}`,
            span: 1
          });
          currentWeek = weekNum;
        } else {
          weeks[weeks.length - 1].span++;
        }
      });

      return weeks;
    } else {
      // Group by month
      const months: { label: string; span: number }[] = [];
      let currentMonth = -1;

      days.forEach(d => {
        const month = d.getMonth();
        if (month !== currentMonth) {
          months.push({
            label: d.toLocaleDateString('fr-FR', { month: 'long' }),
            span: 1
          });
          currentMonth = month;
        } else {
          months[months.length - 1].span++;
        }
      });

      return months;
    }
  });

  // Process tasks for timeline display
  timelineTasks = computed<TimelineTask[]>(() => {
    const taskList = this.tasks();
    const start = this.timelineStart();
    const end = this.timelineEnd();
    const totalDays = this.timelineDays().length;

    return taskList
      .filter(task => task.due_date || task.created_at)
      .map(task => {
        const taskStart = new Date(task.created_at || task.due_date!);
        const taskEnd = new Date(task.due_date || task.created_at!);

        // Calculate position and width
        const startDiff = Math.max(0, (taskStart.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
        const endDiff = Math.min(totalDays, (taskEnd.getTime() - start.getTime()) / (24 * 60 * 60 * 1000) + 1);

        const offset = (startDiff / totalDays) * 100;
        const width = Math.max(2, ((endDiff - startDiff) / totalDays) * 100);

        return {
          ...task,
          startDate: taskStart,
          endDate: taskEnd,
          duration: Math.ceil((taskEnd.getTime() - taskStart.getTime()) / (24 * 60 * 60 * 1000)) + 1,
          offset: Math.max(0, offset),
          width: Math.min(100 - offset, width)
        };
      })
      .filter(task => task.offset < 100 && task.width > 0)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  });

  periodLabel = computed(() => {
    const start = this.timelineStart();
    const end = this.timelineEnd();
    const zoom = this.zoomLevel();

    if (zoom === 'week') {
      return `${start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    } else if (zoom === 'month') {
      return start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    } else {
      const quarter = Math.floor(start.getMonth() / 3) + 1;
      return `T${quarter} ${start.getFullYear()}`;
    }
  });

  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }

  previousPeriod() {
    const current = this.currentDate();
    const zoom = this.zoomLevel();

    if (zoom === 'week') {
      this.currentDate.set(new Date(current.getTime() - 7 * 24 * 60 * 60 * 1000));
    } else if (zoom === 'month') {
      this.currentDate.set(new Date(current.getFullYear(), current.getMonth() - 1, 1));
    } else {
      this.currentDate.set(new Date(current.getFullYear(), current.getMonth() - 3, 1));
    }
  }

  nextPeriod() {
    const current = this.currentDate();
    const zoom = this.zoomLevel();

    if (zoom === 'week') {
      this.currentDate.set(new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000));
    } else if (zoom === 'month') {
      this.currentDate.set(new Date(current.getFullYear(), current.getMonth() + 1, 1));
    } else {
      this.currentDate.set(new Date(current.getFullYear(), current.getMonth() + 3, 1));
    }
  }

  goToToday() {
    this.currentDate.set(new Date());
  }

  setZoom(level: 'week' | 'month' | 'quarter') {
    this.zoomLevel.set(level);
  }

  onEditTask(task: Task) {
    this.taskEdit.emit(task);
  }

  onDeleteTask(taskId: string) {
    this.taskDelete.emit(taskId);
  }

  getStatusClass(status: string): string {
    return `status-${status}`;
  }

  getPriorityClass(priority: string): string {
    return `priority-${priority}`;
  }

  isToday(date: Date): boolean {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  }

  isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  trackByTask(index: number, task: TimelineTask): string {
    return task.id || index.toString();
  }

  trackByDate(index: number, date: Date): number {
    return date.getTime();
  }
}
