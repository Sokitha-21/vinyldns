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
import { formatDateTime } from "../../utils/dateUtils";
import { copyToClipboard } from "../../utils/dateUtils";

// ── Sort arrow (matches ZonesTable pattern) ──────────────────────────────────
type SortDir = "asc" | "desc" | null;
function SortArrow({ dir }: { dir: SortDir }) {
  if (dir === "asc")
    return (
      <i
        className="bi bi-arrow-up"
        style={{ fontSize: "0.7rem", color: "#2e5090", marginLeft: 3 }}
      />
    );
  if (dir === "desc")
    return (
      <i
        className="bi bi-arrow-down"
        style={{ fontSize: "0.7rem", color: "#2e5090", marginLeft: 3 }}
      />
    );
  return (
    <i
      className="bi bi-arrow-down-up"
      style={{
        fontSize: "0.65rem",
        color: "#898a8b",
        marginLeft: 3,
        opacity: 0.7,
      }}
    />
  );
}

// ── Status badge mapping ──────────────────────────────────────────────────────
function recStatusClass(status: string): string {
  if (status === "Active") return "vds-status-badge--success";
  if (status === "PendingDelete") return "vds-status-badge--danger";
  if (status === "PendingUpdate") return "vds-status-badge--warning";
  if (status === "Pending") return "vds-status-badge--warning";
  if (status === "Inactive") return "vds-status-badge--secondary";
  return "vds-status-badge--secondary";
}
function recStatusLabel(status: string): string {
  if (status === "PendingDelete") return "Pending Delete";
  if (status === "PendingUpdate") return "Pending Update";
  return status;
}

// ── Record data summarizer ─────────────────────────────────────────────────────
function summarizeRecordData(rec: any): string {
  const records: any[] = rec.records ?? [];
  if (records.length === 0) return rec.data ?? "—";
  const first = records[0];
  const val =
    first.address ??
    first.cname ??
    first.ptrdname ??
    first.text ??
    first.nsdname ??
    first.exchange ??
    first.target ??
    first.value ??
    "";
  return records.length > 1
    ? `${String(val)} (+${records.length - 1} more)`
    : String(val || "—");
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface RecordsTableProps {
  records: any[];
  onEdit?: (record: any) => void;
  onDelete?: (record: any) => void;
  onViewHistory?: (record: any) => void;
  showZone?: boolean;
  showOwnerGroup?: boolean;
  nameSort?: string;
  onToggleSort?: (sort: string) => void;
}

// ── Main component ────────────────────────────────────────────────────────────
const fqdnInitials = (fqdn: string): string =>
  fqdn
    .replace(/\.$/, "")
    .split(/[.\-_]+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || fqdn.slice(0, 2).toUpperCase();
export function RecordsTable({
  records,
  onEdit,
  onDelete,
  onViewHistory,
  showZone = true,
  showOwnerGroup = false,
  nameSort = "",
  onToggleSort,
}: RecordsTableProps) {
  const handleSortToggle = () => {
    if (!onToggleSort) return;
    onToggleSort(nameSort === "ASC" ? "DESC" : "ASC");
  };

  const sortDir: SortDir =
    nameSort === "ASC" ? "asc" : nameSort === "DESC" ? "desc" : null;

  if (records.length === 0) {
    return (
      <div className="vds-empty-state">
        <i className="bi bi-search fs-1 mb-2" style={{ opacity: 0.4 }} />
        <p className="mb-0 fw-semibold">No records found</p>
        <small className="text-muted">
          Enter a FQDN above and press Enter.
        </small>
      </div>
    );
  }

  return (
    <div className="vds-zones-table-wrap">
      <table className="vds-zones-table">
        <thead>
          <tr>
            <th
              onClick={handleSortToggle}
              style={{
                cursor: onToggleSort ? "pointer" : "default",
                userSelect: "none",
                whiteSpace: "nowrap",
              }}
            >
              FQDN <SortArrow dir={sortDir} />
            </th>
            <th>TYPE</th>
            <th>TTL</th>
            <th>RECORD DATA</th>
            {showZone && <th>ZONE</th>}
            <th>ZONE ACCESS</th>
            {showOwnerGroup && <th>OWNER GROUP</th>}
            <th>STATUS</th>
            <th>LAST UPDATED</th>
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {records.map((rec, idx) => {
            const isShared =
              rec.zoneShared === true
                ? "shared"
                : rec.zoneShared === false
                  ? "private"
                  : null;
            const fqdn =
              rec.fqdn ??
              (rec.name && rec.zoneName
                ? `${String(rec.name)}.${String(rec.zoneName)}`
                : (rec.name ?? "—"));

            return (
              <tr key={rec.id ?? idx}>
                {/* FQDN */}
                <td>
                  <div className="d-flex align-items-center gap-2">
                    <span
                      className="vds-zone-avatar"
                      style={{
                        fontSize: "0.6rem",
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        flexShrink: 0,
                      }}
                    >
                      {fqdnInitials(String(fqdn))}
                    </span>
                    <div className="d-flex align-items-center gap-1 min-width-0">
                      <span
                        className="font-monospace small fw-semibold vds-table-primary"
                        style={{ wordBreak: "break-all" }}
                      >
                        {String(fqdn)}
                      </span>
                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0 vds-table-secondary flex-shrink-0"
                        title="Copy FQDN to clipboard"
                        onClick={() => void copyToClipboard(String(fqdn))}
                      >
                        <i
                          className="bi bi-copy"
                          style={{ fontSize: "0.75rem" }}
                        />
                      </button>
                    </div>
                  </div>
                </td>

                {/* TYPE */}
                <td>
                  <span className="vds-type-badge">
                    {String(rec.type ?? "—")}
                  </span>
                </td>

                {/* TTL */}
                <td className="vds-table-secondary small font-monospace">
                  {rec.ttl != null ? `${String(rec.ttl)}s` : "—"}
                </td>

                {/* RECORD DATA */}
                <td
                  className="vds-table-secondary small font-monospace vds-table-nowrap"
                  style={{
                    maxWidth: "200px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                  title={summarizeRecordData(rec)}
                >
                  {summarizeRecordData(rec)}
                </td>

                {/* ZONE */}
                {showZone && (
                  <td className="vds-table-secondary small">
                    {String(rec.zoneName ?? rec.zone ?? "—")}
                  </td>
                )}

                {/* ZONE ACCESS TYPE */}
                <td>
                  {isShared ? (
                    <span
                      className={`vds-access-badge vds-access-badge--${isShared}`}
                    >
                      <i
                        className={`bi ${isShared === "shared" ? "bi-share-fill" : "bi-lock-fill"} me-1`}
                        style={{ fontSize: "0.65rem" }}
                      />
                      {isShared === "shared" ? "Shared" : "Private"}
                    </span>
                  ) : (
                    <span className="vds-table-secondary small">—</span>
                  )}
                </td>

                {/* OWNER GROUP */}
                {showOwnerGroup && (
                  <td className="vds-table-secondary small">
                    {String(rec.ownerGroupName ?? "—")}
                  </td>
                )}

                {/* STATUS */}
                <td>
                  <span
                    className={`vds-status-badge ${recStatusClass(String(rec.status ?? ""))}`}
                  >
                    {recStatusLabel(String(rec.status ?? "—"))}
                  </span>
                </td>

                {/* LAST UPDATED */}
                <td className="vds-table-secondary vds-table-nowrap small">
                  {rec.updated ? formatDateTime(String(rec.updated)) : "—"}
                </td>

                {/* ACTIONS */}
                <td>
                  <div className="d-flex gap-1 flex-nowrap">
                    {onViewHistory && (
                      <button
                        type="button"
                        className="vds-action-btn vds-action-btn--view"
                        title="View history"
                        onClick={() => onViewHistory(rec)}
                      >
                        <i className="bi bi-clock-history" />
                      </button>
                    )}
                    {onEdit && (
                      <button
                        type="button"
                        className="vds-action-btn vds-action-btn--edit"
                        title="Edit record"
                        onClick={() => onEdit(rec)}
                      >
                        <i className="bi bi-pencil" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        className="vds-action-btn vds-action-btn--delete"
                        title="Delete record"
                        onClick={() => onDelete(rec)}
                      >
                        <i className="bi bi-trash" />
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
