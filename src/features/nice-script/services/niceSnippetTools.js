export function formatNiceSnippet(code) {
  let indent = 0;
  return String(code ?? '')
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('}')) indent = Math.max(0, indent - 1);
      const formatted = `${'  '.repeat(indent)}${trimmed}`;
      if (trimmed.endsWith('{')) indent += 1;
      return formatted;
    })
    .join('\r\n');
}

export function validateNiceSnippetCode(code) {
  const diagnostics = [];
  const text = String(code ?? '');
  if (!text.trim()) return diagnostics;

  diagnostics.push(...validateBalancedDelimiters(text));
  const lines = getSnippetLines(text);

  lines.forEach((line, index) => {
    const trimmed = stripLineComment(line.text).trim();
    if (!trimmed) return;

    const statementMatch = trimmed.match(/^(?:}\s*)?(IF|ELSE|SWITCH|SELECT|FUNCTION|FOR|FOREACH|REPEAT)\b/i);
    if (statementMatch && !hasBlockStart(lines, index)) {
      diagnostics.push(makeSnippetDiagnostic(
        'error',
        `${statementMatch[1].toUpperCase()} precisa abrir bloco com { }.`,
        line.from,
        line.from + line.text.length,
      ));
    }

    if (/^\s*ASSIGN\b/i.test(trimmed) && !trimmed.includes('=')) {
      diagnostics.push(makeSnippetDiagnostic('warning', 'ASSIGN sem sinal de =.', line.from, line.from + line.text.length));
    }

    const assignMatch = trimmed.match(/^\s*ASSIGN\s+([^\s=]+)/i);
    if (assignMatch && !isValidNiceVariable(assignMatch[1])) {
      const from = line.from + line.text.indexOf(assignMatch[1]);
      diagnostics.push(makeSnippetDiagnostic('warning', `Variavel "${assignMatch[1]}" pode ser invalida para NICE.`, from, from + assignMatch[1].length));
    }
  });

  if (/\bSWITCH\b/i.test(text) && !/\bCASE\b/i.test(text)) {
    const index = text.search(/\bSWITCH\b/i);
    diagnostics.push(makeSnippetDiagnostic('error', 'SWITCH precisa ter pelo menos um CASE.', index, index + 6));
  }

  findCaseOutsideSelection(text).forEach((diagnostic) => diagnostics.push(diagnostic));

  if (/scriptpoint/i.test(text) && !/MAPA_DNA/i.test(text)) {
    diagnostics.push(makeSnippetDiagnostic('warning', 'scriptpoint usado sem atualizar MAPA_DNA.', text.search(/scriptpoint/i)));
  }
  if (/MAPA_DNA/i.test(text) && !/scriptpoint/i.test(text)) {
    diagnostics.push(makeSnippetDiagnostic('warning', 'MAPA_DNA usado sem scriptpoint.', text.search(/MAPA_DNA/i)));
  }

  for (const match of text.matchAll(/ASSIGN\s+(?:global:)?AUDIO\s*=\s*"([^"]+)"/gi)) {
    const audio = match[1];
    if (audio && !audio.includes('{') && !/\.wav$/i.test(audio)) {
      diagnostics.push(makeSnippetDiagnostic('warning', `AUDIO "${audio}" nao termina em .wav.`, match.index, match.index + match[0].length));
    }
  }

  const looksLikeOutput = /AUDIO|TRANSFERCODE|scriptpoint|MAPA_DNA/i.test(text);
  if (looksLikeOutput && !/NEXT_STEP/i.test(text)) {
    diagnostics.push(makeSnippetDiagnostic('warning', 'Snippet parece ser de saida, mas nao define NEXT_STEP.', 0));
  }

  return diagnostics;
}

function makeSnippetDiagnostic(severity, message, from = 0, to = from + 1) {
  const safeFrom = Number.isFinite(from) && from >= 0 ? from : 0;
  const safeTo = Number.isFinite(to) && to > safeFrom ? to : safeFrom + 1;
  return { severity, message, from: safeFrom, to: safeTo };
}

function validateBalancedDelimiters(text) {
  const diagnostics = [];
  const openers = { '{': '}', '(': ')', '[': ']' };
  const closers = { '}': '{', ')': '(', ']': '[' };
  const stack = [];
  let quote = '';
  let escaped = false;
  let inComment = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (inComment) {
      if (char === '\n') inComment = false;
      continue;
    }

    if (quote) {
      if (char === quote && !escaped) quote = '';
      escaped = char === '\\' && !escaped;
      if (char !== '\\') escaped = false;
      continue;
    }

    if (char === '/' && next === '/') {
      inComment = true;
      index += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      escaped = false;
      continue;
    }

    if (openers[char]) {
      stack.push({ char, index });
      continue;
    }

    if (closers[char]) {
      const last = stack.pop();
      if (!last || last.char !== closers[char]) {
        diagnostics.push(makeSnippetDiagnostic('error', `Fechamento "${char}" sem abertura correspondente.`, index, index + 1));
      }
    }
  }

  stack.forEach((item) => {
    diagnostics.push(makeSnippetDiagnostic('error', `Abertura "${item.char}" sem fechamento correspondente.`, item.index, item.index + 1));
  });

  return diagnostics;
}

function getSnippetLines(text) {
  return [...text.matchAll(/^.*$/gm)].map((match) => ({
    text: match[0],
    from: match.index,
  }));
}

function stripLineComment(line) {
  const index = line.indexOf('//');
  return index === -1 ? line : line.slice(0, index);
}

function hasBlockStart(lines, index) {
  const current = stripLineComment(lines[index]?.text ?? '');
  if (current.includes('{')) return true;
  const nextLine = lines.slice(index + 1).find((line) => stripLineComment(line.text).trim());
  return Boolean(nextLine && stripLineComment(nextLine.text).trim().startsWith('{'));
}

function isValidNiceVariable(variable) {
  return /^(?:global:)?[A-Za-z][A-Za-z0-9_$]*(?:\[[^\]]+\])?(?:\.[A-Za-z][A-Za-z0-9_$]*(?:\([^)]*\))?)*$/.test(variable);
}

function findCaseOutsideSelection(text) {
  const diagnostics = [];
  const lines = getSnippetLines(text);
  let depth = 0;
  let selectionDepth = 0;
  let pendingSelection = false;

  lines.forEach((line) => {
    const cleanLine = stripLineComment(line.text);
    const trimmed = cleanLine.trim();
    const startsSelection = /^(SWITCH|SELECT)\b/i.test(trimmed);
    const startsCase = /^(CASE|DEFAULT)\b/i.test(trimmed);
    const opens = (cleanLine.match(/\{/g) ?? []).length;
    const closes = (cleanLine.match(/\}/g) ?? []).length;

    if (startsCase && selectionDepth <= 0 && !pendingSelection) {
      diagnostics.push(makeSnippetDiagnostic('error', `${trimmed.split(/\s+/)[0].toUpperCase()} fora de SWITCH ou SELECT.`, line.from, line.from + line.text.length));
    }

    if (startsSelection) pendingSelection = true;
    if (pendingSelection && opens > 0) {
      selectionDepth += opens;
      pendingSelection = false;
    } else if (selectionDepth > 0) {
      selectionDepth += opens;
    }

    depth += opens - closes;
    if (selectionDepth > 0) selectionDepth = Math.max(0, selectionDepth - closes);
    if (depth < 0) depth = 0;
  });

  return diagnostics;
}
