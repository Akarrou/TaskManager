import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MindmapNodeShape, SHAPE_OPTIONS } from '../../models/mindmap.model';

/**
 * Shape selector component for mindmap nodes
 * Displays a visual grid of available shapes
 */
@Component({
  selector: 'app-shape-selector',
  standalone: true,
  imports: [CommonModule, MatTooltipModule],
  templateUrl: './shape-selector.component.html',
  styleUrl: './shape-selector.component.scss',
})
export class ShapeSelectorComponent {
  @Input() selectedShape: MindmapNodeShape = 'round-rectangle';
  @Output() shapeChange = new EventEmitter<MindmapNodeShape>();

  readonly shapes = SHAPE_OPTIONS;

  selectShape(shape: MindmapNodeShape): void {
    this.shapeChange.emit(shape);
  }

  /**
   * Get SVG path for each shape preview
   */
  getShapePath(shape: MindmapNodeShape): string {
    switch (shape) {
      case 'round-rectangle':
        return 'M4,8 Q4,4 8,4 L32,4 Q36,4 36,8 L36,22 Q36,26 32,26 L8,26 Q4,26 4,22 Z';
      case 'rectangle':
        return 'M4,4 L36,4 L36,26 L4,26 Z';
      case 'ellipse':
        return 'M20,4 Q36,4 36,15 Q36,26 20,26 Q4,26 4,15 Q4,4 20,4 Z';
      case 'diamond':
        return 'M20,2 L38,15 L20,28 L2,15 Z';
      case 'hexagon':
        return 'M10,4 L30,4 L38,15 L30,26 L10,26 L2,15 Z';
      case 'round-tag':
        return 'M4,15 Q4,4 15,4 L36,4 L36,26 L15,26 Q4,26 4,15 Z';
      default:
        return 'M4,8 Q4,4 8,4 L32,4 Q36,4 36,8 L36,22 Q36,26 32,26 L8,26 Q4,26 4,22 Z';
    }
  }
}
