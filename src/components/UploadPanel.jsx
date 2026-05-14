import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import AccordionSection from './AccordionSection.jsx';

export default function UploadPanel({ onFileSelected, isLoading, isOpen = true, onToggle }) {
  const inputRef = useRef(null);
  const [isDragging, setDragging] = useState(false);

  const handleFiles = (files) => {
    const file = files?.[0];
    if (file && file.name.toLowerCase().endsWith('.xlsx')) onFileSelected(file);
  };

  return (
    <>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".xlsx"
        onChange={(event) => handleFiles(event.target.files)}
      />
      <AccordionSection
        title="Enviar spec Excel"
        className="upload-accordion"
        isOpen={isOpen}
        onToggle={onToggle}
        collapsedContent={(
          <button type="button" className="secondary-button full-width-button" onClick={() => inputRef.current?.click()} disabled={isLoading}>
            {isLoading ? 'Processando...' : 'Selecionar arquivo'}
          </button>
        )}
      >
        <div
          className={`upload-panel ${isDragging ? 'is-dragging' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            handleFiles(event.dataTransfer.files);
          }}
        >
          <UploadCloud size={24} />
          <strong>Enviar spec Excel</strong>
          <span>Arraste um arquivo .xlsx ou selecione no computador.</span>
          <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()} disabled={isLoading}>
            {isLoading ? 'Processando...' : 'Selecionar arquivo'}
          </button>
        </div>
      </AccordionSection>
    </>
  );
}
