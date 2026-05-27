export function exportNiceClipboard(script) {
  const payload = {
    Actions: script.actions
      .slice()
      .sort((a, b) => a.actionId - b.actionId)
      .map(toClipboardAction),
    BusNo: script.metadata?.busNo ?? 0,
    LibraryItem: null,
    MediaType: script.metadata?.mediaType ?? 0,
    ModifyDate: `/Date(${Date.now()})/`,
    UserID: script.metadata?.userId ?? 0,
  };

  return `INCONTROL.NET-COPYCUTCOMMAND\r\n${JSON.stringify(payload)}`;
}

function toClipboardAction(action) {
  const branches = (action.branches ?? []).map(toClipboardBranch);
  const cases = (action.cases ?? []).map(toClipboardBranch);
  const defaultNextAction = action.defaultNextAction ? toClipboardBranch(action.defaultNextAction) : null;

  return {
    Action: action.action,
    ActionID: action.actionId,
    Branches: branches,
    BranchesCxs: null,
    Caption: action.caption,
    Cases: cases,
    DefaultNextAction: defaultNextAction,
    DependencyOrder: action.dependencyOrder ?? 0,
    ExtraInfo: makeExtraInfo(action),
    Impl_Type: action.implType ?? 0,
    LibraryID: action.libraryId,
    Parameters: action.parameters ?? [],
    X: Math.round(action.x ?? 0),
    Y: Math.round(action.y ?? 0),
    xws: action.xws ?? 0,
    yws: action.yws ?? 0,
  };
}

function toClipboardBranch(branch) {
  return {
    ActionID: Number(branch.actionId),
    Index: Number(branch.index) || 0,
    LabelDistance: branch.labelDistance ?? null,
    Segments: normalizeSegments(branch.segments),
    Text: branch.text ?? '',
  };
}

function makeExtraInfo(action) {
  return {
    Branches: (action.branches ?? []).map((branch) => ({
      ActionId: Number(branch.actionId),
      KeyName: branchKey(branch),
      Segments: normalizeSegments(branch.segments),
    })),
    CaseBranches: (action.cases ?? []).map((branch) => ({
      ActionId: Number(branch.actionId),
      KeyName: branch.text ?? '',
      Segments: normalizeSegments(branch.segments),
    })),
    DefaultBranch: {
      ActionId: action.defaultNextAction ? Number(action.defaultNextAction.actionId) : -1,
      KeyName: null,
      Segments: normalizeSegments(action.defaultNextAction?.segments),
    },
  };
}

function branchKey(branch) {
  if (branch.keyName !== undefined) return branch.keyName;
  return String(Number(branch.index) || 0);
}

function normalizeSegments(segments = []) {
  return (segments ?? []).map((point) => ({
    x: Number(point.x ?? point.X) || 0,
    y: Number(point.y ?? point.Y) || 0,
  }));
}
