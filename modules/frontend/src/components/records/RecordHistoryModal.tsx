/*
 * Copyright 2018 Comcast Cable Communications Management, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { recordsService } from "../../services/recordsService";
import { formatDateTime, copyToClipboard } from "../../utils/dateUtils";

interface RecordHistoryModalProps {
  record: any;
  onClose: () => void;
}

function changeTypeBadgeClass(type: string): string {
  const t = String(type ?? "").toLowerCase();
  if (t === "create") return "vds-change-type-badge--add";
  if (t === "delete") return "vds-change-type-badge--delete";
  if (t === "update") return "vds-change-type-badge--update";
  return "vds-change-type-badge--default";
}

function statusBadgeClass(status: string): string {
  if (status === "Complete") return "vds-status-badge--success";
  if (status === "Failed")   return "vds-status-badge--danger";
  return "vds-status-badge--warning";
}

function UserAvatar({ name }: { name: string }) {
  const initials = name
    .split(/[._\-@]+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || name.slice(0, 2).toUpperCase();
  return (
    <span
      className="vds-zone-avatar"
      style={{ width: 26, height: 26, fontSize: "0.58rem", borderRadius: 6, flexShrink: 0 }}
    >
      {initials}
    </span>
  );
}

export function RecordHistoryModal({ record, onClose }: RecordHistoryModalProps) {
  const [pageStack, setPageStack] = useState<(string | undefined)[]>([undefined]);
  const [pageIdx, setPageIdx]     = useState(0);
  const [copied, setCopied]       = useState<"record" | "zone" | null>(null);

  const fqdn   = String(record.fqdn ?? record.name ?? "");
  const cursor = pageStack[pageIdx];

  const { data, isLoading } = useQuery({
    queryKey: ["recordHistory", record.id, record.zoneId, cursor],
    queryFn: async () => {
      const res = await recordsService.listRecordSetChangeHistory(
        String(record.zoneId ?? ""),
        10,
        cursor,
        fqdn,
        String(record.type ?? ""),
      );
      return res.data;
    },
    staleTime: 30_000,
  });

  const changes: any[] = (data as any)?.changes ?? [];
  const hasMore: boolean = (data as any)?.hasMore ?? false;
  const hasPrev = pageIdx > 0;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleNext = () => {
    const nextId: string | undefined =
      (data as any)?.nextId ??
      (changes.length > 0 ? changes[changes.length - 1].id : undefined);
    if (!nextId) return;
    const newStack = [...pageStack.slice(0, pageIdx + 1), nextId];
    setPageStack(newStack);
    setPageIdx(pageIdx + 1);
  };

  const handlePrev = () => { if (pageIdx > 0) setPageIdx(pageIdx - 1); };

  const handleCopy = async (type: "record" | "zone") => {
    const val = type === "record" ? record.id : record.zoneId;
    if (!val) return;
    await copyToClipboard(String(val));
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <>
      <style>{`
        @keyframes rhm-in {
          from { opacity: 0; transform: scale(0.965) translateY(10px); }
          to   { opacity: 1; transform: none; }
        }
        .rhm-dialog { animation: rhm-in 0.22s cubic-bezier(0.4,0,0.2,1) both; }
        .rhm-row:hover td { background: rgba(30,95,168,0.05) !important; }
        [data-vds-theme="dark"] .rhm-row:hover td { background: rgba(30,95,168,0.16) !important; }
        .rhm-copy-btn { background: none; border: none; cursor: pointer; padding: 0; line-height: 1; opacity: 0.55; transition: opacity 0.15s; }
        .rhm-copy-btn:hover { opacity: 1; }
      `}</style>

      <div
        className="modal d-block"
        style={{ backgroundColor: "rgba(0,0,0,0.52)", zIndex: 1050 }}
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="modal-dialog modal-lg modal-dialog-scrollable modal-dialog-centered rhm-dialog">
          <div
            className="modal-content border-0"
            style={{
              borderRadius: 14,
              overflow: "hidden",
              boxShadow: "0 28px 72px rgba(13,27,62,0.26), 0 4px 16px rgba(13,27,62,0.12)",
            }}
          >

            {/* ── Gradient header ── */}
            <div style={{ background: "linear-gradient(135deg, #1e5fa8 0%, #0d1b3e 100%)", padding: "20px 24px 0" }}>

              {/* Title row */}
              <div className="d-flex align-items-start gap-3 mb-3">
                <div style={{ width: 46, height: 46, borderRadius: 10, background: "rgba(255,255,255,0.14)", border: "1.5px solid rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <i className="bi bi-clock-history" style={{ color: "#fff", fontSize: "1.25rem" }} />
                </div>
                <div className="flex-grow-1 min-w-0">
                  <h5 className="mb-1 fw-bold" style={{ color: "#fff", fontSize: "1.05rem", letterSpacing: "-0.01em" }}>
                    Record Change History
                  </h5>
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <span className="font-monospace" style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.8rem" }}>
                      <i className="bi bi-file-earmark-code me-1" />{fqdn}
                    </span>
                    {record.type && (
                      <span style={{ background: "rgba(255,255,255,0.18)", color: "#fff", border: "1px solid rgba(255,255,255,0.28)", borderRadius: 5, padding: "1px 9px", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.07em" }}>
                        {String(record.type)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={onClose}
                  style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.85)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, fontSize: "0.9rem" }}
                >
                  <i className="bi bi-x-lg" />
                </button>
              </div>

              {/* Meta strip — Record ID + Zone ID */}
              <div className="d-flex gap-4 flex-wrap" style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 12, paddingBottom: 14 }}>
                {([ ["Record ID", record.id, "record"], ["Zone ID", record.zoneId, "zone"] ] as [string, string, "record"|"zone"][]).map(([label, value, key]) =>
                  value ? (
                    <div key={key} className="d-flex align-items-center gap-2">
                      <span style={{ fontSize: "0.68rem", color: "rgba(255,255,255,0.45)", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase" }}>
                        {label}
                      </span>
                      <code
                        title={String(value)}
                        style={{ fontSize: "0.71rem", color: "rgba(255,255,255,0.82)", background: "rgba(255,255,255,0.1)", padding: "2px 8px", borderRadius: 4, maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block" }}
                      >
                        {String(value)}
                      </code>
                      <button
                        type="button"
                        className="rhm-copy-btn"
                        title={`Copy ${label}`}
                        style={{ color: copied === key ? "#4ade80" : "rgba(255,255,255,0.6)", fontSize: "0.78rem" }}
                        onClick={() => void handleCopy(key)}
                      >
                        <i className={`bi ${copied === key ? "bi-check-lg" : "bi-copy"}`} />
                      </button>
                    </div>
                  ) : null
                )}
              </div>
            </div>

            {/* ── Body ── */}
            <div className="modal-body p-0">
              {isLoading ? (
                <div className="d-flex flex-column align-items-center justify-content-center gap-3 py-5" style={{ minHeight: 200 }}>
                  <div className="spinner-border" style={{ color: "#1e5fa8", width: 36, height: 36, borderWidth: "3px" }} role="status" />
                  <span className="text-muted small">Loading change history…</span>
                </div>
              ) : changes.length === 0 ? (
                <div className="vds-empty-state py-5">
                  <i className="bi bi-clock-history fs-1 mb-2" style={{ opacity: 0.35 }} />
                  <p className="mb-0 fw-semibold">No change history</p>
                  <small className="text-muted">No recorded changes found for this record set.</small>
                </div>
              ) : (
                <div className="vds-zones-table-wrap" style={{ borderRadius: 0, boxShadow: "none", border: "none" }}>
                  <table className="vds-zones-table">
                    <thead>
                      <tr>
                        <th>TIME</th>
                        <th>USER</th>
                        <th>CHANGE TYPE</th>
                        <th>STATUS</th>
                        <th>INFO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {changes.map((change: any, idx: number) => {
                        const cType  = String(change.changeType ?? "");
                        const status = String(change.status ?? "");
                        return (
                          <tr key={idx} className="rhm-row">
                            <td className="vds-table-secondary vds-table-nowrap small">
                              {change.created ? formatDateTime(String(change.created)) : "—"}
                            </td>
                            <td>
                              <div className="d-flex align-items-center gap-2">
                                <UserAvatar name={String(change.userName ?? "S")} />
                                <span className="vds-table-primary small fw-medium text-truncate" style={{ maxWidth: 120 }}>
                                  {String(change.userName ?? "System")}
                                </span>
                              </div>
                            </td>
                            <td>
                              <span className={`vds-change-type-badge ${changeTypeBadgeClass(cType)}`}>
                                {cType || "—"}
                              </span>
                            </td>
                            <td>
                              <span className={`vds-status-badge ${statusBadgeClass(status)}`}>
                                {status || "—"}
                              </span>
                            </td>
                            <td style={{ maxWidth: 200 }}>
                              {change.systemMessage && (
                                <p className="mb-1 small vds-table-secondary text-truncate" title={String(change.systemMessage)} style={{ maxWidth: 190 }}>
                                  {String(change.systemMessage)}
                                </p>
                              )}
                              {status !== "Failed" && (
                                <div className="d-flex flex-column" style={{ gap: 2 }}>
                                  {(cType === "Create" || cType === "Delete") && change.recordSet && (
                                    <span className="small" style={{ color: "#1e5fa8", fontSize: "0.78rem" }}>
                                      <i className="bi bi-file-earmark-text me-1" />
                                      {cType === "Create" ? "Created" : "Deleted"} recordset
                                    </span>
                                  )}
                                  {cType === "Update" && change.recordSet && (
                                    <span className="small" style={{ color: "#1e5fa8", fontSize: "0.78rem" }}>
                                      <i className="bi bi-arrow-up-circle me-1" />New recordset
                                    </span>
                                  )}
                                  {cType === "Update" && change.updates && (
                                    <span className="small" style={{ color: "#64748b", fontSize: "0.78rem" }}>
                                      <i className="bi bi-arrow-down-circle me-1" />Previous recordset
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Footer — pagination ── */}
            {(hasPrev || hasMore) && (
              <div
                className="d-flex align-items-center justify-content-between px-4 py-2"
                style={{ borderTop: "1px solid var(--vds-card-border, #e8edf4)" }}
              >
                <button
                  type="button"
                  className="btn btn-sm vds-btn-flat d-flex align-items-center gap-1"
                  disabled={!hasPrev}
                  onClick={handlePrev}
                >
                  <i className="bi bi-chevron-left" style={{ fontSize: "0.7rem" }} />
                  <span className="vds-btn-flat__label">Previous</span>
                </button>
                <span className="text-muted small">Page {pageIdx + 1}</span>
                <button
                  type="button"
                  className="btn btn-sm vds-btn-flat d-flex align-items-center gap-1"
                  disabled={!hasMore}
                  onClick={handleNext}
                >
                  <span className="vds-btn-flat__label">Next</span>
                  <i className="bi bi-chevron-right" style={{ fontSize: "0.7rem" }} />
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
