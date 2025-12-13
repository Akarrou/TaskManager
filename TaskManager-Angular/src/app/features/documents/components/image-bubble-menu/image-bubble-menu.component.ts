import { Component, Input, OnInit, OnDestroy, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Editor } from '@tiptap/core';
import { MatDialog } from '@angular/material/dialog';
import { ImageInsertDialogComponent, ImageInsertDialogData, ImageInsertDialogResult } from '../image-insert-dialog/image-insert-dialog.component';

@Component({
  selector: 'app-image-bubble-menu',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './image-bubble-menu.component.html',
  styleUrl: './image-bubble-menu.component.scss',
})
export class ImageBubbleMenuComponent implements OnInit, OnDestroy {
  @Input() editor!: Editor;

  private dialog = inject(MatDialog);

  isVisible = signal(false);
  currentAlignment = signal<'left' | 'center' | 'right'>('center');
  position = signal({ top: '0px', left: '0px' });

  private updateInterval?: number;

  constructor() {
    // Effect pour mettre à jour la visibilité et position du menu
    effect(() => {
      if (this.editor) {
        this.updateMenuState();
      }
    });
  }

  ngOnInit() {
    // Vérifier l'état du menu régulièrement
    this.updateInterval = window.setInterval(() => {
      this.updateMenuState();
    }, 100);
  }

  ngOnDestroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }

  updateMenuState() {
    if (!this.editor) return;

    const { state } = this.editor;
    const { selection } = state;

    // Vérifier si le noeud sélectionné est une image
    const node = (selection as any).node;
    const isImage = node && node.type.name === 'image';

    this.isVisible.set(isImage);

    if (isImage && node.attrs) {
      // Mettre à jour l'alignement actuel
      this.currentAlignment.set(node.attrs.alignment || 'center');

      // Calculer la position du menu
      this.calculatePosition();
    }
  }

  calculatePosition() {
    const { view } = this.editor;
    const { state } = view;
    const { selection } = state;

    // Trouver l'élément DOM de l'image
    const node = (selection as any).node;
    if (!node) return;

    const pos = selection.from;
    const dom = view.nodeDOM(pos) as HTMLElement;

    if (dom) {
      const rect = dom.getBoundingClientRect();
      const editorRect = view.dom.getBoundingClientRect();

      // Positionner le menu au-dessus de l'image, centré horizontalement
      this.position.set({
        top: `${rect.top + window.scrollY - 50}px`,
        left: `${rect.left + window.scrollX + rect.width / 2}px`,
      });
    } else {
      // Fallback: utiliser coordsAtPos
      const coords = view.coordsAtPos(pos);
      this.position.set({
        top: `${coords.top + window.scrollY - 50}px`,
        left: `${coords.left + window.scrollX}px`,
      });
    }
  }

  setAlignment(alignment: 'left' | 'center' | 'right') {
    if (!this.editor) return;

    const { state } = this.editor;
    const { selection } = state;
    const node = (selection as any).node;

    if (!node || node.type.name !== 'image') {
      return;
    }

    // Mettre à jour l'attribut de l'image
    const { from } = selection;
    const transaction = state.tr.setNodeMarkup(from, undefined, {
      ...node.attrs,
      alignment,
    });

    this.editor.view.dispatch(transaction);
    this.currentAlignment.set(alignment);

    // Le NodeView se charge automatiquement de mettre à jour l'affichage
    this.updateMenuState();
  }

  editImage() {
    if (!this.editor) return;

    const { state } = this.editor;
    const { selection } = state;
    const node = (selection as any).node;

    if (node && node.type.name === 'image') {
      const dialogRef = this.dialog.open(ImageInsertDialogComponent, {
        width: '700px',
        maxWidth: '90vw',
        maxHeight: '90vh',
        data: {
          mode: 'edit',
          currentSrc: node.attrs.src,
          currentAlt: node.attrs.alt,
          currentAlignment: node.attrs.alignment || 'center',
          currentCaption: node.attrs.caption || '',
        } as ImageInsertDialogData,
      });

      dialogRef.afterClosed().subscribe((result: ImageInsertDialogResult | null) => {
        if (result) {
          this.editor
            .chain()
            .focus()
            .updateAttributes('image', {
              src: result.src,
              alt: result.alt,
              alignment: result.alignment,
              caption: result.caption || '',
            })
            .run();
        }
      });
    }
  }

  deleteImage() {
    if (!this.editor) return;

    this.editor
      .chain()
      .focus()
      .deleteSelection()
      .run();
  }
}
