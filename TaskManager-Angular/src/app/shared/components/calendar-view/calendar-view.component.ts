import { Component, input, output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { Task } from '../../../core/models/task.model';

interface CalendarDay {
  date: Date;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  tasks: Task[];
}

@Component({
  selector: 'app-calendar-view',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatTooltipModule, MatMenuModule],
  templateUrl: './calendar-view.component.html',
  styleUrls: ['./calendar-view.component.scss']
})
export class CalendarViewComponent {
  tasks = input.required<Task[]>();

  taskEdit = output<Task>();
  taskDelete = output<string>();

  currentDate = signal(new Date());

  weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  currentMonthYear = computed(() => {
    const date = this.currentDate();
    return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  });

  calendarDays = computed<CalendarDay[]>(() => {
    const date = this.currentDate();
    const year = date.getFullYear();
    const month = date.getMonth();
    const taskList = this.tasks();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Get the starting day (Monday = 0)
    let startDay = firstDayOfMonth.getDay() - 1;
    if (startDay < 0) startDay = 6;

    const days: CalendarDay[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      const dayDate = new Date(year, month - 1, prevMonthLastDay - i);
      days.push({
        date: dayDate,
        dayNumber: prevMonthLastDay - i,
        isCurrentMonth: false,
        isToday: false,
        tasks: this.getTasksForDate(taskList, dayDate)
      });
    }

    // Current month days
    for (let i = 1; i <= lastDayOfMonth.getDate(); i++) {
      const dayDate = new Date(year, month, i);
      dayDate.setHours(0, 0, 0, 0);
      days.push({
        date: dayDate,
        dayNumber: i,
        isCurrentMonth: true,
        isToday: dayDate.getTime() === today.getTime(),
        tasks: this.getTasksForDate(taskList, dayDate)
      });
    }

    // Next month days (to fill the grid)
    const remainingDays = 42 - days.length; // 6 weeks * 7 days
    for (let i = 1; i <= remainingDays; i++) {
      const dayDate = new Date(year, month + 1, i);
      days.push({
        date: dayDate,
        dayNumber: i,
        isCurrentMonth: false,
        isToday: false,
        tasks: this.getTasksForDate(taskList, dayDate)
      });
    }

    return days;
  });

  private getTasksForDate(tasks: Task[], date: Date): Task[] {
    return tasks.filter(task => {
      if (!task.due_date) return false;
      const taskDate = new Date(task.due_date);
      return (
        taskDate.getFullYear() === date.getFullYear() &&
        taskDate.getMonth() === date.getMonth() &&
        taskDate.getDate() === date.getDate()
      );
    });
  }

  previousMonth() {
    const current = this.currentDate();
    this.currentDate.set(new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }

  nextMonth() {
    const current = this.currentDate();
    this.currentDate.set(new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }

  goToToday() {
    this.currentDate.set(new Date());
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

  trackByDate(index: number, day: CalendarDay): number {
    return day.date.getTime();
  }

  trackByTask(index: number, task: Task): string {
    return task.id || index.toString();
  }
}
