import { Image } from '@tiptap/extension-image';

/**
 * Extension d'image améliorée pour Tiptap
 * Utilise un NodeView personnalisé pour gérer l'alignement de manière réactive
 * Compatible avec l'option resize de Tiptap
 */
export const EnhancedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),

      alignment: {
        default: 'center',
        parseHTML: (element: HTMLElement) => {
          // Chercher l'attribut sur le conteneur parent ou sur l'image
          const container = element.closest('[data-node-view-wrapper]') as HTMLElement;
          if (container) {
            if (container.classList.contains('image-align-left')) return 'left';
            if (container.classList.contains('image-align-right')) return 'right';
            if (container.classList.contains('image-align-center')) return 'center';
          }
          return element.getAttribute('data-alignment') || 'center';
        },
        renderHTML: (attributes: any) => {
          return {
            'data-alignment': attributes['alignment'] || 'center',
          };
        },
      },

      caption: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-caption') || '',
        renderHTML: (attributes: any) => {
          return {
            'data-caption': attributes['caption'] || '',
          };
        },
      },
    };
  },

  addNodeView() {
    return ({ node, HTMLAttributes }: any) => {
      const container = document.createElement('div');
      container.setAttribute('data-node-view-wrapper', '');
      container.contentEditable = 'false';

      // Appliquer la classe d'alignement
      const alignment = node.attrs.alignment || 'center';
      container.classList.add(`image-align-${alignment}`);

      // Créer l'élément image
      const img = document.createElement('img');
      img.classList.add('tiptap-image');

      // Appliquer les attributs HTML
      Object.entries(HTMLAttributes).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          img.setAttribute(key, String(value));
        }
      });

      // Appliquer les attributs du node
      if (node.attrs.src) img.setAttribute('src', node.attrs.src);
      if (node.attrs.alt) img.setAttribute('alt', node.attrs.alt);
      if (node.attrs.title) img.setAttribute('title', node.attrs.title);
      if (node.attrs.width) img.style.width = `${node.attrs.width}px`;
      if (node.attrs.height) img.style.height = `${node.attrs.height}px`;

      container.appendChild(img);

      // Ajouter la légende si présente
      if (node.attrs.caption) {
        const caption = document.createElement('div');
        caption.classList.add('tiptap-image-caption');
        caption.textContent = node.attrs.caption;
        container.appendChild(caption);
      }

      return {
        dom: container,
        contentDOM: null,

        update: (updatedNode: any) => {
          if (updatedNode.type.name !== 'image') {
            return false;
          }

          // Mettre à jour la classe d'alignement
          const newAlignment = updatedNode.attrs.alignment || 'center';
          container.className = ''; // Reset classes
          container.setAttribute('data-node-view-wrapper', '');
          container.classList.add(`image-align-${newAlignment}`);

          // Mettre à jour les attributs de l'image
          const currentImg = container.querySelector('img');
          if (currentImg) {
            if (updatedNode.attrs.src) currentImg.setAttribute('src', updatedNode.attrs.src);
            if (updatedNode.attrs.alt) currentImg.setAttribute('alt', updatedNode.attrs.alt);
            if (updatedNode.attrs.title) currentImg.setAttribute('title', updatedNode.attrs.title);
            if (updatedNode.attrs.width) currentImg.style.width = `${updatedNode.attrs.width}px`;
            if (updatedNode.attrs.height) currentImg.style.height = `${updatedNode.attrs.height}px`;
          }

          // Mettre à jour la légende
          const existingCaption = container.querySelector('.tiptap-image-caption');
          if (updatedNode.attrs.caption) {
            if (existingCaption) {
              existingCaption.textContent = updatedNode.attrs.caption;
            } else {
              const caption = document.createElement('div');
              caption.classList.add('tiptap-image-caption');
              caption.textContent = updatedNode.attrs.caption;
              container.appendChild(caption);
            }
          } else if (existingCaption) {
            existingCaption.remove();
          }

          return true;
        },
      };
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),

      setImageAlignment: (alignment: 'left' | 'center' | 'right') => ({ commands }: any) => {
        return commands.updateAttributes('image', { alignment });
      },

      setImageCaption: (caption: string) => ({ commands }: any) => {
        return commands.updateAttributes('image', { caption });
      },
    };
  },
});
