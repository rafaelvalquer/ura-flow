import { useEffect, useMemo, useRef, useState } from 'react';
import NiceSnippetCodeMirror from '../../../components/NiceSnippetCodeMirror.jsx';
import {
  SNIPPET_BLOCKS,
  SNIPPET_THEME_STORAGE_KEY,
  SNIPPET_VARIABLES,
} from '../constants/niceScriptConstants.js';
import { formatNiceSnippet, validateNiceSnippetCode } from '../services/niceSnippetTools.js';

export default function SnippetStudio({ action, onCancel, onApply }) {
  const [code, setCode] = useState(action.parameters?.[0] ?? '');
  const [theme, setTheme] = useState(() => localStorage.getItem(SNIPPET_THEME_STORAGE_KEY) || 'light');
  const editorRef = useRef(null);
  const diagnostics = useMemo(() => validateNiceSnippetCode(code), [code]);

  useEffect(() => {
    localStorage.setItem(SNIPPET_THEME_STORAGE_KEY, theme);
  }, [theme]);

  function insertBlock(block) {
    editorRef.current?.insertText(block.code);
  }

  return (
    <div className="nice-wizard-backdrop" role="presentation">
      <section className="nice-snippet-studio" role="dialog" aria-modal="true" aria-label="Snippet Studio NICE">
        <header className="nice-wizard-header">
          <div>
            <h2>Snippet Studio</h2>
            <p>Action #{action.actionId} - {action.caption}</p>
          </div>
          <button className="ghost-button" type="button" onClick={onCancel}>Fechar</button>
        </header>

        <div className="nice-snippet-studio-body">
          <aside className="nice-snippet-library">
            <div className="section-header">
              <h2>Blocos prontos</h2>
            </div>
            <div className="nice-snippet-variable-list" aria-label="Variaveis comuns">
              {SNIPPET_VARIABLES.map((variable) => (
                <button type="button" key={variable} onClick={() => insertBlock({ code: variable })}>
                  {variable}
                </button>
              ))}
            </div>
            <div className="nice-snippet-block-list">
              {SNIPPET_BLOCKS.map((block) => (
                <button type="button" key={block.title} onClick={() => insertBlock(block)}>
                  <strong>{block.title}</strong>
                  <small>{block.description}</small>
                </button>
              ))}
            </div>
          </aside>

          <main className="nice-snippet-editor-shell">
            <div className="nice-snippet-editor-toolbar">
              <span>Snippet code</span>
              <div className="nice-theme-toggle" role="group" aria-label="Tema do editor">
                <button
                  className={theme === 'light' ? 'is-active' : ''}
                  type="button"
                  onClick={() => setTheme('light')}
                >
                  Claro
                </button>
                <button
                  className={theme === 'dark' ? 'is-active' : ''}
                  type="button"
                  onClick={() => setTheme('dark')}
                >
                  Escuro
                </button>
              </div>
            </div>
            <NiceSnippetCodeMirror
              ref={editorRef}
              value={code}
              diagnostics={diagnostics}
              theme={theme}
              onChange={setCode}
            />
          </main>

          <aside className="nice-snippet-validation">
            <div className="section-header">
              <h2>Validacao</h2>
            </div>
            {diagnostics.length ? (
              <div className="nice-validation-list">
                {diagnostics.map((diagnostic, index) => (
                  <div
                    className={`nice-alert ${diagnostic.severity === 'error' ? 'is-error' : 'is-warning'}`}
                    key={`${diagnostic.message}-${index}`}
                  >
                    {diagnostic.message}
                  </div>
                ))}
              </div>
            ) : (
              <p className="nice-empty-text">Nenhum aviso no snippet.</p>
            )}
          </aside>
        </div>

        <footer className="nice-wizard-footer">
          <button className="ghost-button" type="button" onClick={onCancel}>Cancelar</button>
          <div className="toolbar-context">
            <button className="ghost-button" type="button" onClick={() => setCode(formatNiceSnippet(code))}>Formatar</button>
            <button className="secondary-button" type="button" onClick={() => onApply(action.actionId, code)}>Aplicar no node</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
