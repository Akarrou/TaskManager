import { RsvpStatus } from '../../features/calendar/models/attendee.model';

export function getInitials(name: string | undefined, email: string): string {
  if (name) {
    return name
      .split(' ')
      .filter(n => n.length > 0)
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }
  return email[0].toUpperCase();
}

export function getRsvpIcon(status: RsvpStatus): string {
  switch (status) {
    case 'accepted': return 'check_circle';
    case 'declined': return 'cancel';
    case 'tentative': return 'help';
    case 'needsAction': return 'schedule';
  }
}

export function getRsvpLabel(status: RsvpStatus): string {
  switch (status) {
    case 'accepted': return 'Accepté';
    case 'declined': return 'Refusé';
    case 'tentative': return 'Peut-être';
    case 'needsAction': return 'En attente';
  }
}
