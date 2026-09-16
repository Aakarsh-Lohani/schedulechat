"use client";

import { useEffect, useState } from "react";
import { AlertCircle, X, Copy, Check } from "lucide-react";
import { useUIStore } from "@/lib/store/uiStore";
import styles from "./ErrorPopup.module.scss";

export function ErrorPopup() {
  const { activeError, clearError } = useUIStore();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && activeError) {
        clearError();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeError, clearError]);

  if (!activeError) return null;

  const jsonPayload = JSON.stringify(
    activeError.raw ?? {
      error: activeError.error,
      code: activeError.code ?? "UNKNOWN_ERROR",
      status: activeError.status,
    },
    null,
    2
  );

  function handleCopy() {
    navigator.clipboard.writeText(jsonPayload).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className={styles.overlay} onClick={clearError}>
      <div
        className={styles.popup}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="err-title"
      >
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <AlertCircle size={17} />
            <span id="err-title">API Request Failed</span>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={clearError}
            title="Dismiss error (Esc)"
          >
            <X size={15} />
          </button>
        </div>

        <div className={styles.statusRow}>
          {activeError.status && (
            <span className={styles.badge}>HTTP {activeError.status}</span>
          )}
          {activeError.code && (
            <span className={styles.codeBadge}>{activeError.code}</span>
          )}
        </div>

        <p className={styles.message}>{activeError.error}</p>

        <pre className={styles.jsonBox}>
          <code>{jsonPayload}</code>
        </pre>

        <div className={styles.footer}>
          <button type="button" className={styles.copyBtn} onClick={handleCopy}>
            {copied ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy JSON"}
          </button>
          <button type="button" className={styles.dismissBtn} onClick={clearError}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
