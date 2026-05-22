import { makeBranch, makeNiceAction, makeNiceScript } from './niceScriptModel.js';

export function parseNiceXml(xmlText, fileName = 'Script NICE') {
  const parser = new DOMParser();
  const documentXml = parser.parseFromString(xmlText, 'application/xml');
  const parserError = documentXml.querySelector('parsererror');
  if (parserError) {
    throw new Error('XML NICE invalido. Confira o arquivo exportado do Studio.');
  }

  const root = documentXml.documentElement;
  const actionElements = [...documentXml.getElementsByTagName('ActionStruct')];
  if (!actionElements.length) {
    throw new Error('Nenhuma ActionStruct encontrada no XML.');
  }

  const actions = actionElements.map(parseActionStruct).sort((a, b) => a.actionId - b.actionId);
  const begin = actions.find((action) => action.action === 'BEGIN');
  const scriptName = begin?.caption || stripXmlExtension(fileName);

  return makeNiceScript({
    name: scriptName,
    source: 'xml',
    templateType: inferTemplateType(actions),
    metadata: {
      busNo: Number(root.getAttribute('BusNo')) || 0,
      userId: Number(root.getAttribute('UserID')) || 0,
      importedFileName: fileName,
    },
    actions,
  });
}

function parseActionStruct(element) {
  const actionId = textOf(element, 'ActionID');
  const action = textOf(element, 'Action');
  const defaultNextActionElement = directChild(element, 'DefaultNextAction');
  const extraInfoElement = directChild(element, 'ExtraInfo');

  return makeNiceAction({
    actionId,
    action,
    caption: textOf(element, 'Caption') || action,
    parameters: parseStringList(directChild(element, 'Parameters')),
    x: textOf(element, 'X'),
    y: textOf(element, 'Y'),
    defaultNextAction: defaultNextActionElement ? parseBranchStruct(defaultNextActionElement) : null,
    branches: parseBranchList(directChild(element, 'Branches')),
    cases: parseBranchList(directChild(element, 'Cases')),
    dependencyOrder: textOf(element, 'DependencyOrder'),
    implType: textOf(element, 'Impl_Type'),
    libraryId: textOf(element, 'LibraryID'),
    extraInfo: extraInfoElement ? parseExtraInfo(extraInfoElement) : null,
    xws: textOf(element, 'xws'),
    yws: textOf(element, 'yws'),
  });
}

function parseStringList(element) {
  if (!element) return [];
  return directChildren(element, 'string').map((child) => child.textContent ?? '');
}

function parseBranchList(element) {
  if (!element) return [];
  return directChildren(element, 'BranchStruct').map(parseBranchStruct).filter(Boolean);
}

function parseBranchStruct(element) {
  const actionId = Number(textOf(element, 'ActionID'));
  if (!Number.isFinite(actionId)) return null;
  return makeBranch(
    actionId,
    textOf(element, 'Text'),
    textOf(element, 'Index'),
    parseSegments(directChild(element, 'Segments')),
  );
}

function parseExtraInfo(element) {
  const defaultBranch = directChild(element, 'DefaultBranch');
  const branches = directChildren(directChild(element, 'Branches'), 'BranchInfo').map(parseBranchInfo);
  const caseBranches = directChildren(directChild(element, 'CaseBranches'), 'BranchInfo').map(parseBranchInfo);
  return {
    defaultBranch: defaultBranch ? {
      actionId: Number(textOf(defaultBranch, 'ActionId')),
      keyName: textOf(defaultBranch, 'KeyName') || null,
      segments: parseSegments(directChild(defaultBranch, 'Segments')),
    } : null,
    branches,
    caseBranches,
  };
}

function parseBranchInfo(element) {
  return {
    actionId: Number(textOf(element, 'ActionId')),
    keyName: textOf(element, 'KeyName'),
    segments: parseSegments(directChild(element, 'Segments')),
  };
}

function parseSegments(element) {
  if (!element) return [];
  return directChildren(element, 'Point').map((point) => ({
    X: Number(textOf(point, 'X')) || 0,
    Y: Number(textOf(point, 'Y')) || 0,
  }));
}

function directChild(element, tagName) {
  if (!element) return null;
  return [...element.children].find((child) => child.localName === tagName) ?? null;
}

function directChildren(element, tagName) {
  if (!element) return [];
  return [...element.children].filter((child) => child.localName === tagName);
}

function textOf(element, tagName) {
  return directChild(element, tagName)?.textContent ?? '';
}

function stripXmlExtension(fileName) {
  return String(fileName || 'Script NICE').replace(/\.xml$/i, '');
}

function inferTemplateType(actions) {
  const actionNames = new Set(actions.map((action) => action.action));
  if (actionNames.has('MENU') && actionNames.has('CASE')) return 'menu';
  if (actions.length <= 4 && actionNames.has('BEGIN') && actionNames.has('RUNSCRIPT')) return 'entry';
  return 'imported';
}
