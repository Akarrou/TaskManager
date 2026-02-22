import { Pipe, PipeTransform } from '@angular/core';
import { RRule } from 'rrule';

@Pipe({ name: 'rruleToText', standalone: true })
export class RruleToTextPipe implements PipeTransform {
  transform(rruleStr: string | null | undefined): string {
    if (!rruleStr) return '';
    try {
      const rule = RRule.fromString(rruleStr);
      return rule.toText();
    } catch {
      return rruleStr;
    }
  }
}
