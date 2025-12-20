import { ColumnType, SelectChoice } from '../models/database.model';

/**
 * Classe utilitaire pour détecter automatiquement le type de colonnes CSV
 * Algorithme déterministe basé sur l'analyse des valeurs
 */
export class CsvTypeDetector {
  /**
   * Détecte le type de colonne en analysant les valeurs
   * Priorité : checkbox → date-range → date → number → email → url → select → text
   */
  static detectColumnType(values: string[]): {
    type: ColumnType;
    confidence: number;
    options?: { choices?: SelectChoice[] };
  } {
    // 1. Filtrer valeurs vides
    const nonEmpty = values.filter(v => v?.trim() !== '');
    if (nonEmpty.length === 0) {
      return { type: 'text', confidence: 0 };
    }

    // 2. CHECKBOX (100% match requis)
    if (this.isCheckbox(nonEmpty)) {
      return { type: 'checkbox', confidence: 1.0 };
    }

    // 3. DATE-RANGE (≥70% match requis) - Check before DATE
    const dateRangeConf = this.isDateRange(nonEmpty);
    if (dateRangeConf >= 0.7) {
      return { type: 'date-range', confidence: dateRangeConf };
    }

    // 4. DATE (≥80% match requis)
    const dateConf = this.isDate(nonEmpty);
    if (dateConf >= 0.8) {
      return { type: 'date', confidence: dateConf };
    }

    // 5. NUMBER (≥90% match requis)
    const numberConf = this.isNumber(nonEmpty);
    if (numberConf >= 0.9) {
      return { type: 'number', confidence: numberConf };
    }

    // 6. EMAIL (≥70% match requis)
    const emailConf = this.isEmail(nonEmpty);
    if (emailConf >= 0.7) {
      return { type: 'email', confidence: emailConf };
    }

    // 7. URL (≥70% match requis)
    const urlConf = this.isUrl(nonEmpty);
    if (urlConf >= 0.7) {
      return { type: 'url', confidence: urlConf };
    }

    // 8. SELECT (2-15 valeurs uniques)
    const unique = new Set(nonEmpty);
    if (unique.size >= 2 && unique.size <= 15) {
      return {
        type: 'select',
        confidence: 0.7,
        options: { choices: this.generateSelectChoices(unique) },
      };
    }

    // 9. TEXT (fallback)
    return { type: 'text', confidence: 0.5 };
  }

  /**
   * Vérifie si toutes les valeurs sont des booléens
   */
  private static isCheckbox(values: string[]): boolean {
    const valid = new Set([
      'true',
      'false',
      '1',
      '0',
      'yes',
      'no',
      'oui',
      'non',
      'x',
      '',
      'vrai',
      'faux',
    ]);

    return values.every(v => valid.has(v.toLowerCase().trim()));
  }

  /**
   * Calcule le pourcentage de valeurs qui matchent un format date
   */
  private static isDate(values: string[]): number {
    const patterns = [
      /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
      /^\d{2}\/\d{2}\/\d{4}$/, // DD/MM/YYYY
      /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY
      /^\d{4}\/\d{2}\/\d{2}$/, // YYYY/MM/DD
    ];

    let matches = 0;
    for (const v of values) {
      if (patterns.some(p => p.test(v)) || !isNaN(Date.parse(v))) {
        matches++;
      }
    }

    return matches / values.length;
  }

  /**
   * Calcule le pourcentage de valeurs qui matchent un format date-range
   * Formats supportés: "date - date", "date → date", "date to date", "date au date"
   */
  private static isDateRange(values: string[]): number {
    // Patterns pour détecter les séparateurs de plage
    const rangePatterns = [
      /→/,           // Arrow
      / - /,         // Dash with spaces
      / to /i,       // "to" (English)
      / au /i,       // "au" (French)
      / jusqu'au /i, // "jusqu'au" (French)
    ];

    let matches = 0;
    for (const v of values) {
      // Check if value contains a range separator
      const hasRangeSeparator = rangePatterns.some(p => p.test(v));
      if (hasRangeSeparator) {
        // Try to extract and validate both dates
        const parsed = this.parseDateRange(v);
        if (parsed.startDate || parsed.endDate) {
          matches++;
        }
      }
    }

    return matches / values.length;
  }

  /**
   * Parse a date range string into start and end dates
   */
  static parseDateRange(value: string): { startDate: string | null; endDate: string | null } {
    // Split by common separators
    const separators = ['→', ' - ', ' to ', ' au ', ' jusqu\'au '];
    let parts: string[] = [];

    for (const sep of separators) {
      if (value.includes(sep)) {
        parts = value.split(sep).map(p => p.trim());
        break;
      }
    }

    if (parts.length !== 2) {
      return { startDate: null, endDate: null };
    }

    const startDate = this.parseToIsoDate(parts[0]);
    const endDate = this.parseToIsoDate(parts[1]);

    return { startDate, endDate };
  }

  /**
   * Parse a date string to ISO format (YYYY-MM-DD)
   */
  private static parseToIsoDate(dateStr: string): string | null {
    if (!dateStr) return null;

    // Try common date formats
    const patterns: { regex: RegExp; format: (m: RegExpMatchArray) => string }[] = [
      // YYYY-MM-DD
      { regex: /^(\d{4})-(\d{2})-(\d{2})$/, format: m => `${m[1]}-${m[2]}-${m[3]}` },
      // DD/MM/YYYY
      { regex: /^(\d{2})\/(\d{2})\/(\d{4})$/, format: m => `${m[3]}-${m[2]}-${m[1]}` },
      // DD-MM-YYYY
      { regex: /^(\d{2})-(\d{2})-(\d{4})$/, format: m => `${m[3]}-${m[2]}-${m[1]}` },
      // D MMM YYYY (e.g., "1 avr. 2026")
      { regex: /^(\d{1,2})\s+(\w+)\.?\s+(\d{4})$/i, format: m => {
        const monthMap: Record<string, string> = {
          'janv': '01', 'jan': '01', 'janvier': '01',
          'févr': '02', 'fev': '02', 'février': '02',
          'mars': '03', 'mar': '03',
          'avr': '04', 'avril': '04',
          'mai': '05',
          'juin': '06', 'jun': '06',
          'juil': '07', 'juillet': '07', 'jul': '07',
          'août': '08', 'aout': '08', 'aug': '08',
          'sept': '09', 'sep': '09', 'septembre': '09',
          'oct': '10', 'octobre': '10',
          'nov': '11', 'novembre': '11',
          'déc': '12', 'dec': '12', 'décembre': '12',
        };
        const monthStr = m[2].toLowerCase().replace('.', '');
        const month = monthMap[monthStr];
        if (!month) return '';
        const day = m[1].padStart(2, '0');
        return `${m[3]}-${month}-${day}`;
      }},
    ];

    for (const { regex, format } of patterns) {
      const match = dateStr.match(regex);
      if (match) {
        const result = format(match);
        if (result && !isNaN(Date.parse(result))) {
          return result;
        }
      }
    }

    // Fallback: try native Date parsing
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }

    return null;
  }

  /**
   * Calcule le pourcentage de valeurs qui sont des nombres valides
   */
  private static isNumber(values: string[]): number {
    let matches = 0;

    for (const v of values) {
      // Nettoyer espaces et virgules, remplacer virgule décimale par point
      const cleaned = v.replace(/[\s]/g, '').replace(/,/g, '.');

      if (!isNaN(parseFloat(cleaned)) && isFinite(parseFloat(cleaned))) {
        matches++;
      }
    }

    return matches / values.length;
  }

  /**
   * Calcule le pourcentage de valeurs qui matchent un format email
   */
  private static isEmail(values: string[]): number {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return values.filter(v => regex.test(v)).length / values.length;
  }

  /**
   * Calcule le pourcentage de valeurs qui matchent un format URL
   */
  private static isUrl(values: string[]): number {
    const regex =
      /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
    return values.filter(v => regex.test(v)).length / values.length;
  }

  /**
   * Génère des SelectChoice depuis un ensemble de valeurs uniques
   * Assigne automatiquement des couleurs Tailwind
   */
  private static generateSelectChoices(unique: Set<string>): SelectChoice[] {
    const colors = [
      'bg-gray-200',
      'bg-blue-200',
      'bg-green-200',
      'bg-yellow-200',
      'bg-red-200',
      'bg-purple-200',
      'bg-pink-200',
      'bg-orange-200',
    ];

    return Array.from(unique).map((label, i) => ({
      id: this.generateShortId(),
      label,
      color: colors[i % colors.length],
    }));
  }

  /**
   * Génère un ID court (8 caractères) pour les SelectChoice
   */
  private static generateShortId(): string {
    return crypto.randomUUID().split('-')[0];
  }

  /**
   * Normalise un nom de colonne pour éviter les doublons
   * Ajoute un suffixe _2, _3, etc. si le nom existe déjà
   */
  static normalizeColumnName(
    name: string,
    existingNames: string[]
  ): string {
    let normalized = name.trim();
    if (!normalized) {
      normalized = 'Colonne';
    }

    // Si pas de doublon, retourner tel quel
    if (!existingNames.includes(normalized)) {
      return normalized;
    }

    // Chercher un suffixe disponible
    let counter = 2;
    while (existingNames.includes(`${normalized}_${counter}`)) {
      counter++;
    }

    return `${normalized}_${counter}`;
  }
}
