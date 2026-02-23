export type RsvpStatus = 'accepted' | 'declined' | 'tentative' | 'needsAction';

export interface EventAttendee {
  email: string;
  displayName?: string;
  userId?: string;
  rsvpStatus: RsvpStatus;
  isOrganizer: boolean;
  isOptional: boolean;
}

export interface EventGuestPermissions {
  guestsCanModify: boolean;
  guestsCanInviteOthers: boolean;
  guestsCanSeeOtherGuests: boolean;
}

export const DEFAULT_GUEST_PERMISSIONS: EventGuestPermissions = {
  guestsCanModify: false,
  guestsCanInviteOthers: true,
  guestsCanSeeOtherGuests: true,
};
