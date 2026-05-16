// Preview Editor — renders non-code files (images, PDFs, etc.) in the editor area (Phase D)
import React from 'react';

// Supported preview file extensions
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp']);
const PDF_EXTENSIONS = new Set(['pdf']);
const TEXT_EXTENSIONS = new Set(['txt', 'log', 'csv', 'ini', 'cfg']);

// Determine the preview type for a given file URI/extension
export function getPreviewType(uri: string): 'image' | 'pdf' | 'text' | null {
  const ext = uri.split('.').pop()?.toLowerCase() ?? '';
  
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (PDF_EXTENSIONS.has(ext)) return 'pdf';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  
  return null; // No preview — use Monaco editor instead
}

// Image preview component — renders image files in the editor area
function ImageViewer({ src, filename }: { src: string; filename: string }) {
  const [error, setError] = React.useState(false);
  
  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-[#6c7086]">
        <div className="text-center space-y-2">
          <div className="text-4xl">🖼️</div>
          <p className="text-sm">Failed to load image preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full bg-[#1e1e2e] overflow-auto p-4">
      <img 
        src={src} 
        alt={filename} 
        className="max-w-full max-h-full object-contain rounded shadow-lg"
        onError={() => setError(true)}
      />
    </div>
  );
}

// PDF preview component — renders PDF files in the editor area using iframe
function PdfViewer({ src, filename }: { src: string; filename: string }) {
  const [error, setError] = React.useState(false);
  
  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-[#6c7086]">
        <div className="text-center space-y-2">
          <div className="text-4xl">📄</div>
          <p className="text-sm">Failed to load PDF preview — download instead</p>
          <a 
            href={src} 
            download={filename}
            className="inline-block px-3 py-1.5 rounded bg-[#cba6f7] hover:bg-[#b4befe] text-black text-xs font-semibold transition"
          >
            Download PDF
          </a>
        </div>
      </div>
    );
  }

  return (
    <iframe 
      src={src} 
      title={filename}
      className="w-full h-full border-none"
      onError={() => setError(true)}
    />
  );
}

// Text preview component — renders plain text files in a simple editor-like view
function TextViewer({ content, filename }: { content: string; filename: string }) {
  return (
    <div className="h-full bg-[#1e1e2e] overflow-auto">
      <pre className="p-4 font-mono text-sm whitespace-pre-wrap">{content}</pre>
    </div>
  );
}

// Preview editor props interface — used by the parent component to determine preview type and pass data
export interface PreviewEditorProps {
  /** The URI of the file being previewed */
  uri: string;
  /** File content (used for text previews) */
  content?: string;
  /** Optional source URL (for image/PDF URLs from remote sources) */
  src?: string;
}

// Main PreviewEditor component — renders non-code files based on their extension type
export const PreviewEditor: React.FC<PreviewEditorProps> = ({ uri, content, src }) => {
  const previewType = getPreviewType(uri);
  
  // No preview available — show fallback message
  if (!previewType) {
    return (
      <div className="flex items-center justify-center h-full text-[#6c7086]">
        <div className="text-center space-y-2">
          <div className="text-4xl">📄</div>
          <p className="text-sm">No preview available for this file type</p>
        </div>
      </div>
    );
  }

  // Render based on preview type
  switch (previewType) {
    case 'image':
      return <ImageViewer src={src || ''} filename={uri.split('/').pop() || uri} />;
    
    case 'pdf':
      return <PdfViewer src={src || ''} filename={uri.split('/').pop() || uri} />;
    
    case 'text':
      return <TextViewer content={content || ''} filename={uri.split('/').pop() || uri} />;
  }
};