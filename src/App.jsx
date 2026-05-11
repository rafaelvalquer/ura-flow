import { useMemo, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import UploadPanel from "./components/UploadPanel";
import StateList from "./components/StateList";
import FlowCanvas from "./components/FlowCanvas";
import DetailsPanel from "./components/DetailsPanel";
import DiagnosticsPanel from "./components/DiagnosticsPanel";
import BiSearchPanel from "./components/BiSearchPanel";
import LoadingOverlay from "./components/LoadingOverlay";
import Toolbar from "./components/Toolbar";
import { parseExcelFile } from "./services/excelParser.js";
import { buildFlow } from "./services/flowBuilder.js";
import { exportFlowToPdf } from "./services/pdfExporter.js";
import { normalizeKey } from "./utils/normalizeText.js";

export default function App() {
  const [parsedData, setParsedData] = useState(null);
  const [selectedState, setSelectedState] = useState("");
  const [viewMode, setViewMode] = useState("stateView");
  const [search, setSearch] = useState("");
  const [biSearch, setBiSearch] = useState("");
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
  const [focusRequest, setFocusRequest] = useState(null);
  const [isDetailsCollapsed, setDetailsCollapsed] = useState(false);
  const [isFocusMode, setFocusMode] = useState(false);
  const canvasRef = useRef(null);

  const graph = useMemo(
    () => buildFlow(parsedData, selectedState, viewMode, { showChangeColors }),
    [parsedData, selectedState, viewMode, showChangeColors],
  );

  const biIndex = useMemo(() => buildBiIndex(parsedData), [parsedData]);

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
      setBiSearch("");
      setFilter("all");
    } catch (caught) {
      setError(caught?.message ?? "Não foi possível processar o arquivo.");
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
    setBiSearch("");
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
    setFocusMode(false);
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

  function handleBiSelect(item) {
    setSelectedState(item.sheetName);
    setViewMode("detailedView");
    setSelection(null);
    setFocusRequest({
      kind: "bi",
      sheetName: item.sheetName,
      rowNumber: item.rowNumber,
      transitionId: item.transitionId,
      nonce: Date.now(),
    });
  }

  function handleOrganize() {
    setFocusRequest(null);
    setLayoutVersion((version) => version + 1);
  }

  async function handleExport() {
    await exportFlowToPdf(canvasRef.current, {
      stateName: selectedState,
      viewMode,
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
          isFocusMode={isFocusMode}
          onToggleChangeColors={() => setShowChangeColors((value) => !value)}
          onToggleFocusMode={() => setFocusMode((value) => !value)}
          onOrganize={handleOrganize}
          onExport={handleExport}
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
            />
            {error && <div className="error-banner">{error}</div>}
            <section className="panel-section">
              <div className="section-header">
                <h2>Visão</h2>
              </div>
              <div className="segmented-control">
                <button
                  type="button"
                  className={viewMode === "stateView" ? "active" : ""}
                  onClick={() => {
                    setViewMode("stateView");
                    setFocusRequest(null);
                  }}
                >
                  Por estado
                </button>
                <button
                  type="button"
                  className={viewMode === "detailedView" ? "active" : ""}
                  onClick={() => {
                    setViewMode("detailedView");
                    setFocusRequest(null);
                  }}
                >
                  Detalhada
                </button>
              </div>
            </section>
            {parsedData && (
              <>
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
                />
                <BiSearchPanel
                  items={biIndex}
                  search={biSearch}
                  onSearchChange={setBiSearch}
                  onSelect={handleBiSelect}
                />
                <DiagnosticsPanel
                  diagnostics={parsedData.diagnostics}
                  states={parsedData.states}
                  sheetNames={parsedData.sheetNames}
                  selectedState={selectedState}
                  scope={diagnosticsScope}
                  onScopeChange={setDiagnosticsScope}
                  onWarningClick={handleWarningClick}
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
            onSelectionChange={setSelection}
            canvasRef={canvasRef}
          />

          {!isFocusMode && (
          <DetailsPanel
            selection={selection}
            isCollapsed={isDetailsCollapsed}
            onToggleCollapsed={() => setDetailsCollapsed((value) => !value)}
          />
          )}
        </div>
      </div>
    </ReactFlowProvider>
  );
}

function buildBiIndex(parsedData) {
  if (!parsedData?.states?.length) return [];

  return parsedData.states.flatMap((state) => {
    return state.transitions
      .filter((transition) => transition.hasBiMarking)
      .map((transition) => {
        const biCode = transition.biCode ?? "";
        const biDescription = transition.biDescription ?? "";
        const bi = transition.bi ?? "";
        return {
          transitionId: transition.id,
          sheetName: state.sheetName,
          rowNumber: transition.rowNumber,
          destination: transition.to,
          prompt: transition.prompt,
          bi,
          biCode,
          biDescription,
          searchKey: normalizeKey(`${biCode} ${biDescription} ${bi} ${state.sheetName}`),
        };
      });
  });
}
