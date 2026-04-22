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

import React from "react";
import { Link } from "react-router-dom";
import type { DnsChangeSummary } from "../../types/dnsChange";
import { formatDateTime } from "../../utils/dateUtils";

interface DnsChangesTableProps {
  changes: DnsChangeSummary[];
  onCancel?: (change: DnsChangeSummary) => void;
  ignoreAccess?: boolean;
  currentUserName?: string;
}

const STATUS_CONFIG: Record<string, { bg: string; label: string }> = {
  Complete: { bg: "bg-success", label: "Complete" },
  Failed: { bg: "bg-danger", label: "Failed" },
  PartialFailure: { bg: "bg-warning text-dark", label: "Partial Failure" },
  PendingProcessing: { bg: "bg-info text-dark", label: "Pending Processing" },
  PendingReview: { bg: "bg-warning text-dark", label: "Pending Review" },
  Pending: { bg: "bg-info text-dark", label: "Pending" },
  Rejected: { bg: "bg-danger", label: "Rejected" },
  Scheduled: { bg: "bg-primary", label: "Scheduled" },
  Cancelled: { bg: "bg-secondary", label: "Cancelled" },
};

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text);
}

export function DnsChangesTable({
  changes,
  onCancel,
  ignoreAccess,
  currentUserName,
}: DnsChangesTableProps) {
  if (changes.length === 0) {
    return (
      <div
        className="text-center py-5"
        style={{
          background: "linear-gradient(135deg, #0d6efd0a 0%, #ffffff 100%)",
          border: "1px dashed #d0e4ff",
          borderRadius: "0.75rem",
        }}
      >
        <i
          className="bi bi-list-ol text-primary"
          style={{ fontSize: "2.5rem", opacity: 0.4 }}
        />
        <p className="mt-3 text-muted fw-semibold">No DNS changes found.</p>
        <p className="text-muted small">
          Create a new batch change to get started.
        </p>
      </div>
    );
  }

  return (
    <div
      className="card border-0"
      style={{
        borderRadius: "0.75rem",
        boxShadow: "0 2px 12px rgba(13,110,253,.08)",
        overflow: "hidden",
      }}
    >
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0">
          <thead>
            <tr
              style={{
                background: "#cfe0f5",
                borderBottom: "2px solid #9ec5e0",
              }}
            >
              <th
                className="fw-semibold border-0 py-3"
                style={{
                  fontSize: "0.82rem",
                  letterSpacing: "0.04em",
                  background: "transparent",
                  color: "#2c4a6e",
                }}
              >
                SUBMITTED
              </th>
              {ignoreAccess && (
                <th
                  className="fw-semibold border-0 py-3"
                  style={{
                    fontSize: "0.82rem",
                    letterSpacing: "0.04em",
                    background: "transparent",
                    color: "#2c4a6e",
                  }}
                >
                  SUBMITTER
                </th>
              )}
              <th
                className="fw-semibold border-0 py-3"
                style={{
                  fontSize: "0.82rem",
                  letterSpacing: "0.04em",
                  background: "transparent",
                  color: "#2c4a6e",
                }}
              >
                ID
              </th>
              <th
                className="fw-semibold border-0 py-3"
                style={{
                  fontSize: "0.82rem",
                  letterSpacing: "0.04em",
                  background: "transparent",
                  color: "#2c4a6e",
                }}
              >
                CHANGES
              </th>
              <th
                className="fw-semibold border-0 py-3"
                style={{
                  fontSize: "0.82rem",
                  letterSpacing: "0.04em",
                  background: "transparent",
                  color: "#2c4a6e",
                }}
              >
                STATUS
              </th>
              <th
                className="fw-semibold border-0 py-3"
                style={{
                  fontSize: "0.82rem",
                  letterSpacing: "0.04em",
                  background: "transparent",
                  color: "#2c4a6e",
                }}
              >
                DESCRIPTION
              </th>
              <th
                className="fw-semibold border-0 py-3"
                style={{
                  fontSize: "0.82rem",
                  letterSpacing: "0.04em",
                  background: "transparent",
                  color: "#2c4a6e",
                }}
              >
                ACTIONS
              </th>
            </tr>
          </thead>
          <tbody>
            {changes.map((change, idx) => {
              const statusCfg = STATUS_CONFIG[change.status] ?? {
                bg: "bg-secondary",
                label: change.status,
              };
              const canCancel =
                change.approvalStatus === "PendingReview" &&
                currentUserName === change.userName;

              return (
                <tr
                  key={change.id}
                  style={{
                    background: idx % 2 === 0 ? "#fff" : "#f8fbff",
                    transition: "background 0.15s",
                  }}
                >
                  <td className="small text-muted">
                    {formatDateTime(change.createdTimestamp)}
                  </td>
                  {ignoreAccess && (
                    <td>
                      <span className="d-flex align-items-center gap-1">
                        <i
                          className="bi bi-person-circle text-muted"
                          style={{ fontSize: "0.9rem" }}
                        />
                        <span className="small">{change.userName}</span>
                      </span>
                    </td>
                  )}
                  <td>
                    <div className="d-flex align-items-center gap-1">
                      <Link
                        to={`/dnschanges/${change.id}`}
                        className="text-decoration-none small fw-semibold text-primary font-monospace"
                      >
                        {change.id.substring(0, 8)}…
                      </Link>
                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0 text-muted"
                        style={{ lineHeight: 1, fontSize: "0.78rem" }}
                        title="Copy full ID to clipboard"
                        onClick={() => copyToClipboard(change.id)}
                      >
                        <i className="bi bi-copy" />
                      </button>
                    </div>
                  </td>
                  <td>
                    <span
                      className="badge rounded-pill"
                      style={{
                        background: "linear-gradient(90deg, #1e5fa8, #0d1b3e)",
                        color: "#fff",
                        fontWeight: 600,
                        fontSize: "0.8rem",
                        padding: "0.35em 0.75em",
                      }}
                    >
                      {change.totalChanges}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge rounded-pill ${statusCfg.bg}`}
                      style={{ fontSize: "0.78rem", padding: "0.35em 0.75em" }}
                    >
                      {statusCfg.label}
                    </span>
                  </td>
                  <td className="text-muted small" style={{ maxWidth: 220 }}>
                    <span
                      style={{
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 200,
                      }}
                      title={change.comments ?? undefined}
                    >
                      {change.comments || (
                        <span className="text-secondary">—</span>
                      )}
                    </span>
                  </td>
                  <td>
                    <div className="d-flex gap-1 flex-wrap">
                      <Link
                        to={`/dnschanges/${change.id}`}
                        className="btn btn-sm"
                        style={{
                          background:
                            "linear-gradient(90deg, #1e5fa8, #0d1b3e)",
                          color: "#fff",
                          border: "none",
                          fontSize: "0.78rem",
                          padding: "0.28rem 0.7rem",
                          borderRadius: "0.4rem",
                          boxShadow: "0 2px 6px rgba(30,95,168,.3)",
                        }}
                      >
                        <i className="bi bi-eye me-1" />
                        View
                      </Link>
                      {canCancel && onCancel && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-warning"
                          style={{
                            fontSize: "0.78rem",
                            padding: "0.28rem 0.7rem",
                            borderRadius: "0.4rem",
                          }}
                          onClick={() => onCancel(change)}
                        >
                          <i className="bi bi-x-circle me-1" />
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
