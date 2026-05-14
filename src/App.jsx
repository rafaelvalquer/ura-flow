import { useMemo, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import UploadPanel from "./components/UploadPanel";
import StateList from "./components/StateList";
import FlowCanvas from "./components/FlowCanvas";
import DetailsPanel from "./components/DetailsPanel";
import DiagnosticsPanel from "./components/DiagnosticsPanel";
import GlobalSearchPanel from "./components/GlobalSearchPanel";
import LoadingOverlay from "./components/LoadingOverlay";
import Toolbar from "./components/Toolbar";
import AccordionSection from "./components/AccordionSection";
import { parseExcelFile } from "./services/excelParserClient.js";
import { buildFlow } from "./services/flowBuilder.js";
import { exportFlowToPng } from "./services/imageExporter.js";
import { normalizeKey } from "./utils/normalizeText.js";

export default function App() {
  const [parsedData, setParsedData] = useState(null);
  const [selectedState, setSelectedState] = useState("");
  const [viewMode, setViewMode] = useState("stateView");
  const [search, setSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [diagnosticsScope, setDiagnosticsScope] = useState("state");
  const [selection, setSelection] = useState(null);
  const [isLoading, setLoading] = useState(false);
  const [loadingFileName, setLoadingFileName] = useState("");
  const [loadingProgress, setLoadingProgress] = useState({
    percent: 0,
    stage: "",
    sheetName: "",
    currentSheet: 0,
    totalSheets: 0,
  });
  const [error, setError] = useState("");
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [showChangeColors, setShowChangeColors] = useState(false);
  const [showBiMarkings, setShowBiMarkings] = useState(true);
  const [showBreadcrumb, setShowBreadcrumb] = useState(true);
  const [focusRequest, setFocusRequest] = useState(null);
  const [isDetailsCollapsed, setDetailsCollapsed] = useState(false);
  const [isFocusMode, setFocusMode] = useState(false);
  const [savedPositionsVersion, setSavedPositionsVersion] = useState(0);
  const [sidebarAccordions, setSidebarAccordions] = useState({
    upload: true,
    states: true,
    diagnostics: true,
  });
  const canvasRef = useRef(null);

  const rawGraph = useMemo(
    () => buildFlow(parsedData, selectedState, viewMode, { showChangeColors, showBiMarkings }),
    [parsedData, selectedState, viewMode, showChangeColors, showBiMarkings],
  );

  const positionStorageKey = useMemo(
    () => makePositionStorageKey(parsedData?.fileName, selectedState, viewMode, rawGraph.nodes),
    [parsedData?.fileName, selectedState, viewMode, rawGraph.nodes],
  );

  const graph = useMemo(
    () => applySavedNodePositions(rawGraph, positionStorageKey),
    [rawGraph, positionStorageKey, savedPositionsVersion],
  );

  const globalIndex = useMemo(() => buildGlobalIndex(parsedData), [parsedData]);

  async function handleFileSelected(file) {
    setLoading(true);
    setLoadingFileName(file.name);
    setLoadingProgress({
      percent: 0,
      stage: "Lendo arquivo",
      sheetName: "",
      currentSheet: 0,
      totalSheets: 0,
    });
    setError("");
    setSelection(null);
    setFocusRequest(null);
    try {
      const result = await parseExcelFile(file, setLoadingProgress);
      setParsedData(result);
      setSelectedState(result.states[0]?.sheetName ?? "");
      setSearch("");
      setGlobalSearch("");
      setFilter("all");
    } catch (caught) {
      setError(caught?.message ?? "Nao foi possivel processar o arquivo.");
    } finally {
      setLoading(false);
      setLoadingFileName("");
      setLoadingProgress({
        percent: 0,
        stage: "",
        sheetName: "",
        currentSheet: 0,
        totalSheets: 0,
      });
    }
  }

  function handleClear() {
    setParsedData(null);
    setSelectedState("");
    setSelection(null);
    setFocusRequest(null);
    setSearch("");
    setGlobalSearch("");
    setFilter("all");
    setDiagnosticsScope("state");
    setError("");
    setLoadingFileName("");
    setLoadingProgress({
      percent: 0,
      stage: "",
      sheetName: "",
      currentSheet: 0,
      totalSheets: 0,
    });
    setShowChangeColors(false);
    setShowBiMarkings(true);
    setShowBreadcrumb(true);
    setFocusMode(false);
    setSidebarAccordions({
      upload: true,
      states: true,
      diagnostics: true,
    });
  }

  function toggleSidebarAccordion(key) {
    setSidebarAccordions((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  function handleViewModeChange(nextMode) {
    setViewMode(nextMode);
    setFocusRequest(null);
  }

  function handleWarningClick(warning) {
    if (!warning?.sheetName) return;
    setSelectedState(warning.sheetName);
    setSelection(null);
    setFocusRequest({
      sheetName: warning.sheetName,
      rowNumber: warning.rowNumber ?? null,
      type: warning.type,
      nonce: Date.now(),
    });
  }

  function handleGlobalResultSelect(item) {
    setSelectedState(item.sheetName);
    setSelection(null);

    if (item.type === "state") {
      setFocusRequest(null);
      return;
    }

    if (item.type !== "destination") {
      setViewMode("detailedView");
    }

    setFocusRequest({
      kind: item.type === "bi" ? "bi" : item.type,
      sheetName: item.sheetName,
      rowNumber: item.rowNumber ?? null,
      transitionId: item.transitionId,
      type: item.warningType,
      nonce: Date.now(),
    });
  }

  function handleOpenOccurrence(transition) {
    setSelectedState(transition.sheetName);
    setViewMode("detailedView");
    setSelection(null);
    setFocusRequest({
      kind: "occurrence",
      sheetName: transition.sheetName,
      rowNumber: transition.rowNumber,
      transitionId: transition.id,
      nonce: Date.now(),
    });
  }

  function handleNavigateToState(stateName) {
    if (!stateName || stateName === selectedState) return;
    setSelectedState(stateName);
    setSelection(null);
    setFocusRequest(null);
  }

  function handleOrganize() {
    setFocusRequest(null);
    saveNodePositions(positionStorageKey, rawGraph.nodes);
    setSavedPositionsVersion((version) => version + 1);
    setLayoutVersion((version) => version + 1);
  }

  function handleNodePositionsChange(nodes) {
    saveNodePositions(positionStorageKey, nodes);
  }

  async function handleExportImage() {
    await exportFlowToPng(canvasRef.current, {
      stateName: selectedState,
      nodes: graph.nodes,
    });
  }

  return (
    <ReactFlowProvider>
      <div className="app-shell">
        {isLoading && <LoadingOverlay fileName={loadingFileName} progress={loadingProgress} />}
        <Toolbar
          fileName={parsedData?.fileName}
          selectedState={selectedState}
          viewMode={viewMode}
          showChangeColors={showChangeColors}
          showBiMarkings={showBiMarkings}
          showBreadcrumb={showBreadcrumb}
          isFocusMode={isFocusMode}
          onToggleChangeColors={() => setShowChangeColors((value) => !value)}
          onToggleBiMarkings={() => setShowBiMarkings((value) => !value)}
          onToggleBreadcrumb={() => setShowBreadcrumb((value) => !value)}
          onToggleFocusMode={() => setFocusMode((value) => !value)}
          onOrganize={handleOrganize}
          onExportImage={handleExportImage}
          onClear={handleClear}
          canExport={graph.nodes.length > 0}
          canOrganize={graph.nodes.length > 0}
          canHighlightChanges={graph.nodes.length > 0}
        />

        <div className={`workspace-grid ${isDetailsCollapsed ? "details-collapsed" : ""} ${isFocusMode ? "focus-mode" : ""}`}>
          {!isFocusMode && (
            <aside className="left-sidebar">
              <UploadPanel
                onFileSelected={handleFileSelected}
                isLoading={isLoading}
                isOpen={sidebarAccordions.upload}
                onToggle={() => toggleSidebarAccordion("upload")}
              />
              {error && <div className="error-banner">{error}</div>}
              <section className="panel-section view-panel">
                <div className="section-header">
                  <h2>Visao</h2>
                </div>
                <div className="segmented-control">
                  <ViewModeButtons viewMode={viewMode} onChange={handleViewModeChange} />
                </div>
              </section>
              {parsedData && (
                <>
                  <GlobalSearchPanel
                    items={globalIndex}
                    search={globalSearch}
                    onSearchChange={setGlobalSearch}
                    onSelect={handleGlobalResultSelect}
                  />
                  <StateList
                    states={parsedData.states}
                    sheetNames={parsedData.sheetNames}
                    selectedState={selectedState}
                    onSelectState={(state) => {
                      setSelectedState(state);
                      setSelection(null);
                      setFocusRequest(null);
                    }}
                    search={search}
                    onSearchChange={setSearch}
                    filter={filter}
                    onFilterChange={setFilter}
                    isOpen={sidebarAccordions.states}
                    onToggle={() => toggleSidebarAccordion("states")}
                  />
                  <DiagnosticsPanel
                    diagnostics={parsedData.diagnostics}
                    states={parsedData.states}
                    sheetNames={parsedData.sheetNames}
                    selectedState={selectedState}
                    scope={diagnosticsScope}
                    onScopeChange={setDiagnosticsScope}
                    onWarningClick={handleWarningClick}
                    isOpen={sidebarAccordions.diagnostics}
                    onToggle={() => toggleSidebarAccordion("diagnostics")}
                  />
                </>
              )}
            </aside>
          )}

          <FlowCanvas
            nodes={graph.nodes}
            edges={graph.edges}
            layoutVersion={layoutVersion}
            focusRequest={focusRequest}
            selection={selection}
            showBreadcrumb={showBreadcrumb}
            onSelectionChange={setSelection}
            onNodePositionsChange={handleNodePositionsChange}
            onNavigateToState={handleNavigateToState}
            canvasRef={canvasRef}
          />

          {!isFocusMode && (
            <DetailsPanel
              selection={selection}
              isCollapsed={isDetailsCollapsed}
              onToggleCollapsed={() => setDetailsCollapsed((value) => !value)}
              onOpenOccurrence={handleOpenOccurrence}
            />
          )}
        </div>
      </div>
    </ReactFlowProvider>
  );
}

function ViewModeButtons({ viewMode, onChange }) {
  return (
    <>
      <button
        type="button"
        className={viewMode === "stateView" ? "active" : ""}
        onClick={() => onChange("stateView")}
      >
        Por estado
      </button>
      <button
        type="button"
        className={viewMode === "detailedView" ? "active" : ""}
        onClick={() => onChange("detailedView")}
      >
        Detalhada
      </button>
    </>
  );
}

function buildGlobalIndex(parsedData) {
  if (!parsedData?.states?.length) return [];

  const items = [];

  parsedData.states.forEach((state) => {
    items.push(makeSearchItem({
      id: `state-${state.sheetName}`,
      type: "state",
      title: state.sheetName,
      subtitle: `${state.transitions.length} transicoes`,
      meta: "Estado",
      sheetName: state.sheetName,
      text: `${state.sheetName} estado`,
    }));

    state.transitions.forEach((transition) => {
      const lineMeta = `${state.sheetName} - linha ${transition.rowNumber}`;

      items.push(makeSearchItem({
        id: `dest-${transition.id}`,
        type: "destination",
        title: transition.to || "Destino vazio",
        subtitle: transition.conditions?.slice(-2).join(" > ") || "Sem condicoes",
        meta: lineMeta,
        sheetName: state.sheetName,
        rowNumber: transition.rowNumber,
        transitionId: transition.id,
        text: `${transition.to} ${transition.conditions?.join(" ")} linha ${transition.rowNumber}`,
      }));

      if (transition.prompt) {
        items.push(makeSearchItem({
          id: `prompt-${transition.id}`,
          type: "prompt",
          title: transition.prompt,
          subtitle: transition.to,
          meta: lineMeta,
          sheetName: state.sheetName,
          rowNumber: transition.rowNumber,
          transitionId: transition.id,
          text: `${transition.prompt} ${transition.to} ${transition.conditions?.join(" ")}`,
        }));
      }

      transition.conditions?.forEach((condition, index) => {
        items.push(makeSearchItem({
          id: `condition-${transition.id}-${index}`,
          type: "condition",
          title: condition,
          subtitle: transition.to,
          meta: lineMeta,
          sheetName: state.sheetName,
          rowNumber: transition.rowNumber,
          transitionId: transition.id,
          text: `${condition} ${transition.to} linha ${transition.rowNumber}`,
        }));
      });

      if (transition.hasBiMarking) {
        items.push(makeSearchItem({
          id: `bi-${transition.id}`,
          type: "bi",
          title: transition.biCode || "Marcacao sem codigo",
          subtitle: transition.biDescription || transition.bi,
          meta: lineMeta,
          sheetName: state.sheetName,
          rowNumber: transition.rowNumber,
          transitionId: transition.id,
          text: `${transition.biCode} ${transition.biDescription} ${transition.bi} ${state.sheetName} linha ${transition.rowNumber}`,
        }));
      }
    });
  });

  parsedData.diagnostics?.warnings?.forEach((warning, index) => {
    if (!warning.sheetName) return;
    items.push(makeSearchItem({
      id: `warning-${index}`,
      type: "warning",
      title: warning.message,
      subtitle: warning.type,
      meta: warning.rowNumber ? `${warning.sheetName} - linha ${warning.rowNumber}` : warning.sheetName,
      sheetName: warning.sheetName,
      rowNumber: warning.rowNumber,
      warningType: warning.type,
      text: `${warning.message} ${warning.type} ${warning.sheetName} linha ${warning.rowNumber ?? ""}`,
    }));
  });

  return items;
}

function makeSearchItem({ text, ...item }) {
  return {
    ...item,
    searchKey: normalizeKey(`${text} ${item.title} ${item.subtitle} ${item.meta}`),
  };
}

function makePositionStorageKey(fileName, selectedState, viewMode, nodes) {
  if (!fileName || !selectedState || !nodes.length) return "";
  const nodeSignature = nodes.map((node) => node.id).sort().join("|");
  return `ura-flow:positions:${normalizeKey(fileName)}:${normalizeKey(selectedState)}:${viewMode}:${hashString(nodeSignature)}`;
}

function applySavedNodePositions(graph, storageKey) {
  if (!storageKey) return graph;
  const savedPositions = readSavedPositions(storageKey);
  if (!savedPositions) return graph;

  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const position = savedPositions[node.id];
      return position ? { ...node, position } : node;
    }),
  };
}

function saveNodePositions(storageKey, nodes) {
  if (!storageKey || !nodes?.length) return;
  try {
    const positions = nodes.reduce((stored, node) => {
      stored[node.id] = {
        x: Math.round(node.position?.x ?? 0),
        y: Math.round(node.position?.y ?? 0),
      };
      return stored;
    }, {});
    localStorage.setItem(storageKey, JSON.stringify(positions));
  } catch {
    // localStorage can be unavailable in restricted browser modes.
  }
}

function readSavedPositions(storageKey) {
  try {
    const value = localStorage.getItem(storageKey);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
