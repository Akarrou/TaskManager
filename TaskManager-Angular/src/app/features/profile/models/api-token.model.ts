/**
 * API Token Model
 * Represents a user-generated API token for MCP authentication
 */

export interface ApiToken {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  is_active: boolean;
}

export interface CreateTokenRequest {
  name: string;
  scopes?: string[];
  expires_at?: string | null;
}

export interface CreateTokenResponse {
  success: boolean;
  token?: string;
  id?: string;
  name?: string;
  prefix?: string;
  scopes?: string[];
  expires_at?: string | null;
  created_at?: string;
  error?: string;
}

export interface RevokeTokenResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export const AVAILABLE_SCOPES = [
  { value: 'all', label: 'Tous les acces', description: 'Acces complet a toutes les ressources' },
  { value: 'read', label: 'Lecture seule', description: 'Lecture des projets, taches et documents' },
  { value: 'write', label: 'Ecriture', description: 'Creation et modification des ressources' },
  { value: 'projects', label: 'Projets', description: 'Gestion des projets uniquement' },
  { value: 'tasks', label: 'Taches', description: 'Gestion des taches uniquement' },
  { value: 'documents', label: 'Documents', description: 'Gestion des documents uniquement' },
] as const;

export const EXPIRATION_OPTIONS = [
  { value: null, label: 'Jamais' },
  { value: 7, label: '7 jours' },
  { value: 30, label: '30 jours' },
  { value: 90, label: '90 jours' },
  { value: 365, label: '1 an' },
] as const;
