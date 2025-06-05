import { Component, signal, computed, input, output, ElementRef, ViewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-tag-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="tag-input-container">
      <label [for]="inputId" class="tag-label" *ngIf="label()">
        {{ label() }}
      </label>
      
      <div class="tag-input-wrapper" [class.focused]="isFocused()" [class.disabled]="disabled()">
        <!-- Tags existants -->
        <div class="tags-list" *ngIf="selectedTags().length > 0">
          <span 
            *ngFor="let tag of selectedTags(); trackBy: trackByTag"
            class="tag-item">
            {{ tag }}
            <button 
              type="button"
              class="tag-remove"
              (click)="removeTag(tag)"
              [disabled]="disabled()"
              title="Supprimer">
              ×
            </button>
          </span>
        </div>

        <!-- Input pour nouveau tag -->
        <div class="input-wrapper">
          <input
            #tagInput
            [id]="inputId"
            type="text"
            class="tag-input"
            [(ngModel)]="inputValue"
            (input)="onInputChange()"
            (keydown)="onKeyDown($event)"
            (focus)="onFocus()"
            (blur)="onBlur()"
            [placeholder]="placeholder()"
            [disabled]="disabled()"
            autocomplete="off">
        </div>
      </div>

      <!-- Message d'aide -->
      <div class="help-text" *ngIf="helpText()">
        {{ helpText() }}
      </div>

      <!-- Message d'erreur -->
      <div class="error-message" *ngIf="errorMessage()" role="alert">
        {{ errorMessage() }}
      </div>
    </div>
  `,
  styles: [`
    .tag-input-container {
      position: relative;
      width: 100%;
    }

    .tag-label {
      display: block;
      margin-bottom: 0.5rem;
      font-size: 0.875rem;
      font-weight: 600;
      color: #374151;
    }

    .tag-input-wrapper {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      background: white;
      min-height: 2.75rem;
      transition: border-color 0.2s, box-shadow 0.2s;
      cursor: text;
    }

    .tag-input-wrapper:hover {
      border-color: #d1d5db;
    }

    .tag-input-wrapper.focused {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .tags-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
      flex: 1;
      min-width: 0;
    }

    .tag-item {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.5rem;
      background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
      color: #1d4ed8;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 500;
      border: 1px solid #bfdbfe;
    }

    .tag-remove {
      background: none;
      border: none;
      color: #1d4ed8;
      cursor: pointer;
      padding: 0;
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      font-weight: bold;
      transition: all 0.2s;
    }

    .tag-remove:hover {
      background: #bfdbfe;
      color: #1e40af;
    }

    .input-wrapper {
      flex: 1;
      min-width: 120px;
    }

    .tag-input {
      width: 100%;
      border: none;
      outline: none;
      background: transparent;
      font-size: 1rem;
      color: #374151;
    }

    .help-text {
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: #6b7280;
    }

    .error-message {
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: #ef4444;
    }
  `]
})
export class TagInputComponent {
  @ViewChild('tagInput') tagInputRef!: ElementRef<HTMLInputElement>;

  // Inputs
  label = input<string>('');
  placeholder = input<string>('Ajouter un tag...');
  helpText = input<string>('Appuyez sur Entrée ou virgule pour ajouter un tag');
  disabled = input<boolean>(false);
  maxTags = input<number>(10);

  // Outputs
  tagsChange = output<string[]>();

  // État interne
  selectedTags = signal<string[]>([]);
  inputValue = signal('');
  isFocused = signal(false);
  errorMessage = signal<string>('');

  // IDs uniques pour l'accessibilité
  inputId = `tag-input-${Math.random().toString(36).substr(2, 9)}`;

  onInputChange() {
    this.clearError();
  }

  onKeyDown(event: KeyboardEvent) {
    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        this.addCurrentInput();
        break;
        
      case ',':
        event.preventDefault();
        this.addCurrentInput();
        break;
        
      case 'Backspace':
        if (this.inputValue() === '' && this.selectedTags().length > 0) {
          this.removeLastTag();
        }
        break;
    }
  }

  onFocus() {
    this.isFocused.set(true);
  }

  onBlur() {
    this.isFocused.set(false);
  }

  addCurrentInput() {
    const value = this.inputValue().trim();
    if (value) {
      this.addTag(value);
    }
  }

  addTag(tag: string) {
    const normalizedTag = tag.toLowerCase().trim();
    
    if (!normalizedTag) return;

    if (this.selectedTags().includes(normalizedTag)) {
      this.setError('Ce tag existe déjà');
      return;
    }

    if (this.selectedTags().length >= this.maxTags()) {
      this.setError(`Maximum ${this.maxTags()} tags autorisés`);
      return;
    }

    this.selectedTags.update(tags => [...tags, normalizedTag]);
    this.inputValue.set('');
    this.clearError();
    this.emitTagsChange();
  }

  removeTag(tag: string) {
    this.selectedTags.update(tags => tags.filter(t => t !== tag));
    this.emitTagsChange();
  }

  removeLastTag() {
    const tags = this.selectedTags();
    if (tags.length > 0) {
      this.removeTag(tags[tags.length - 1]);
    }
  }

  private setError(message: string) {
    this.errorMessage.set(message);
    setTimeout(() => this.clearError(), 3000);
  }

  private clearError() {
    this.errorMessage.set('');
  }

  private emitTagsChange() {
    this.tagsChange.emit(this.selectedTags());
  }

  // Méthodes publiques
  setTags(tags: string[]) {
    this.selectedTags.set(tags);
  }

  getTags(): string[] {
    return this.selectedTags();
  }

  trackByTag(index: number, tag: string): string {
    return tag;
  }
} 