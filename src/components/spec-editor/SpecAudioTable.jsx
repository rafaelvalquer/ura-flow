import { Plus, Trash2, Volume2 } from 'lucide-react';
import { collectPromptUsage, normalizeKey } from '../../services/specEditorProject.js';

export default function SpecAudioTable({ state, onAdd, onUpdate, onDelete }) {
  const usage = collectPromptUsage(state);

  return (
    <section className="spec-editor-audio-panel">
      <header>
        <div>
          <span className="spec-editor-eyebrow">Catálogo do estado</span>
          <h2>Gravações e prompts</h2>
          <p>Os nomes cadastrados aparecem como sugestões na coluna “E ouve o prompt...”.</p>
        </div>
        <button type="button" className="spec-editor-primary-button" onClick={onAdd}>
          <Plus size={16} /> Adicionar prompt
        </button>
      </header>

      <div className="spec-editor-audio-table-shell">
        <table className="spec-editor-audio-table">
          <thead>
            <tr>
              <th>Nome da gravação</th>
              <th>Texto</th>
              <th>Contexto para a atriz</th>
              <th>Informações para desenvolvimento</th>
              <th>Marcação de B.I.</th>
              <th>Uso</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(state?.audioCatalog ?? []).map((audio) => {
              const uses = usage.get(normalizeKey(audio.fileName)) ?? 0;
              return (
                <tr key={audio.id}>
                  <td>
                    <input value={audio.fileName} onChange={(event) => onUpdate(audio.id, { fileName: event.target.value })} />
                  </td>
                  <td>
                    <textarea rows={2} value={audio.text} onChange={(event) => onUpdate(audio.id, { text: event.target.value })} />
                  </td>
                  <td>
                    <textarea rows={2} value={audio.context || ''} onChange={(event) => onUpdate(audio.id, { context: event.target.value })} />
                  </td>
                  <td>
                    <textarea rows={2} value={audio.development || ''} onChange={(event) => onUpdate(audio.id, { development: event.target.value })} />
                  </td>
                  <td>
                    <textarea rows={2} value={audio.bi || ''} onChange={(event) => onUpdate(audio.id, { bi: event.target.value })} />
                  </td>
                  <td>
                    <span className={`spec-editor-usage-badge ${uses ? 'is-used' : ''}`}>
                      <Volume2 size={13} /> {uses}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="spec-editor-icon-button is-danger" title="Excluir prompt" onClick={() => onDelete(audio.id)}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!state?.audioCatalog?.length && (
          <div className="spec-editor-empty-table">
            <strong>Nenhum prompt cadastrado.</strong>
            <span>Adicione as gravações que serão referenciadas pelas regras deste estado.</span>
          </div>
        )}
      </div>
    </section>
  );
}
