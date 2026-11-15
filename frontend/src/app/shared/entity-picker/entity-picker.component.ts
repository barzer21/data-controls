import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MetadataEntity } from '../../core/api/api.models';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
@Component({
  selector: 'app-entity-picker',
  imports: [UiIconComponent],
  templateUrl: './entity-picker.component.html',
  styleUrl: './entity-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EntityPickerComponent {
  readonly entities = input.required<readonly MetadataEntity[]>();
  readonly selected = input.required<string>();
  readonly pending = input<string | null>(null);
  readonly selectedChange = output<string>();
}
