declare module 'react-markdown' {
  import React from 'react';
  const ReactMarkdown: React.ComponentType<{
    children?: string | null;
    remarkPlugins?: any[];
    className?: string;
    components?: Record<string, React.ComponentType<any>>;
    [key: string]: any;
  }>;
  export default ReactMarkdown;
}

declare module 'remark-gfm' {
  const remarkGfm: any;
  export default remarkGfm;
}
