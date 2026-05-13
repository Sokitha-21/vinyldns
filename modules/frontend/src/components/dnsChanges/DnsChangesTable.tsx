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

function changeStatusClass(status: string): string {
  if (status === "Complete") return "vds-status-badge--success";
  if (status === "Failed") return "vds-status-badge--danger";
  if (status === "PartialFailure") return "vds-status-badge--warning";
  if (status === "PendingProcessing") return "vds-status-badge--info";
  if (status === "PendingReview") return "vds-status-badge--warning";
  if (status === "Pending") return "vds-status-badge--info";
  if (status === "Rejected") return "vds-status-badge--danger";
  if (status === "Scheduled") return "vds-status-badge--info";
  if (status === "Cancelled") return "vds-status-badge--secondary";
  return "vds-status-badge--secondary";
}
function changeStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PartialFailure: "Partial Failure",
    PendingProcessing: "Pending Processing",
    PendingReview: "Pending Review",
  };
  return map[status] ?? status;
}

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
      <div className="vds-empty-state">
        <i className="bi bi-list-ol fs-1 mb-2" style={{ opacity: 0.4 }} />
        <p className="mb-0 fw-semibold">No DNS changes found</p>
        <small className="text-muted">
          Create a new batch change to get started.
        </small>
      </div>
    );
  }

  return (
    <div className="vds-zones-table-wrap">
      <table className="vds-zones-table">
        <thead>
          <tr>
            <th>SUBMITTED</th>
            {ignoreAccess && <th>SUBMITTER</th>}
            <th>ID</th>
            <th>CHANGES</th>
            <th>STATUS</th>
            <th>DESCRIPTION</th>
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => {
            const canCancel =
              change.approvalStatus === "PendingReview" &&
              currentUserName === change.userName;

            return (
              <tr key={change.id}>
                <td className="vds-table-secondary vds-table-nowrap small">
                  {formatDateTime(change.createdTimestamp)}
                </td>
                {ignoreAccess && (
                  <td>
                    <span className="d-flex align-items-center gap-1">
                      <i
                        className="bi bi-person-circle vds-table-secondary"
                        style={{ fontSize: "0.9rem" }}
                      />
                      <span className="small vds-table-secondary">
                        {change.userName}
                      </span>
                    </span>
                  </td>
                )}
                <td>
                  <div className="d-flex align-items-center gap-1">
                    <Link
                      to={`/dnschanges/${change.id}`}
                      className="text-decoration-none small fw-semibold font-monospace vds-table-primary"
                    >
                      {change.id.substring(0, 8)}…
                    </Link>
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0 vds-table-secondary"
                      style={{ lineHeight: 1, fontSize: "0.78rem" }}
                      title="Copy full ID to clipboard"
                      onClick={() => copyToClipboard(change.id)}
                    >
                      <i className="bi bi-copy" />
                    </button>
                  </div>
                </td>
                <td>
                  <span className="vds-count-badge">{change.totalChanges}</span>
                </td>
                <td>
                  <span
                    className={`vds-status-badge ${changeStatusClass(change.status)}`}
                  >
                    {changeStatusLabel(change.status)}
                  </span>
                </td>
                <td
                  className="vds-table-secondary small"
                  style={{ maxWidth: 220 }}
                >
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
                      <span className="vds-table-placeholder">—</span>
                    )}
                  </span>
                </td>
                <td>
                  <div className="d-flex gap-1 flex-nowrap">
                    <Link
                      to={`/dnschanges/${change.id}`}
                      className="vds-action-btn vds-action-btn--view"
                      title="View"
                    >
                      <i className="bi bi-eye-fill" />
                    </Link>
                    {canCancel && onCancel && (
                      <button
                        type="button"
                        className="vds-action-btn vds-action-btn--cancel"
                        title="Cancel"
                        onClick={() => onCancel(change)}
                      >
                        <i className="bi bi-x-circle" />
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
  );
}
