/* eslint-disable @typescript-eslint/no-explicit-any */

// Module declarations for Cytoscape extensions
declare module 'cytoscape-dagre' {
  const ext: (cytoscape: any) => void;
  export = ext;
}

declare module 'cytoscape-undo-redo' {
  const ext: (cytoscape: any) => void;
  export = ext;
}

declare module 'cytoscape-expand-collapse' {
  const ext: (cytoscape: any) => void;
  export = ext;
}

declare module 'cytoscape-context-menus' {
  const ext: (cytoscape: any) => void;
  export = ext;
}

declare module 'cytoscape-navigator' {
  const ext: (cytoscape: any) => void;
  export = ext;
}
