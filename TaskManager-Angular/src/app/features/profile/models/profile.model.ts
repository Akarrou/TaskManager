export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateProfileRequest {
  full_name?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
