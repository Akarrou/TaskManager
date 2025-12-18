import { Component, input, output, signal, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';

export type PropertyType = 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'url' | 'email' | 'multiselect';

export interface CustomProperty {
  id: string;
  name: string;
  type: PropertyType;
  value: any;
  options?: string[]; // For select/multiselect types
  required?: boolean;
  placeholder?: string;
}

interface PropertyTypeOption {
  value: PropertyType;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-custom-properties',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatCheckboxModule,
    MatTooltipModule,
    MatMenuModule
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomPropertiesComponent),
      multi: true
    }
  ],
  templateUrl: './custom-properties.component.html',
  styleUrls: ['./custom-properties.component.scss']
})
export class CustomPropertiesComponent implements ControlValueAccessor {
  allowAddProperty = input<boolean>(true);
  allowRemoveProperty = input<boolean>(true);
  allowEditPropertyDefinition = input<boolean>(false);

  propertiesChange = output<CustomProperty[]>();

  properties = signal<CustomProperty[]>([]);
  isAddingProperty = signal<boolean>(false);
  newPropertyName = signal<string>('');
  newPropertyType = signal<PropertyType>('text');
  newPropertyOptions = signal<string>('');

  propertyTypes: PropertyTypeOption[] = [
    { value: 'text', label: 'Texte', icon: 'text_fields' },
    { value: 'number', label: 'Nombre', icon: 'tag' },
    { value: 'date', label: 'Date', icon: 'event' },
    { value: 'checkbox', label: 'Case à cocher', icon: 'check_box' },
    { value: 'select', label: 'Sélection', icon: 'arrow_drop_down_circle' },
    { value: 'multiselect', label: 'Sélection multiple', icon: 'checklist' },
    { value: 'url', label: 'URL', icon: 'link' },
    { value: 'email', label: 'Email', icon: 'email' }
  ];

  private onChange: (value: CustomProperty[]) => void = () => {};
  private onTouched: () => void = () => {};

  // ControlValueAccessor implementation
  writeValue(value: CustomProperty[]): void {
    this.properties.set(value || []);
  }

  registerOnChange(fn: (value: CustomProperty[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  toggleAddProperty() {
    this.isAddingProperty.update(v => !v);
    if (!this.isAddingProperty()) {
      this.resetNewPropertyForm();
    }
  }

  private resetNewPropertyForm() {
    this.newPropertyName.set('');
    this.newPropertyType.set('text');
    this.newPropertyOptions.set('');
  }

  addProperty() {
    const name = this.newPropertyName().trim();
    if (!name) return;

    const type = this.newPropertyType();
    const options = type === 'select' || type === 'multiselect'
      ? this.newPropertyOptions().split(',').map(o => o.trim()).filter(o => o)
      : undefined;

    const newProperty: CustomProperty = {
      id: `prop_${Date.now()}`,
      name,
      type,
      value: this.getDefaultValue(type),
      options
    };

    this.properties.update(props => [...props, newProperty]);
    this.emitChanges();
    this.resetNewPropertyForm();
    this.isAddingProperty.set(false);
  }

  private getDefaultValue(type: PropertyType): any {
    switch (type) {
      case 'checkbox': return false;
      case 'number': return null;
      case 'date': return null;
      case 'multiselect': return [];
      default: return '';
    }
  }

  updatePropertyValue(property: CustomProperty, value: any) {
    this.properties.update(props =>
      props.map(p => p.id === property.id ? { ...p, value } : p)
    );
    this.emitChanges();
  }

  removeProperty(property: CustomProperty) {
    this.properties.update(props => props.filter(p => p.id !== property.id));
    this.emitChanges();
  }

  private emitChanges() {
    const props = this.properties();
    this.onChange(props);
    this.propertiesChange.emit(props);
  }

  getPropertyIcon(type: PropertyType): string {
    return this.propertyTypes.find(t => t.value === type)?.icon || 'label';
  }

  trackByProperty(index: number, property: CustomProperty): string {
    return property.id;
  }

  onNewPropertyNameChange(value: string) {
    this.newPropertyName.set(value);
  }

  onNewPropertyTypeChange(value: PropertyType) {
    this.newPropertyType.set(value);
  }

  onNewPropertyOptionsChange(value: string) {
    this.newPropertyOptions.set(value);
  }

  isSelectType(): boolean {
    const type = this.newPropertyType();
    return type === 'select' || type === 'multiselect';
  }

  onMultiselectChange(property: CustomProperty, option: string, checked: boolean) {
    const currentValue = property.value || [];
    const newValue = checked
      ? [...currentValue, option]
      : currentValue.filter((v: string) => v !== option);
    this.updatePropertyValue(property, newValue);
  }
}
