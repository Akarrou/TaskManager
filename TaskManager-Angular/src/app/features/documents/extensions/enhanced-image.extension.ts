import { Image } from '@tiptap/extension-image';

/**
 * Extension d'image améliorée pour Tiptap
 * Ajoute les attributs alignment et caption tout en conservant
 * le NodeView par défaut de TipTap (avec resize)
 */
export const EnhancedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),

      alignment: {
        default: 'center',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-alignment') || 'center',
        renderHTML: (attributes: { alignment?: string }) => ({
          'data-alignment': attributes.alignment || 'center',
        }),
      },

      caption: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-caption') || '',
        renderHTML: (attributes: { caption?: string }) => ({
          'data-caption': attributes.caption || '',
        }),
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),

      setImageAlignment:
        (alignment: 'left' | 'center' | 'right') =>
        ({ commands }: { commands: any }) => {
          return commands.updateAttributes('image', { alignment });
        },

      setImageCaption:
        (caption: string) =>
        ({ commands }: { commands: any }) => {
          return commands.updateAttributes('image', { caption });
        },
    };
  },
});
