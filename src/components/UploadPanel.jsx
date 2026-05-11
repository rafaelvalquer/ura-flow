import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

export default function UploadPanel({ onFileSelected, isLoading }) {
  const inputRef = useRef(null);
  const [isDragging, setDragging] = useState(false);

  const handleFiles = (files) => {
    const file = files?.[0];
    if (file && file.name.toLowerCase().endsWith('.xlsx')) onFileSelected(file);
  };

  return (
    <section
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
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept=".xlsx"
        onChange={(event) => handleFiles(event.target.files)}
      />
      <UploadCloud size={24} />
      <strong>Enviar spec Excel</strong>
      <span>Arraste um arquivo .xlsx ou selecione no computador.</span>
      <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()} disabled={isLoading}>
        {isLoading ? 'Processando...' : 'Selecionar arquivo'}
      </button>
    </section>
  );
}
