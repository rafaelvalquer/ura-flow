import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { autocompletion } from '@codemirror/autocomplete';
import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import {
  HighlightStyle,
  StreamLanguage,
  bracketMatching,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
import { forceLinting, lintGutter, linter } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

const NICE_KEYWORDS = [
  'ASSIGN',
  'DYNAMIC',
  'FUNCTION',
  'IF',
  'ELSE',
  'SELECT',
  'SWITCH',
  'CASE',
  'DEFAULT',
  'FOR',
  'FOREACH',
  'REPEAT',
  'BREAK',
  'RETURN',
  'USES',
  'TRACE',
];

const LEGACY_ALIASES = ['var', 'let', 'const', 'if', 'else', 'function'];
const NICE_VARIABLES = ['NEXT_STEP', 'AUDIO', 'MRES', 'OP_ESCOLHIDA', 'scriptpoint', 'MAPA_DNA', 'TRANSFERCODE'];
const NICE_PREFIXES = ['{pathStep}', '{pathAPI}', '{path_audio}', '{MRES}', '{NEXT_STEP}', '{AUDIO}', '{MAPA_DNA}'];
const NICE_FUNCTIONS = ['asjson', 'now', 'setscreenpop', 'savetodb'];

const KEYWORD_SET = new Set([...NICE_KEYWORDS, ...LEGACY_ALIASES].map((item) => item.toLowerCase()));
const FUNCTION_SET = new Set(NICE_FUNCTIONS.map((item) => item.toLowerCase()));

const niceSnippetLanguage = StreamLanguage.define({
  name: 'nice-snippet',
  token(stream) {
    if (stream.eatSpace()) return null;

    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }

    if (stream.match(/\{[A-Za-z_][\w:$]*\}/)) return 'variableName special';

    const quote = stream.peek();
    if (quote === '"' || quote === "'") {
      stream.next();
      let escaped = false;
      while (!stream.eol()) {
        const char = stream.next();
        if (char === quote && !escaped) break;
        escaped = char === '\\' && !escaped;
        if (char !== '\\') escaped = false;
      }
      return 'string';
    }

    if (stream.match(/#"(?:[^"]|"")*"?/)) return 'string';
    if (stream.match(/[{}()[\]]/)) return 'bracket';
    if (stream.match(/[=+\-*/<>!|&.,:]+/)) return 'operator';
    if (stream.match(/\b\d+(?:\.\d+)?\b/)) return 'number';

    const word = stream.match(/[A-Za-z_][\w$]*(?::[A-Za-z_][\w$]*)?/);
    if (word) {
      const value = word[0];
      const lowered = value.toLowerCase();
      if (KEYWORD_SET.has(lowered)) return 'keyword';
      if (['true', 'false', 'null'].includes(lowered)) return 'atom';
      if (FUNCTION_SET.has(lowered) || /^\s*\(/.test(stream.string.slice(stream.pos))) return 'def';
      if (value.includes(':')) return 'variableName special';
      return 'variableName';
    }

    stream.next();
    return null;
  },
  languageData: {
    commentTokens: { line: '//' },
    closeBrackets: { brackets: ['(', '[', '{', '"', "'"] },
  },
});

const niceLightHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: '#1d4ed8', fontWeight: '700' },
  { tag: t.atom, color: '#7c3aed', fontWeight: '700' },
  { tag: t.string, color: '#15803d' },
  { tag: t.number, color: '#b45309' },
  { tag: t.comment, color: '#64748b', fontStyle: 'italic' },
  { tag: t.variableName, color: '#0f172a' },
  { tag: t.special(t.variableName), color: '#0891b2', fontWeight: '700' },
  { tag: t.definition(t.variableName), color: '#9333ea', fontWeight: '700' },
  { tag: t.operator, color: '#be123c' },
  { tag: t.bracket, color: '#334155', fontWeight: '700' },
]);

const niceDarkHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: '#93c5fd', fontWeight: '700' },
  { tag: t.atom, color: '#c4b5fd', fontWeight: '700' },
  { tag: t.string, color: '#86efac' },
  { tag: t.number, color: '#fbbf24' },
  { tag: t.comment, color: '#94a3b8', fontStyle: 'italic' },
  { tag: t.variableName, color: '#e5e7eb' },
  { tag: t.special(t.variableName), color: '#67e8f9', fontWeight: '700' },
  { tag: t.definition(t.variableName), color: '#f0abfc', fontWeight: '700' },
  { tag: t.operator, color: '#fda4af' },
  { tag: t.bracket, color: '#bfdbfe', fontWeight: '700' },
]);

const niceLightTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: '#ffffff',
    color: '#0f172a',
  },
  '.cm-scroller': {
    fontFamily: '"Cascadia Code", Consolas, "SFMono-Regular", monospace',
    fontSize: '13px',
    lineHeight: '1.55',
  },
  '.cm-gutters': {
    backgroundColor: '#f8fafc',
    color: '#64748b',
    borderRight: '1px solid #e5e7eb',
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: '#eff6ff',
  },
  '.cm-matchingBracket, .cm-nonmatchingBracket': {
    outline: '1px solid #2563eb',
    backgroundColor: '#dbeafe',
  },
}, { dark: false });

const niceDarkTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: '#0f172a',
    color: '#e5e7eb',
  },
  '.cm-scroller': {
    fontFamily: '"Cascadia Code", Consolas, "SFMono-Regular", monospace',
    fontSize: '13px',
    lineHeight: '1.55',
  },
  '.cm-content, .cm-line': {
    color: '#e5e7eb',
    caretColor: '#f8fafc',
  },
  '.cm-cursor': {
    borderLeftColor: '#f8fafc',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: '#334155',
  },
  '.cm-gutters': {
    backgroundColor: '#111827',
    color: '#94a3b8',
    borderRight: '1px solid #334155',
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: '#172554',
  },
  '.cm-matchingBracket, .cm-nonmatchingBracket': {
    outline: '1px solid #60a5fa',
    backgroundColor: '#1e3a8a',
  },
}, { dark: true });

const NICE_COMPLETIONS = [
  ...NICE_KEYWORDS.map((keyword) => ({
    label: keyword,
    type: 'keyword',
    detail: 'NICE keyword',
    apply: `${keyword} `,
  })),
  ...LEGACY_ALIASES.map((keyword) => ({
    label: keyword,
    type: 'keyword',
    detail: 'alias comum',
  })),
  ...NICE_VARIABLES.map((variable) => ({
    label: variable,
    type: 'variable',
    detail: 'variavel comum',
  })),
  ...NICE_PREFIXES.map((prefix) => ({
    label: prefix,
    type: 'variable',
    detail: 'placeholder',
  })),
  ...NICE_FUNCTIONS.map((fn) => ({
    label: fn,
    type: 'function',
    detail: 'funcao NICE',
    apply: fn === 'now' ? 'now' : `${fn}()`,
  })),
  {
    label: 'IF / ELSE',
    type: 'snippet',
    detail: 'bloco condicional',
    apply: 'IF NOME_VARIAVEL = "VALOR"\r\n{\r\n  \r\n}\r\nELSE\r\n{\r\n  \r\n}',
  },
  {
    label: 'SWITCH / CASE / DEFAULT',
    type: 'snippet',
    detail: 'opcoes por variavel',
    apply: 'SWITCH OP_ESCOLHIDA\r\n{\r\n  CASE "1"\r\n  {\r\n    \r\n  }\r\n  DEFAULT\r\n  {\r\n    \r\n  }\r\n}',
  },
  {
    label: 'ASSIGN AUDIO + NEXT_STEP',
    type: 'snippet',
    detail: 'saida padrao',
    apply: 'ASSIGN AUDIO="AUDIO.wav"\r\nASSIGN NEXT_STEP="{pathStep}Destino"\r\ninteractionLastDateTime=0',
  },
];

function niceSnippetCompletion(context) {
  const token = context.matchBefore(/[\w:{}$./-]*/);
  if (!token || (token.from === token.to && !context.explicit)) return null;
  return {
    from: token.from,
    options: NICE_COMPLETIONS,
    validFor: /^[\w:{}$./-]*$/,
  };
}

const NiceSnippetCodeMirror = forwardRef(function NiceSnippetCodeMirror({
  value,
  diagnostics,
  theme,
  onChange,
}, ref) {
  const hostRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const diagnosticsRef = useRef(diagnostics ?? []);
  const themeCompartment = useMemo(() => new Compartment(), []);
  const highlightCompartment = useMemo(() => new Compartment(), []);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    diagnosticsRef.current = diagnostics ?? [];
    if (viewRef.current) forceLinting(viewRef.current);
  }, [diagnostics]);

  useImperativeHandle(ref, () => ({
    insertText(text) {
      const view = viewRef.current;
      if (!view) return;
      const insert = normalizeEditorText(text);
      const docLength = view.state.doc.length;
      const selection = view.state.selection.main;
      const from = clampPosition(selection.from, docLength);
      const to = clampPosition(selection.to, docLength);
      const cursor = clampPosition(from + insert.length, docLength - (to - from) + insert.length);
      view.dispatch({
        changes: { from, to, insert },
        selection: EditorSelection.cursor(cursor),
        scrollIntoView: true,
      });
      view.focus();
    },
    focus() {
      viewRef.current?.focus();
    },
  }), []);

  useEffect(() => {
    if (!hostRef.current || viewRef.current) return undefined;

    const state = EditorState.create({
      doc: value ?? '',
      extensions: [
        basicSetup,
        niceSnippetLanguage,
        highlightCompartment.of(syntaxHighlighting(theme === 'dark' ? niceDarkHighlightStyle : niceLightHighlightStyle)),
        bracketMatching(),
        indentOnInput(),
        indentUnit.of('  '),
        autocompletion({ override: [niceSnippetCompletion] }),
        lintGutter(),
        linter((view) => diagnosticsRef.current.map((diagnostic) => ({
          from: Math.max(0, Math.min(view.state.doc.length, diagnostic.from ?? 0)),
          to: Math.max(0, Math.min(view.state.doc.length, diagnostic.to ?? diagnostic.from ?? 0)),
          severity: diagnostic.severity === 'error' ? 'error' : 'warning',
          message: diagnostic.message,
        }))),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString());
          }
        }),
        themeCompartment.of(theme === 'dark' ? niceDarkTheme : niceLightTheme),
      ],
    });

    viewRef.current = new EditorView({
      state,
      parent: hostRef.current,
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [highlightCompartment, theme, themeCompartment]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentValue = view.state.doc.toString();
    if (value === currentValue) return;
    const insert = normalizeEditorText(value ?? '');
    view.dispatch({
      changes: { from: 0, to: currentValue.length, insert },
      selection: EditorSelection.cursor(Math.min(view.state.selection.main.head, insert.length)),
    });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        themeCompartment.reconfigure(theme === 'dark' ? niceDarkTheme : niceLightTheme),
        highlightCompartment.reconfigure(syntaxHighlighting(theme === 'dark' ? niceDarkHighlightStyle : niceLightHighlightStyle)),
      ],
    });
  }, [highlightCompartment, theme, themeCompartment]);

  return <div className="nice-codemirror-shell" ref={hostRef} />;
});

function normalizeEditorText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n');
}

function clampPosition(position, length) {
  return Math.max(0, Math.min(Number(position) || 0, length));
}

export default NiceSnippetCodeMirror;
