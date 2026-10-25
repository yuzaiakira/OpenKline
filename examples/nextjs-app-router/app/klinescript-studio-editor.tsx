"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { compileKlineScript, KlineScriptWorkerError } from "openkline";
import styles from "./studio.module.css";

interface KlineScriptStudioEditorProps {
  readonly source: string;
  readonly disabled: boolean;
  readonly onSourceChange: (source: string) => void;
  readonly onAdd: (source: string, signal: AbortSignal) => Promise<void>;
  readonly onClose: () => void;
}

interface SavedScript {
  readonly name: string;
  readonly source: string;
}

const STORAGE_KEY = "openkline-studio-klinescripts-v1";
const templates: readonly SavedScript[] = [
  {
    name: "EMA overlay",
    source: [
      'indicator("Studio EMA")',
      'period = input.int("Period", default=21, min=1, max=200)',
      "value = ta.ema(close, period)",
      'plot(value, title="EMA", color="#a78bfa")',
    ].join("\n"),
  },
  {
    name: "RSI pane",
    source: [
      'indicator("Studio RSI", overlay=False)',
      "value = ta.rsi(close, 14)",
      'plot(value, title="RSI", color="#60a5fa")',
      'hline(70, color="#fb7185")',
      'hline(30, color="#34d399")',
    ].join("\n"),
  },
  {
    name: "Pointwise close",
    source: [
      'indicator("Pointwise close")',
      'plot(close, title="Close", color="#fbbf24", width=2)',
    ].join("\n"),
  },
];

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

type RuntimeStatus = "idle" | "running" | "ready" | "cancelled" | "error";

export function KlineScriptStudioEditor({ source, disabled, onSourceChange, onAdd, onClose }: KlineScriptStudioEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [savedScripts, setSavedScripts] = useState<readonly SavedScript[]>([]);
  const [scriptName, setScriptName] = useState("My KlineScript");
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0]!.name);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus>("idle");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const compilation = useMemo(() => compileKlineScript(source), [source]);
  const lines = source.split("\n");
  const diagnostics = compilation.success ? [] : compilation.diagnostics;
  const cursor = textareaRef.current?.selectionStart ?? source.length;
  const prefix = source.slice(0, cursor).match(/[A-Za-z_.]*$/)?.[0] ?? "";
  const completions = completionItems.filter((item) => prefix.length === 0 || item.startsWith(prefix)).slice(0, 8);

  useEffect(() => {
    try {
      const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(parsed)) setSavedScripts(parsed.filter(isSavedScript));
    } catch {
      setSavedScripts([]);
    }
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const synchronizeScroll = (): void => {
    const textarea = textareaRef.current;
    const highlight = highlightRef.current;
    if (textarea !== null && highlight !== null) {
      highlight.scrollTop = textarea.scrollTop;
      highlight.scrollLeft = textarea.scrollLeft;
    }
  };

  const selectTemplate = (name: string): void => {
    const template = templates.find((item) => item.name === name);
    if (template === undefined) return;
    setSelectedTemplate(name);
    onSourceChange(template.source);
    setRuntimeError(null);
  };

  const saveScript = (): void => {
    const name = scriptName.trim() || "Untitled KlineScript";
    const next = [...savedScripts.filter((item) => item.name !== name), { name, source }].slice(-20);
    setSavedScripts(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setRuntimeStatus("ready");
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
    setCompletionOpen(false);
    window.requestAnimationFrame(() => {
      textarea.focus();
      const nextPosition = replacementStart + completion.length;
      textarea.setSelectionRange(nextPosition, nextPosition);
    });
  };

  const addScript = async (): Promise<void> => {
    if (disabled || runtimeStatus === "running") return;
    if (!compilation.success) {
      setRuntimeStatus("error");
      setRuntimeError("Fix the highlighted diagnostics before adding the script.");
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setRuntimeStatus("running");
    setRuntimeError(null);
    try {
      await onAdd(source, controller.signal);
      setRuntimeStatus("ready");
    } catch (error) {
      if (controller.signal.aborted) {
        setRuntimeStatus("cancelled");
        setRuntimeError("Worker execution cancelled.");
      } else {
        setRuntimeStatus("error");
        setRuntimeError(error instanceof KlineScriptWorkerError ? error.diagnostics.map((item) => item.message).join(" · ") || error.message : error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };

  const cancelScript = (): void => {
    controllerRef.current?.abort();
  };

  return (
    <section className={styles.scriptPanel} aria-label="KlineScript editor">
      <div className={styles.scriptHeading}>
        <strong>KlineScript Studio Editor</strong>
        <span>Restricted language · source spans · Worker execution · local-only scripts</span>
        <label>Template
          <select aria-label="KlineScript template" value={selectedTemplate} disabled={disabled || runtimeStatus === "running"} onChange={(event) => selectTemplate(event.target.value)}>
            {templates.map((template) => <option key={template.name}>{template.name}</option>)}
          </select>
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
              onChange={(event) => { onSourceChange(event.target.value); setRuntimeError(null); setRuntimeStatus("idle"); }}
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
        <button type="button" disabled={disabled || diagnostics.length > 0 || runtimeStatus === "running"} onClick={() => void addScript()}>Run in Worker</button>
        <button type="button" disabled={runtimeStatus !== "running"} onClick={cancelScript}>Cancel</button>
        <button type="button" onClick={onClose}>Close</button>
        <span id="klinescript-runtime-status" className={styles.runtimeStatus} aria-live="polite">Runtime: {runtimeStatus}</span>
      </div>
      {runtimeError === null ? null : <p className={styles.scriptError} role="alert">{runtimeError}</p>}
      {savedScripts.length > 0 ? <div className={styles.savedScripts} aria-label="Saved local KlineScripts">
        <small>Saved locally</small>
        {savedScripts.map((item) => <span key={item.name}><button type="button" onClick={() => { setScriptName(item.name); onSourceChange(item.source); }} disabled={disabled}>{item.name}</button><button type="button" aria-label={`Delete ${item.name}`} onClick={() => deleteScript(item.name)} disabled={disabled}>×</button></span>)}
      </div> : null}
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
