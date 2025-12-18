import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Runtime Environment Configuration
 *
 * This interface extends the build-time environment with runtime configuration
 * injected via the Docker entrypoint script (window.__env)
 */
interface RuntimeEnvironment {
  supabaseUrl: string;
  supabaseAnonKey: string;
  production: boolean;
  projectName: string;
}

/**
 * Augment Window interface to include runtime environment
 */
declare global {
  interface Window {
    __env?: RuntimeEnvironment;
  }
}

/**
 * Environment Service
 *
 * Provides access to environment configuration with runtime override support.
 * In Docker/production, values are injected at container startup via entrypoint.sh
 * In development, falls back to compile-time environment.ts
 *
 * Usage:
 * ```typescript
 * constructor(private envService: EnvironmentService) {
 *   const apiUrl = this.envService.supabaseUrl;
 * }
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class EnvironmentService {

  /**
   * Get Supabase API URL
   * Priority: window.__env.supabaseUrl > environment.supabaseUrl
   */
  get supabaseUrl(): string {
    return window.__env?.supabaseUrl || environment.supabaseUrl;
  }

  /**
   * Get Supabase Anonymous Key (public key for client-side auth)
   * Priority: window.__env.supabaseAnonKey > environment.supabaseAnonKey
   */
  get supabaseAnonKey(): string {
    return window.__env?.supabaseAnonKey || environment.supabaseAnonKey;
  }

  /**
   * Check if running in production mode
   * Priority: window.__env.production > environment.production
   */
  get production(): boolean {
    return window.__env?.production ?? environment.production;
  }

  /**
   * Get project name
   * Priority: window.__env.projectName > environment.projectName
   */
  get projectName(): string {
    return window.__env?.projectName || environment.projectName;
  }

  /**
   * Check if runtime environment is available (Docker deployment)
   */
  get isRuntimeConfigAvailable(): boolean {
    return typeof window.__env !== 'undefined';
  }

  /**
   * Get all environment configuration as object
   */
  getConfig(): RuntimeEnvironment {
    return {
      supabaseUrl: this.supabaseUrl,
      supabaseAnonKey: this.supabaseAnonKey,
      production: this.production,
      projectName: this.projectName
    };
  }

  /**
   * Log current environment configuration (development only)
   */
  logConfig(): void {
    if (!this.production) {
      console.group('🔧 Environment Configuration');
      console.log('Runtime config available:', this.isRuntimeConfigAvailable);
      console.log('Supabase URL:', this.supabaseUrl);
      console.log('Production mode:', this.production);
      console.log('Project name:', this.projectName);
      console.log('Anon key (first 20 chars):', this.supabaseAnonKey.substring(0, 20) + '...');
      console.groupEnd();
    }
  }
}
