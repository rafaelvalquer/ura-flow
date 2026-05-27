import * as XLSX from 'xlsx';
import { classifyDestination } from '../utils/classifyDestination.js';
import { makeId, normalizeKey, normalizeText } from '../utils/normalizeText.js';

const HEADER_ALIASES = {
  result: ['resultado'],
  to: ['vai para o estado', 'vai para estado', 'estado destino', 'proximo estado'],
  prompt: ['e ouve o prompt', 'ouve o prompt', 'prompt'],
  observation: ['observacao', 'observações', 'observacao'],
  bi: ['marcacao de b i', 'marcacao de bi', 'marcação de b i', 'marcacao b i', 'bi'],
  audio: ['audio', 'audio prompt', 'arquivo audio', 'arquivo de audio'],
  scriptpoint: ['scriptpoint', 'script point', 'script_point', 'ponto script', 'ponto de script'],
  nextStep: ['next step', 'next_step', 'proximo estado tecnico', 'proximo fluxo tecnico', 'pathstep'],
  transferCode: ['transfercode', 'transfer code', 'codigo transferencia', 'codigo de transferencia'],
};

export async function parseExcelFile(file, onProgress = () => {}) {
  onProgress({
    percent: 0,
    stage: 'Lendo arquivo',
    sheetName: '',
    currentSheet: 0,
    totalSheets: 0,
  });
  await yieldToBrowser();

  const buffer = await file.arrayBuffer();
  onProgress({
    percent: 8,
    stage: 'Abrindo workbook',
    sheetName: '',
    currentSheet: 0,
    totalSheets: 0,
  });
  await yieldToBrowser();

  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, cellStyles: true });
  const sheetNames = workbook.SheetNames.filter((sheetName) => !isIgnoredSheetName(sheetName));
  const states = [];
  const warnings = [];
  const totalSheets = sheetNames.length;

  for (const [index, sheetName] of sheetNames.entries()) {
    onProgress({
      percent: progressPercent(index, totalSheets),
      stage: 'Processando abas',
      sheetName,
      currentSheet: index + 1,
      totalSheets,
    });
    await yieldToBrowser();

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const table = findDecisionTable(rows);

    if (!table) {
      warnings.push({
        type: 'missing-table',
        severity: 'warning',
        sheetName,
        message: `A aba "${sheetName}" não possui tabela de Resultado.`,
      });
      continue;
    }

    const state = parseStateRows(sheetName, sheet, rows, table, warnings);
    states.push(state);
  }

  onProgress({
    percent: 96,
    stage: 'Montando diagnósticos',
    sheetName: '',
    currentSheet: totalSheets,
    totalSheets,
  });
  await yieldToBrowser();

  const diagnostics = buildDiagnostics(sheetNames, states, warnings);
  onProgress({
    percent: 100,
    stage: 'Finalizando',
    sheetName: '',
    currentSheet: totalSheets,
    totalSheets,
  });
  await yieldToBrowser();

  return {
    fileName: file.name,
    sheetNames,
    states,
    diagnostics,
  };
}

function progressPercent(index, totalSheets) {
  if (!totalSheets) return 15;
  return Math.min(95, 15 + Math.round((index / totalSheets) * 80));
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

function isIgnoredSheetName(sheetName) {
  return normalizeKey(sheetName) === 'versionamento';
}

function findDecisionTable(rows) {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const columns = mapHeaderColumns(row);
    if (columns.result >= 0 && columns.to >= 0 && columns.prompt >= 0) {
      return { headerRow: rowIndex, columns };
    }
  }
  return null;
}

function mapHeaderColumns(row) {
  const mapped = {
    result: -1,
    to: -1,
    prompt: -1,
    observation: -1,
    bi: -1,
    audio: -1,
    scriptpoint: -1,
    nextStep: -1,
    transferCode: -1,
  };
  row.forEach((cell, index) => {
    const key = normalizeKey(cell);
    Object.entries(HEADER_ALIASES).forEach(([field, aliases]) => {
      if (mapped[field] === -1 && aliases.some((alias) => key.includes(normalizeKey(alias)))) {
        mapped[field] = index;
      }
    });
  });
  return mapped;
}

function parseStateRows(sheetName, sheet, rows, table, warnings) {
  const transitions = [];
  const audioCatalog = extractAudioCatalog(rows, table.headerRow);
  const root = createDecisionNode({
    id: `${makeId(sheetName)}-root`,
    text: sheetName,
    level: -1,
    branchKey: '__root__',
    branchValue: '',
    rowNumber: 0,
  });
  const activePath = [];
  const branchHistory = new Map();
  const allNodes = [];
  let lastNode = null;
  let baseLevel = null;
  const { columns, headerRow } = table;

  for (let rowIndex = headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const rawResult = getCell(row, columns.result);
    const rawDestination = normalizeText(getCell(row, columns.to));
    const internalDestination = isInternalDestination(rawDestination);
    const destination = internalDestination ? '' : rawDestination;
    const changeColor = destination ? getCellFillColor(sheet, rowIndex, columns.to) : '';
    const prompt = normalizeText(getCell(row, columns.prompt));
    const observation = normalizeText(getCell(row, columns.observation));
    const bi = normalizeText(getCell(row, columns.bi));
    const audio = normalizeText(getCell(row, columns.audio));
    const scriptpoint = normalizeText(getCell(row, columns.scriptpoint));
    const nextStep = normalizeText(getCell(row, columns.nextStep));
    const transferCode = normalizeText(getCell(row, columns.transferCode));
    const parsedCondition = parseCondition(rawResult);

    if (!parsedCondition.text && !destination && !prompt) continue;

    if (!parsedCondition.text) {
      if (destination) {
        transitions.push(createTransition({
          sheetName,
          rowNumber: rowIndex + 1,
          destination,
          prompt,
          observation,
          bi,
          audio,
          scriptpoint,
          nextStep,
          transferCode,
          changeColor,
          path: activePath.map((node) => node.text),
        }));
      }
      continue;
    }

    if (baseLevel === null) baseLevel = parsedCondition.level;

    const node = createDecisionNode({
      id: `${makeId(sheetName)}-${rowIndex + 1}`,
      text: parsedCondition.text,
      level: Math.max(0, parsedCondition.level - baseLevel),
      rawLevel: parsedCondition.level,
      branchKey: parsedCondition.branchKey,
      branchValue: parsedCondition.branchValue,
      rowNumber: rowIndex + 1,
      destination,
      prompt,
      observation,
      bi,
      audio,
      scriptpoint,
      nextStep,
      transferCode,
      changeColor,
      isDirective: internalDestination,
    });
    const parentPath = resolveParentPath({ node, activePath, branchHistory, lastNode });
    const parent = parentPath[parentPath.length - 1] ?? root;
    parent.children.push(node);
    node.path = [...parentPath.map((item) => item.text), node.text];
    node.pathNodeIds = [...parentPath.map((item) => item.id), node.id];
    activePath.length = 0;
    activePath.push(...parentPath, node);
    allNodes.push(node);
    lastNode = node;

    const history = branchHistory.get(node.branchKey) ?? [];
    history.push(node);
    branchHistory.set(node.branchKey, history);

    if (destination && !prompt) {
      warnings.push({
        type: 'empty-prompt',
        severity: 'warning',
        sheetName,
        rowNumber: rowIndex + 1,
        message: `Linha ${rowIndex + 1} possui destino sem prompt.`,
      });
    }

    if (destination) {
      const transition = createTransition({
        sheetName,
        rowNumber: rowIndex + 1,
        destination,
        prompt,
        observation,
        bi,
        audio,
        scriptpoint,
        nextStep,
        transferCode,
        changeColor,
        path: node.path,
      });
      node.transitionId = transition.id;
      transitions.push(transition);
    }
  }

  addDanglingConditionWarnings(allNodes, warnings, sheetName);

  return {
    id: makeId(sheetName),
    label: sheetName,
    sheetName,
    transitions,
    decisionTree: root.children,
    audioCatalog,
  };
}

function extractAudioCatalog(rows, decisionHeaderRow) {
  let audioHeaderRow = -1;

  for (let rowIndex = 0; rowIndex < decisionHeaderRow; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const first = normalizeKey(row[0]);
    const second = normalizeKey(row[1]);
    if (first.includes('nome da gravacao') && second.includes('texto')) {
      audioHeaderRow = rowIndex;
      break;
    }
  }

  if (audioHeaderRow < 0) return [];

  const catalog = [];
  for (let rowIndex = audioHeaderRow + 1; rowIndex < decisionHeaderRow; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const fileName = normalizeText(row[0]);
    const text = normalizeText(row[1]);
    if (!fileName) continue;
    if (isNonAudioCatalogRow(fileName)) continue;
    catalog.push({
      fileName,
      text,
      rowNumber: rowIndex + 1,
    });
  }

  return catalog;
}

function isNonAudioCatalogRow(value) {
  const key = normalizeKey(value);
  return key === 'obs'
    || key.startsWith('exemplo ')
    || key.includes('exemplos de concatenacao')
    || key.includes('nome do estado')
    || key.includes('estados anteriores');
}

function parseCondition(value) {
  const raw = String(value ?? '');
  const trimmed = raw.trim();
  if (!trimmed) return { level: 0, text: '', branchKey: '', branchValue: '' };

  const dotPrefix = trimmed.match(/^((?:\.\.\.|\.\.|\s)+)/)?.[0] ?? '';
  const dotGroups = dotPrefix.match(/\.{2,3}/g)?.length ?? 0;
  const spaceLevel = Math.floor((raw.match(/^\s*/)?.[0].length ?? 0) / 2);
  const level = Math.max(0, dotGroups || spaceLevel);
  const text = normalizeText(trimmed.replace(/^((?:\.\.\.|\.\.|\s)+)/, ''));
  const branch = parseBranch(text);

  return { level, text, ...branch };
}

function createDecisionNode({
  id,
  text,
  level,
  rawLevel = level,
  branchKey,
  branchValue,
  rowNumber,
  destination = '',
  prompt = '',
  observation = '',
  bi = '',
  audio = '',
  scriptpoint = '',
  nextStep = '',
  transferCode = '',
  changeColor = '',
  isDirective = false,
}) {
  return {
    id,
    text,
    level,
    rawLevel,
    branchKey,
    branchValue,
    rowNumber,
    destination,
    prompt,
    observation,
    bi,
    audio,
    scriptpoint,
    nextStep,
    transferCode,
    changeColor,
    hasChangeColor: Boolean(changeColor),
    isDirective,
    children: [],
  };
}

function createTransition({
  sheetName,
  rowNumber,
  destination,
  prompt,
  observation,
  bi,
  audio = '',
  scriptpoint = '',
  nextStep = '',
  transferCode = '',
  changeColor = '',
  path,
}) {
  const biMarking = parseBiMarking(bi);
  return {
    id: `${makeId(sheetName)}-${rowNumber}`,
    from: sheetName,
    to: destination,
    conditions: path.filter(Boolean),
    prompt,
    observation,
    audio,
    scriptpoint,
    nextStep,
    transferCode,
    bi,
    biCode: biMarking.code,
    biDescription: biMarking.description,
    hasBiMarking: biMarking.hasBiMarking,
    changeColor,
    hasChangeColor: Boolean(changeColor),
    sheetName,
    rowNumber,
  };
}

function parseBiMarking(value) {
  const text = normalizeText(value);
  if (!text) return { code: '', description: '', hasBiMarking: false };

  const numbered = text.match(/^(\d+)\s*[-–:]\s*(.+)$/);
  if (numbered) {
    return {
      code: numbered[1],
      description: normalizeText(numbered[2]),
      hasBiMarking: true,
    };
  }

  const leadingNumber = text.match(/^(\d+)\s+(.+)$/);
  if (leadingNumber) {
    return {
      code: leadingNumber[1],
      description: normalizeText(leadingNumber[2]),
      hasBiMarking: true,
    };
  }

  return {
    code: '',
    description: text,
    hasBiMarking: true,
  };
}

function resolveParentPath({ node, activePath, branchHistory, lastNode }) {
  const activeMatchIndex = findLastIndex(activePath, (item) => item.branchKey === node.branchKey);
  if (activeMatchIndex >= 0) {
    return activePath.slice(0, activeMatchIndex);
  }

  const history = branchHistory.get(node.branchKey) ?? [];
  const historicalMatch = history[history.length - 1];
  if (historicalMatch && node.level < historicalMatch.level && historicalMatch.pathNodeIds) {
    const parentIds = historicalMatch.pathNodeIds.slice(0, -1);
    return activePathFromHistory(parentIds, activePath, branchHistory);
  }

  if (lastNode?.isDirective) {
    return [...activePath];
  }

  const parentIndex = findLastIndex(activePath, (item) => item.level < node.level);
  return parentIndex >= 0 ? activePath.slice(0, parentIndex + 1) : [];
}

function activePathFromHistory(parentIds, activePath, branchHistory) {
  const knownNodes = new Map(activePath.map((node) => [node.id, node]));
  branchHistory.forEach((nodes) => {
    nodes.forEach((node) => knownNodes.set(node.id, node));
  });
  return parentIds.map((id) => knownNodes.get(id)).filter(Boolean);
}

function parseBranch(text) {
  const cleaned = normalizeText(text);
  const question = cleaned.match(/^(.+?\?)\s*(.+)$/);
  if (question) {
    return branchParts(question[1], question[2]);
  }

  const equality = cleaned.match(/^(.+?)\s*=\s*(.+)$/);
  if (equality) {
    return branchParts(equality[1], equality[2]);
  }

  const dtmf = cleaned.match(/^(DTMF)\s*(\d+)\s*[-–:]?\s*(.*)$/i);
  if (dtmf) {
    return branchParts('DTMF', `${dtmf[2]} ${dtmf[3]}`.trim());
  }

  const repeat = cleaned.match(/^(\d+)\s*x$/i);
  if (repeat) {
    return branchParts('tentativa', repeat[1]);
  }

  const suffix = cleaned.match(/^(.+?)\s+(SIM|NÃO|NAO|ligada|desligada|ativo|ativa|desativado|desativada|adimplente|inadimplente)$/i);
  if (suffix) {
    return branchParts(suffix[1], suffix[2]);
  }

  return branchParts(cleaned, '');
}

function branchParts(key, value) {
  return {
    branchKey: normalizeKey(key),
    branchValue: normalizeText(value),
  };
}

function isInternalDestination(destination) {
  const key = normalizeKey(destination);
  return key === 'seguir validacoes abaixo'
    || key === 'seguir validacao abaixo'
    || key === 'segue validacoes abaixo'
    || key === 'segue validacao abaixo'
    || key.includes('seguir validacoes abaixo')
    || key.includes('segue validacoes abaixo');
}

function addDanglingConditionWarnings(nodes, warnings, sheetName) {
  nodes.forEach((node) => {
    if (!node.destination && !node.isDirective && node.children.length === 0) {
      warnings.push({
        type: 'empty-destination',
        severity: 'info',
        sheetName,
        rowNumber: node.rowNumber,
        message: `Linha ${node.rowNumber} possui condição sem destino final.`,
      });
    }
  });
}

function findLastIndex(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index], index)) return index;
  }
  return -1;
}

function getCell(row, index) {
  if (index < 0) return '';
  return row[index] ?? '';
}

function getCellFillColor(sheet, rowIndex, columnIndex) {
  if (!sheet || columnIndex < 0) return '';
  const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
  const fill = sheet[address]?.s;
  if (fill?.patternType !== 'solid' || !fill?.fgColor?.rgb) return '';
  return normalizeHexColor(fill.fgColor.rgb);
}

function normalizeHexColor(value) {
  const hex = String(value ?? '').replace(/[^a-fA-F0-9]/g, '');
  if (hex.length === 8) return `#${hex.slice(2).toUpperCase()}`;
  if (hex.length === 6) return `#${hex.toUpperCase()}`;
  return '';
}

function buildDiagnostics(sheetNames, states, warnings) {
  const allTransitions = states.flatMap((state) => state.transitions);
  const unknownDestinations = [];

  allTransitions.forEach((transition) => {
    const type = classifyDestination(transition.to, sheetNames, transition.from);
    if (type === 'unknown') {
      unknownDestinations.push(transition);
      warnings.push({
        type: 'unknown-destination',
        severity: 'error',
        sheetName: transition.sheetName,
        rowNumber: transition.rowNumber,
        message: `Destino "${transition.to}" não encontrado como aba.`,
      });
    }
  });

  return {
    totalSheets: sheetNames.length,
    processedStates: states.length,
    totalTransitions: allTransitions.length,
    unknownDestinations: unknownDestinations.length,
    emptyPrompts: allTransitions.filter((transition) => !transition.prompt).length,
    terminalTransitions: allTransitions.filter((transition) => normalizeKey(transition.to) === 'tchau').length,
    transfers: allTransitions.filter((transition) => normalizeKey(transition.to).includes('transfer')).length,
    warnings,
  };
}
