"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  STUDIO_KLINESCRIPT_TEMPLATES,
  buildStudioUserScriptCatalog,
  compileStudioKlineScript,
  filterStudioUserScriptCatalog,
  gateStudioKlineScriptCompile,
  KlineScriptWorkerError,
  type StudioAppliedIndicatorRef,
  type StudioUserScriptDefinition,
} from "openkline";
import styles from "./studio.module.css";

interface KlineScriptStudioEditorProps {
  readonly source: string;
  readonly disabled: boolean;
  readonly activePanelId: string;
  readonly appliedScripts?: readonly StudioAppliedIndicatorRef[];
  readonly onSourceChange: (source: string) => void;
  readonly onAdd: (source: string, signal: AbortSignal, generation: number) => Promise<void>;
  readonly onRemoveApplied?: (instanceId: string) => void;
  readonly onClose: () => void;
}

interface SavedScript {
  readonly name: string;
  readonly source: string;
}

const STORAGE_KEY = "openkline-studio-klinescripts-v1";

const completionItems = [
  "indicator",
  "plot",
  "hline",
  "input.int",
  "input.float",
  "input.bool",
  "ta.sma",
  "ta.ema",
  "ta.rsi",
  "ta.macd",
  "ta.atr",
  "ta.stdev",
  "ta.highest",
  "ta.lowest",
  "open",
  "high",
  "low",
  "close",
  "volume",
  "time",
] as const;

type RuntimeStatus = "idle" | "compiling" | "running" | "ready" | "cancelled" | "error";

export function KlineScriptStudioEditor({
  source,
  disabled,
  activePanelId,
  appliedScripts = [],
  onSourceChange,
  onAdd,
  onRemoveApplied,
  onClose,
}: KlineScriptStudioEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [savedScripts, setSavedScripts] = useState<readonly SavedScript[]>([]);
  const [scriptName, setScriptName] = useState("My KlineScript");
  const [scriptSearch, setScriptSearch] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(STUDIO_KLINESCRIPT_TEMPLATES[0]!.name);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>("idle");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [compileNotice, setCompileNotice] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const compilation = useMemo(
    () => compileStudioKlineScript({ source, generation }),
    [source, generation],
  );
  const lines = source.split("\n");
  const diagnostics = compilation.success ? [] : compilation.diagnostics;
  const cursor = textareaRef.current?.selectionStart ?? source.length;
  const prefix = source.slice(0, cursor).match(/[A-Za-z_.]*$/)?.[0] ?? "";
  const completions = completionItems.filter((item) => prefix.length === 0 || item.startsWith(prefix)).slice(0, 8);
  const userCatalog = useMemo(
    () => buildStudioUserScriptCatalog(savedScripts.map((item) => ({ name: item.name, source: item.source }))),
    [savedScripts],
  );
  const filteredCatalog = useMemo(
    () => filterStudioUserScriptCatalog(userCatalog, { query: scriptSearch }),
    [userCatalog, scriptSearch],
  );

  useEffect(() => {
    try {
      const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(parsed)) setSavedScripts(parsed.filter(isSavedScript));
    } catch {
      setSavedScripts([]);
    }
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const bumpGeneration = (): number => {
    const next = generationRef.current + 1;
    generationRef.current = next;
    setGeneration(next);
    return next;
  };

  const synchronizeScroll = (): void => {
    const textarea = textareaRef.current;
    const highlight = highlightRef.current;
    if (textarea !== null && highlight !== null) {
      highlight.scrollTop = textarea.scrollTop;
      highlight.scrollLeft = textarea.scrollLeft;
    }
  };

  const selectTemplate = (name: string): void => {
    const template = STUDIO_KLINESCRIPT_TEMPLATES.find((item) => item.name === name);
    if (template === undefined) return;
    setSelectedTemplate(name);
    onSourceChange(template.source);
    bumpGeneration();
    setRuntimeError(null);
    setCompileNotice(null);
    setRuntimeStatus("idle");
  };

  const loadCatalogEntry = (entry: StudioUserScriptDefinition): void => {
    setScriptName(entry.name);
    onSourceChange(entry.source);
    bumpGeneration();
    setRuntimeError(null);
    setCompileNotice(null);
    setRuntimeStatus("idle");
  };

  const saveScript = (): void => {
    const name = scriptName.trim() || "Untitled KlineScript";
    const next = [...savedScripts.filter((item) => item.name !== name), { name, source }].slice(-20);
    setSavedScripts(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setRuntimeStatus("ready");
    setCompileNotice(`Saved “${name}” locally (browser only; not workspace dirty).`);
  };

  const deleteScript = (name: string): void => {
    const next = savedScripts.filter((item) => item.name !== name);
    setSavedScripts(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const insertCompletion = (completion: string): void => {
    const textarea = textareaRef.current;
    if (textarea === null) return;
    const start = textarea.selectionStart;
    const tokenStart = source.slice(0, start).search(/[A-Za-z_.]*$/);
    const replacementStart = tokenStart < 0 ? start : tokenStart;
    const next = `${source.slice(0, replacementStart)}${completion}${source.slice(start)}`;
    onSourceChange(next);
    bumpGeneration();
    setCompletionOpen(false);
    window.requestAnimationFrame(() => {
      textarea.focus();
      const nextPosition = replacementStart + completion.length;
      textarea.setSelectionRange(nextPosition, nextPosition);
    });
  };

  const compileScript = (): void => {
    if (disabled || runtimeStatus === "running") return;
    const requestGeneration = generationRef.current;
    setRuntimeStatus("compiling");
    setRuntimeError(null);
    const gated = gateStudioKlineScriptCompile({
      source,
      requestGeneration,
      currentGeneration: generationRef.current,
    });
    if (!gated.ok) {
      if (gated.reason === "stale") {
        setRuntimeStatus("idle");
        setCompileNotice("Compile ignored: editor changed during validation.");
        return;
      }
      setRuntimeStatus("error");
      setCompileNotice(null);
      setRuntimeError(gated.snapshot.diagnostics.map((item) => item.message).join(" · ") || "Compilation failed.");
      return;
    }
    setRuntimeStatus("ready");
    setCompileNotice(`Compiled ${gated.snapshot.programId ?? "program"} for ${activePanelId}.`);
  };

  const addScript = async (): Promise<void> => {
    if (disabled || runtimeStatus === "running") return;
    const requestGeneration = generationRef.current;
    const gated = gateStudioKlineScriptCompile({
      source,
      requestGeneration,
      currentGeneration: generationRef.current,
    });
    if (!gated.ok) {
      setRuntimeStatus("error");
      setRuntimeError(gated.reason === "stale"
        ? "Apply ignored: editor changed during validation."
        : "Fix the highlighted diagnostics before adding the script.");
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setRuntimeStatus("running");
    setRuntimeError(null);
    setCompileNotice(null);
    try {
      await onAdd(source, controller.signal, requestGeneration);
      setRuntimeStatus("ready");
      setCompileNotice(`Applied Worker-backed KlineScript on ${activePanelId}.`);
    } catch (error) {
      if (controller.signal.aborted) {
        setRuntimeStatus("cancelled");
        setRuntimeError("Worker execution cancelled.");
      } else {
        setRuntimeStatus("error");
        setRuntimeError(error instanceof KlineScriptWorkerError
          ? error.diagnostics.map((item) => item.message).join(" · ") || error.message
          : error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };

  const cancelScript = (): void => {
    controllerRef.current?.abort();
  };

  return (
    <section className={styles.scriptPanel} aria-label="KlineScript editor" data-klinescript-panel={activePanelId}>
      <div className={styles.scriptHeading}>
        <strong>KlineScript Studio Editor</strong>
        <span>Restricted language · source spans · Worker execution · local-only library · active {activePanelId}</span>
        <label>Template
          <select aria-label="KlineScript template" value={selectedTemplate} disabled={disabled || runtimeStatus === "running"} onChange={(event) => selectTemplate(event.target.value)}>
            {STUDIO_KLINESCRIPT_TEMPLATES.map((template) => <option key={template.id}>{template.name}</option>)}
          </select>
        </label>
        <label>Search My Scripts
          <input aria-label="Search My Scripts" value={scriptSearch} disabled={disabled} placeholder="Name or source" onChange={(event) => setScriptSearch(event.target.value)} />
        </label>
      </div>
      <div className={styles.scriptEditorColumn}>
        <div className={styles.codeEditor}>
          <div className={styles.lineNumbers} aria-hidden="true">{lines.map((_, index) => <span key={index}>{index + 1}</span>)}</div>
          <div className={styles.codeViewport}>
            <pre ref={highlightRef} className={styles.highlightedCode} aria-hidden="true">{lines.map((line, index) => <span key={index}>{highlightLine(line)}{index < lines.length - 1 ? "\n" : ""}</span>)}</pre>
            <textarea
              ref={textareaRef}
              value={source}
              onChange={(event) => {
                onSourceChange(event.target.value);
                bumpGeneration();
                setRuntimeError(null);
                setCompileNotice(null);
                setRuntimeStatus("idle");
              }}
              onScroll={synchronizeScroll}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.code === "Space") { event.preventDefault(); setCompletionOpen(true); }
                if (event.key === "Escape") setCompletionOpen(false);
              }}
              onKeyUp={() => { if (prefix.length > 0) setCompletionOpen(true); }}
              spellCheck={false}
              disabled={disabled || runtimeStatus === "running"}
              aria-label="KlineScript source"
              aria-describedby="klinescript-diagnostics klinescript-runtime-status"
            />
          </div>
          {completionOpen && completions.length > 0 ? <div className={styles.completionList} role="listbox" aria-label="KlineScript completions">
            {completions.map((completion) => <button type="button" key={completion} role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => insertCompletion(completion)}>{completion}</button>)}
          </div> : null}
        </div>
        <div id="klinescript-diagnostics" className={styles.diagnosticList} aria-live="polite">
          {diagnostics.length === 0 ? <span className={styles.validDiagnostic}>No compile diagnostics.</span> : diagnostics.map((diagnostic) => <div key={`${diagnostic.code}-${diagnostic.span.start.offset}`} className={styles.diagnosticError}><strong>{diagnostic.code}</strong> L{diagnostic.span.start.line}:{diagnostic.span.start.column} {diagnostic.message}</div>)}
        </div>
      </div>
      <div className={styles.scriptControls}>
        <input aria-label="Local script name" value={scriptName} disabled={disabled} onChange={(event) => setScriptName(event.target.value)} />
        <button type="button" disabled={disabled} onClick={saveScript}>Save local</button>
        <button type="button" disabled={disabled || runtimeStatus === "running"} onClick={compileScript}>Compile</button>
        <button type="button" disabled={disabled || diagnostics.length > 0 || runtimeStatus === "running"} onClick={() => void addScript()}>Run in Worker</button>
        <button type="button" disabled={runtimeStatus !== "running"} onClick={cancelScript}>Cancel</button>
        <button type="button" onClick={onClose}>Close</button>
        <span id="klinescript-runtime-status" className={styles.runtimeStatus} aria-live="polite">Runtime: {runtimeStatus} · gen {generation}</span>
      </div>
      {compileNotice === null ? null : <p className={styles.validDiagnostic} role="status">{compileNotice}</p>}
      {runtimeError === null ? null : <p className={styles.scriptError} role="alert">{runtimeError}</p>}
      <div className={styles.savedScripts} aria-label="My Scripts catalog">
        <small>My Scripts · local browser library (not built-in registry)</small>
        {filteredCatalog.length === 0 ? <span>No saved scripts yet.</span> : filteredCatalog.map((item) => (
          <span key={item.id}>
            <button type="button" onClick={() => loadCatalogEntry(item)} disabled={disabled}>{item.name}</button>
            <button type="button" aria-label={`Delete ${item.name}`} onClick={() => deleteScript(item.name)} disabled={disabled}>×</button>
          </span>
        ))}
      </div>
      <div className={styles.savedScripts} aria-label={`Applied KlineScript on ${activePanelId}`} data-applied-script-count={appliedScripts.length}>
        <small>Applied on {activePanelId}</small>
        {appliedScripts.length === 0 ? <span>No Worker-backed scripts on this panel.</span> : appliedScripts.map((item) => (
          <span key={item.id}>
            <button type="button" disabled>{item.indicatorId}<small> {item.id}</small></button>
            <button type="button" aria-label={`Remove ${item.id}`} disabled={disabled || onRemoveApplied === undefined} onClick={() => onRemoveApplied?.(item.id)}>×</button>
          </span>
        ))}
      </div>
    </section>
  );
}

function isSavedScript(value: unknown): value is SavedScript {
  return typeof value === "object" && value !== null && typeof (value as { name?: unknown }).name === "string" && typeof (value as { source?: unknown }).source === "string";
}

function highlightLine(line: string) {
  const pattern = /(#[0-9a-fA-F]{6,8}|"(?:\\.|[^"\\])*"|\b(?:indicator|plot|hline|input|ta|True|False|and|or|not)\b|\b(?:open|high|low|close|volume|time)\b|\b\d+(?:\.\d+)?\b)/g;
  const tokens: ReactNode[] = [];
  let last = 0;
  for (const match of line.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push(<span key={`text-${last}`}>{line.slice(last, index)}</span>);
    const token = match[0];
    const className = token.startsWith("\"") ? styles.codeString : token.startsWith("#") ? styles.codeColor : /^\d/.test(token) ? styles.codeNumber : styles.codeKeyword;
    tokens.push(<span className={className} key={`${index}-${token}`}>{token}</span>);
    last = index + token.length;
  }
  if (last < line.length) tokens.push(<span key={`text-${last}`}>{line.slice(last)}</span>);
  return tokens;
}
