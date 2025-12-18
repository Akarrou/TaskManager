import { ColumnType, SelectChoice } from '../models/database.model';

/**
 * Classe utilitaire pour détecter automatiquement le type de colonnes CSV
 * Algorithme déterministe basé sur l'analyse des valeurs
 */
export class CsvTypeDetector {
  /**
   * Détecte le type de colonne en analysant les valeurs
   * Priorité : checkbox → date → number → email → url → select → text
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

    // 3. DATE (≥80% match requis)
    const dateConf = this.isDate(nonEmpty);
    if (dateConf >= 0.8) {
      return { type: 'date', confidence: dateConf };
    }

    // 4. NUMBER (≥90% match requis)
    const numberConf = this.isNumber(nonEmpty);
    if (numberConf >= 0.9) {
      return { type: 'number', confidence: numberConf };
    }

    // 5. EMAIL (≥70% match requis)
    const emailConf = this.isEmail(nonEmpty);
    if (emailConf >= 0.7) {
      return { type: 'email', confidence: emailConf };
    }

    // 6. URL (≥70% match requis)
    const urlConf = this.isUrl(nonEmpty);
    if (urlConf >= 0.7) {
      return { type: 'url', confidence: urlConf };
    }

    // 7. SELECT (2-15 valeurs uniques)
    const unique = new Set(nonEmpty);
    if (unique.size >= 2 && unique.size <= 15) {
      return {
        type: 'select',
        confidence: 0.7,
        options: { choices: this.generateSelectChoices(unique) },
      };
    }

    // 8. TEXT (fallback)
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
