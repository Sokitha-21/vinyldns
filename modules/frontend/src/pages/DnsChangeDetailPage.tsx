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

import React, { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { dnsChangeService } from "../services/dnsChangeService";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { formatDateTime } from "../utils/dateUtils";
import { copyToClipboard } from "../utils/dateUtils";
import { useDnsChanges } from "../hooks/useDnsChanges";
import { useProfile } from "../contexts/ProfileContext";
import type { SingleChange, ValidationError } from "../types/dnsChange";

// ── Constants ─────────────────────────────────────────────────────────────────

const BATCH_STATUS_CONFIG: Record<string, { bg: string; label: string }> = {
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

const CHANGE_STATUS_CONFIG: Record<string, { bg: string; label: string }> = {
  Complete: { bg: "bg-success", label: "Complete" },
  Pending: { bg: "bg-info text-dark", label: "Pending" },
  NeedsReview: { bg: "bg-warning text-dark", label: "Needs Review" },
  Failed: { bg: "bg-danger", label: "Failed" },
  Rejected: { bg: "bg-danger", label: "Rejected" },
  Cancelled: { bg: "bg-secondary", label: "Cancelled" },
};

const GRADIENT = "linear-gradient(90deg, #1e5fa8, #0d1b3e)";
const GRADIENT_SHADOW = "0 2px 8px rgba(30,95,168,.25)";
const GRADIENT_SHADOW_HOVER = "0 3px 12px rgba(30,95,168,.35)";

// ── Record data renderer ──────────────────────────────────────────────────────

function RecordDataCell({ change }: { change: SingleChange }) {
  const rec = change.record ?? {};
  switch (change.type) {
    case "A":
    case "AAAA":
    case "A+PTR":
    case "AAAA+PTR":
      return (
        <span className="font-monospace small">
          {String(rec.address ?? "—")}
        </span>
      );
    case "CNAME":
      return (
        <span className="font-monospace small">{String(rec.cname ?? "—")}</span>
      );
    case "PTR":
      return (
        <span className="font-monospace small">
          {String(rec.ptrdname ?? "—")}
        </span>
      );
    case "TXT":
    case "SPF":
      return (
        <span className="small" style={{ wordBreak: "break-all" }}>
          {String(rec.text ?? "—")}
        </span>
      );
    case "MX":
      return (
        <ul className="mb-0 ps-3 small">
          <li>Preference: {String(rec.preference ?? "")}</li>
          <li>Exchange: {String(rec.exchange ?? "")}</li>
        </ul>
      );
    case "NS":
      return (
        <span className="font-monospace small">
          {String(rec.nsdname ?? "—")}
        </span>
      );
    case "NAPTR":
      return (
        <ul className="mb-0 ps-3 small">
          <li>Order: {String(rec.order ?? "")}</li>
          <li>Preference: {String(rec.preference ?? "")}</li>
          <li>Flags: {String(rec.flags ?? "")}</li>
          <li>Service: {String(rec.service ?? "")}</li>
          <li>Regexp: {String(rec.regexp ?? "")}</li>
          <li>Replacement: {String(rec.replacement ?? "")}</li>
        </ul>
      );
    case "SRV":
      return (
        <ul className="mb-0 ps-3 small">
          <li>Priority: {String(rec.priority ?? "")}</li>
          <li>Weight: {String(rec.weight ?? "")}</li>
          <li>Port: {String(rec.port ?? "")}</li>
          <li>Target: {String(rec.target ?? "")}</li>
        </ul>
      );
    default:
      return <span className="small text-muted">—</span>;
  }
}

// ── Additional Info renderer ──────────────────────────────────────────────────

function AdditionalInfoCell({
  change,
  batchApprovalStatus,
}: {
  change: SingleChange;
  batchApprovalStatus?: string;
}) {
  const errors: string[] = [];

  if (
    batchApprovalStatus !== "AutoApproved" &&
    change.status !== "Rejected" &&
    change.status !== "Cancelled"
  ) {
    if (change.validationErrors && change.validationErrors.length > 0) {
      change.validationErrors.forEach((e) => {
        const errObj = e as ValidationError;
        errors.push(errObj.message ? errObj.message : String(e));
      });
    }
    if (change.systemMessage) {
      errors.push(change.systemMessage);
    }
  }

  if (
    batchApprovalStatus === "AutoApproved" &&
    change.status === "Complete" &&
    !change.systemMessage
  ) {
    return (
      <span className="small text-muted">
        ℹ️ No further action is required.
      </span>
    );
  }

  if (
    batchApprovalStatus === "AutoApproved" &&
    change.status === "Complete" &&
    change.systemMessage
  ) {
    return <span className="small text-muted">ℹ️ {change.systemMessage}</span>;
  }

  if (change.systemMessage && change.status === "Failed") {
    return <span className="small text-danger">{change.systemMessage}</span>;
  }

  if (errors.length === 0) return <span className="text-muted">—</span>;

  return (
    <ul className="mb-0 ps-3 small text-danger">
      {errors.map((msg, i) => (
        <li key={i}>{msg}</li>
      ))}
    </ul>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function DnsChangeDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { approveBatchChange, rejectBatchChange, cancelBatchChange } =
    useDnsChanges();

  const canReview = Boolean(profile?.isSuper || profile?.isSupport);
  const currentUserName = profile?.userName ?? "";

  // Inline search for changes table
  const [query, setQuery] = useState("");
  // Review panel state
  const [reviewComment, setReviewComment] = useState("");
  const [reviewType, setReviewType] = useState<"approve" | "reject" | null>(
    null,
  );
  // Cancel confirm modal
  const [showCancelModal, setShowCancelModal] = useState(false);

  const {
    data: change,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["dnschange", id],
    queryFn: async () => {
      const res = await dnsChangeService.getBatchChange(id);
      return res.data;
    },
    enabled: Boolean(id),
  });

  if (isLoading) return <LoadingSpinner />;
  if (!change)
    return <div className="alert alert-danger">Batch change not found.</div>;

  const batchStatus = BATCH_STATUS_CONFIG[change.status] ?? {
    bg: "bg-secondary",
    label: change.status,
  };
  const approvalStatus = change.approvalStatus ?? "";

  const canCancelChange =
    approvalStatus === "PendingReview" && currentUserName === change.userName;

  const handleApprove = () => {
    if (reviewType === "approve") {
      approveBatchChange(
        { id: change.id, comment: reviewComment || undefined },
        {
          onSuccess: () => {
            void refetch();
            setReviewType(null);
            setReviewComment("");
          },
        },
      );
    } else {
      setReviewType("approve");
    }
  };

  const handleReject = () => {
    if (reviewType === "reject") {
      rejectBatchChange(
        { id: change.id, comment: reviewComment || undefined },
        {
          onSuccess: () => {
            void refetch();
            setReviewType(null);
            setReviewComment("");
          },
        },
      );
    } else {
      setReviewType("reject");
    }
  };

  const handleCancelReview = () => {
    setReviewType(null);
    setReviewComment("");
  };

  const handleCancelChange = () => {
    cancelBatchChange(change.id, {
      onSuccess: () => {
        setShowCancelModal(false);
        void refetch();
      },
    });
  };

  // Filter changes by query (mirrors Angular filter:query which does string matching)
  const filteredChanges = query.trim()
    ? change.changes.filter((c) => {
        const q = query.toLowerCase();
        return (
          c.changeType.toLowerCase().includes(q) ||
          c.inputName.toLowerCase().includes(q) ||
          (c.recordName ?? "").toLowerCase().includes(q) ||
          (c.zoneName ?? "").toLowerCase().includes(q) ||
          c.type.toLowerCase().includes(q) ||
          c.status.toLowerCase().includes(q) ||
          (c.systemMessage ?? "").toLowerCase().includes(q)
        );
      })
    : change.changes;

  const reviewConfirmationMsg =
    reviewType === "approve"
      ? "Confirm approval of this DNS change?"
      : "Confirm rejection of this DNS change?";

  return (
    <div>
      {/* ── Breadcrumb ── */}
      <nav aria-label="breadcrumb" className="mb-2">
        <ol className="breadcrumb mb-0" style={{ fontSize: "0.82rem" }}>
          <li className="breadcrumb-item">
            <a href="/" className="text-decoration-none text-secondary">
              <i className="bi bi-house-door me-1" />
              Home
            </a>
          </li>
          <li className="breadcrumb-item">
            <Link
              to="/dnschanges"
              className="text-decoration-none text-secondary"
            >
              DNS Changes
            </Link>
          </li>
          <li
            className="breadcrumb-item active text-primary fw-semibold"
            aria-current="page"
          >
            {id.substring(0, 8)}…
          </li>
        </ol>
      </nav>

      {/* ── Page header ── */}
      <div
        className="rounded-3 mb-4 d-flex justify-content-between align-items-center"
        style={{
          background: "#ffffff",
          border: "1px solid #e0e0e0",
          boxShadow: "0 2px 8px rgba(0,0,0,.06)",
          padding: "1rem 1.5rem",
        }}
      >
        <div className="d-flex align-items-center gap-3">
          <div
            className="rounded-3 d-flex align-items-center justify-content-center"
            style={{
              width: 48,
              height: 48,
              background: GRADIENT,
              boxShadow: "0 4px 12px rgba(30,95,168,.3)",
            }}
          >
            <i className="bi bi-list-ol text-white fs-5" />
          </div>
          <div>
            <h4
              className="mb-0 fw-bold d-flex align-items-center gap-2"
              style={{ color: "#0d1b2a", letterSpacing: "-0.01em" }}
            >
              DNS Change
              <span
                className={`badge ${batchStatus.bg}`}
                style={{ fontSize: "0.75rem" }}
              >
                {batchStatus.label}
              </span>
            </h4>
            <small className="text-muted">
              View and manage this DNS change request
            </small>
          </div>
        </div>
        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-sm d-flex align-items-center gap-1"
            style={{
              background: GRADIENT,
              border: "none",
              color: "#fff",
              boxShadow: GRADIENT_SHADOW,
              transition: "box-shadow 0.2s",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.boxShadow = GRADIENT_SHADOW_HOVER)
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.boxShadow = GRADIENT_SHADOW)
            }
            onClick={() => dnsChangeService.exportToCsv(change)}
          >
            <i className="bi bi-download" />
            Export CSV
          </button>
          {canCancelChange && (
            <button
              type="button"
              className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1"
              onClick={() => setShowCancelModal(true)}
            >
              <i className="bi bi-x-circle" />
              Cancel Changes
            </button>
          )}
        </div>
      </div>

      {/* ── Summary card ── */}
      <div
        className="card border-0 mb-4"
        style={{
          borderRadius: "0.75rem",
          boxShadow: "0 2px 12px rgba(30,95,168,.08)",
        }}
      >
        <div
          className="card-header border-0 fw-semibold d-flex align-items-center gap-2"
          style={{
            background: GRADIENT,
            color: "#fff",
            borderRadius: "0.75rem 0.75rem 0 0",
            fontSize: "0.9rem",
          }}
        >
          <i className="bi bi-info-circle" />
          Batch Change Details
        </div>
        <div className="card-body">
          <div className="row g-3" style={{ fontSize: "0.9rem" }}>
            {/* ID */}
            <div className="col-md-6 col-lg-4">
              <div
                className="text-muted small fw-semibold mb-1"
                style={{ letterSpacing: "0.04em" }}
              >
                ID
              </div>
              <div className="d-flex align-items-center gap-1">
                <span
                  className="font-monospace"
                  style={{ fontSize: "0.82rem" }}
                >
                  {change.id}
                </span>
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 text-muted"
                  title="Copy ID to clipboard"
                  onClick={() => void copyToClipboard(change.id)}
                >
                  <i className="bi bi-copy" style={{ fontSize: "0.78rem" }} />
                </button>
              </div>
            </div>

            {/* Submitted */}
            <div className="col-md-6 col-lg-4">
              <div
                className="text-muted small fw-semibold mb-1"
                style={{ letterSpacing: "0.04em" }}
              >
                SUBMITTED
              </div>
              <div>{formatDateTime(change.createdTimestamp)}</div>
            </div>

            {/* Submitter (show if different from current user) */}
            {currentUserName !== change.userName && (
              <div className="col-md-6 col-lg-4">
                <div
                  className="text-muted small fw-semibold mb-1"
                  style={{ letterSpacing: "0.04em" }}
                >
                  SUBMITTER
                </div>
                <div className="d-flex align-items-center gap-1">
                  <i className="bi bi-person-circle text-muted" />
                  {change.userName}
                </div>
              </div>
            )}

            {/* Description */}
            {change.comments && (
              <div className="col-md-12 col-lg-8">
                <div
                  className="text-muted small fw-semibold mb-1"
                  style={{ letterSpacing: "0.04em" }}
                >
                  DESCRIPTION
                </div>
                <div>{change.comments}</div>
              </div>
            )}

            {/* Owner Group */}
            {change.ownerGroupName && (
              <div className="col-md-6 col-lg-4">
                <div
                  className="text-muted small fw-semibold mb-1"
                  style={{ letterSpacing: "0.04em" }}
                >
                  RECORD OWNER GROUP
                </div>
                <div>{change.ownerGroupName}</div>
              </div>
            )}
            {change.ownerGroupId && !change.ownerGroupName && (
              <div className="col-md-6 col-lg-4">
                <div
                  className="text-muted small fw-semibold mb-1"
                  style={{ letterSpacing: "0.04em" }}
                >
                  RECORD OWNER GROUP
                </div>
                <div className="text-danger d-flex align-items-center gap-1">
                  <i className="bi bi-exclamation-triangle-fill" />
                  Group deleted (ID: {change.ownerGroupId})
                </div>
              </div>
            )}

            {/* Scheduled Time */}
            {change.scheduledTime && (
              <div className="col-md-6 col-lg-4">
                <div
                  className="text-muted small fw-semibold mb-1"
                  style={{ letterSpacing: "0.04em" }}
                >
                  REQUEST DATE/TIME
                </div>
                <div>{formatDateTime(change.scheduledTime)}</div>
              </div>
            )}

            {/* Approval / Review Status */}
            {approvalStatus && (
              <div className="col-md-6 col-lg-4">
                <div
                  className="text-muted small fw-semibold mb-1"
                  style={{ letterSpacing: "0.04em" }}
                >
                  REVIEW STATUS
                </div>
                <div>
                  {approvalStatus === "PendingReview" && (
                    <span className="badge bg-warning text-dark">
                      Pending Review
                    </span>
                  )}
                  {approvalStatus === "ManuallyApproved" && (
                    <span className="badge bg-success">Approved</span>
                  )}
                  {approvalStatus === "ManuallyRejected" && (
                    <span className="badge bg-danger">Rejected</span>
                  )}
                  {approvalStatus === "Cancelled" && (
                    <span className="badge bg-secondary">Cancelled</span>
                  )}
                  {approvalStatus === "AutoApproved" && (
                    <span className="badge bg-info text-dark">
                      Auto-Approved
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Reviewer info (when approved or rejected) */}
            {(approvalStatus === "ManuallyApproved" ||
              approvalStatus === "ManuallyRejected") && (
              <>
                <div className="col-md-6 col-lg-4">
                  <div
                    className="text-muted small fw-semibold mb-1"
                    style={{ letterSpacing: "0.04em" }}
                  >
                    REVIEWER
                  </div>
                  {change.reviewerUserName ? (
                    <div className="d-flex align-items-center gap-1">
                      <i className="bi bi-person-check-fill text-muted" />
                      {change.reviewerUserName}
                    </div>
                  ) : change.reviewerId ? (
                    <div className="text-danger d-flex align-items-center gap-1">
                      <i className="bi bi-exclamation-triangle-fill" />
                      Reviewer deleted
                    </div>
                  ) : null}
                </div>
                {change.reviewComment && (
                  <div className="col-md-6 col-lg-4">
                    <div
                      className="text-muted small fw-semibold mb-1"
                      style={{ letterSpacing: "0.04em" }}
                    >
                      REVIEW COMMENT
                    </div>
                    <div>{change.reviewComment}</div>
                  </div>
                )}
                {change.reviewTimestamp && (
                  <div className="col-md-6 col-lg-4">
                    <div
                      className="text-muted small fw-semibold mb-1"
                      style={{ letterSpacing: "0.04em" }}
                    >
                      REVIEW TIME
                    </div>
                    <div>{formatDateTime(change.reviewTimestamp)}</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Changes table ── */}
      <div
        className="card border-0 mb-4"
        style={{
          borderRadius: "0.75rem",
          boxShadow: "0 2px 12px rgba(30,95,168,.08)",
          overflow: "hidden",
        }}
      >
        <div
          className="card-header border-0 d-flex align-items-center justify-content-between"
          style={{
            background: GRADIENT,
            color: "#fff",
            borderRadius: "0.75rem 0.75rem 0 0",
          }}
        >
          <div
            className="d-flex align-items-center gap-2 fw-semibold"
            style={{ fontSize: "0.9rem" }}
          >
            <i className="bi bi-list-check" />
            Changes
            <span
              className="badge rounded-pill"
              style={{
                background: "rgba(255,255,255,0.25)",
                color: "#fff",
                fontSize: "0.78rem",
              }}
            >
              {filteredChanges.length}
              {query && ` / ${change.changes.length}`}
            </span>
          </div>
          <div className="d-flex gap-2 align-items-center">
            <button
              type="button"
              className="btn btn-sm d-flex align-items-center gap-1"
              style={{
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.3)",
                color: "#fff",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.25)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.15)")
              }
              onClick={() => void refetch()}
            >
              <i className="bi bi-arrow-clockwise" />
              Refresh
            </button>
            {/* Inline search */}
            <div
              className="input-group input-group-sm"
              style={{ maxWidth: 260 }}
            >
              <span
                className="input-group-text"
                style={{
                  background: "rgba(255,255,255,0.15)",
                  border: "1px solid rgba(255,255,255,0.3)",
                }}
              >
                <i
                  className="bi bi-search text-white"
                  style={{ fontSize: "0.78rem" }}
                />
              </span>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Filter changes…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  background: "rgba(255,255,255,0.15)",
                  border: "1px solid rgba(255,255,255,0.3)",
                  color: "#fff",
                  boxShadow: "none",
                }}
              />
              {query && (
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    background: "rgba(255,255,255,0.15)",
                    border: "1px solid rgba(255,255,255,0.3)",
                    color: "#fff",
                  }}
                  onClick={() => setQuery("")}
                >
                  <i className="bi bi-x" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="table-responsive">
          <table
            className="table table-hover align-middle mb-0"
            style={{ fontSize: "0.85rem" }}
          >
            <thead>
              <tr
                style={{
                  background: "#cfe0f5",
                  borderBottom: "2px solid #9ec5e0",
                }}
              >
                {[
                  "CHANGE TYPE",
                  "INPUT NAME",
                  "RECORDSET NAME",
                  "ZONE NAME",
                  "RECORD TYPE",
                  "RECORD DATA",
                  "TTL",
                  "STATUS",
                  "ADDITIONAL INFO",
                ].map((h) => (
                  <th
                    key={h}
                    className="fw-semibold border-0 py-2"
                    style={{
                      fontSize: "0.78rem",
                      letterSpacing: "0.04em",
                      color: "#2c4a6e",
                      whiteSpace: "nowrap",
                      background: "transparent",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredChanges.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-muted py-4">
                    {query
                      ? "No changes match your filter."
                      : "No changes found."}
                  </td>
                </tr>
              ) : (
                filteredChanges.map((c, idx) => {
                  const changeSt = CHANGE_STATUS_CONFIG[c.status] ?? {
                    bg: "bg-secondary",
                    label: c.status,
                  };
                  const hasErrors =
                    (c.validationErrors && c.validationErrors.length > 0) ||
                    c.outstandingErrors;
                  return (
                    <tr
                      key={c.id}
                      style={{
                        background: hasErrors
                          ? "#fff5f5"
                          : idx % 2 === 0
                            ? "#fff"
                            : "#f8fbff",
                        borderLeft: hasErrors
                          ? "3px solid #dc3545"
                          : "3px solid transparent",
                      }}
                    >
                      <td>
                        <span
                          className="badge rounded-pill"
                          style={{
                            background:
                              c.changeType === "Add"
                                ? "linear-gradient(90deg,#198754,#0f5132)"
                                : "linear-gradient(90deg,#6c757d,#495057)",
                            color: "#fff",
                            fontSize: "0.75rem",
                            padding: "0.3em 0.65em",
                          }}
                        >
                          {c.changeType}
                        </span>
                      </td>
                      <td
                        className="font-monospace"
                        style={{
                          maxWidth: 180,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span title={c.inputName}>{c.inputName}</span>
                      </td>
                      <td
                        className="text-muted"
                        style={{
                          maxWidth: 140,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span title={c.recordName ?? ""}>
                          {c.recordName || "—"}
                        </span>
                      </td>
                      <td
                        className="text-muted"
                        style={{
                          maxWidth: 140,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        <span title={c.zoneName ?? ""}>
                          {c.zoneName || "—"}
                        </span>
                      </td>
                      <td>
                        <span
                          className="badge rounded-pill"
                          style={{
                            background:
                              "linear-gradient(90deg, #1e5fa8, #0d1b3e)",
                            color: "#fff",
                            fontSize: "0.75rem",
                            padding: "0.3em 0.65em",
                          }}
                        >
                          {c.type}
                        </span>
                      </td>
                      <td style={{ maxWidth: 180 }}>
                        <RecordDataCell change={c} />
                      </td>
                      <td className="text-muted">{c.ttl ?? "—"}</td>
                      <td>
                        <span
                          className={`badge rounded-pill ${changeSt.bg}`}
                          style={{
                            fontSize: "0.75rem",
                            padding: "0.3em 0.65em",
                          }}
                        >
                          {changeSt.label}
                        </span>
                      </td>
                      <td style={{ maxWidth: 220 }}>
                        <AdditionalInfoCell
                          change={c}
                          batchApprovalStatus={approvalStatus}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Review panel (super/support users only, when PendingReview) ── */}
      {canReview && approvalStatus === "PendingReview" && (
        <div
          className="card border-0 mb-4"
          style={{
            borderRadius: "0.75rem",
            boxShadow: "0 2px 12px rgba(30,95,168,.08)",
          }}
        >
          <div
            className="card-header border-0 fw-semibold d-flex align-items-center gap-2"
            style={{
              background: GRADIENT,
              color: "#fff",
              borderRadius: "0.75rem 0.75rem 0 0",
              fontSize: "0.9rem",
            }}
          >
            <i className="bi bi-clipboard-check" />
            Review DNS Change
          </div>
          <div className="card-body">
            <label
              className="form-label fw-semibold text-secondary"
              style={{ fontSize: "0.85rem" }}
            >
              Review Comment (optional)
            </label>
            <textarea
              className="form-control form-control-sm mb-3"
              rows={3}
              placeholder="Add a review comment…"
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
            />
          </div>
          <div
            className="card-footer bg-white d-flex justify-content-end gap-2"
            style={{ borderRadius: "0 0 0.75rem 0.75rem" }}
          >
            {!reviewType ? (
              <>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    background: "linear-gradient(90deg,#198754,#0f5132)",
                    border: "none",
                    color: "#fff",
                    boxShadow: "0 2px 8px rgba(25,135,84,.3)",
                  }}
                  onClick={handleApprove}
                >
                  <i className="bi bi-check-circle me-1" />
                  Approve
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    background: "linear-gradient(90deg,#d32f2f,#7d0a0a)",
                    border: "none",
                    color: "#fff",
                    boxShadow: "0 2px 8px rgba(211,47,47,.3)",
                  }}
                  onClick={handleReject}
                >
                  <i className="bi bi-x-circle me-1" />
                  Reject
                </button>
              </>
            ) : (
              <>
                <span className="align-self-center text-muted small me-2">
                  {reviewConfirmationMsg}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={handleCancelReview}
                >
                  Cancel Review
                </button>
                {reviewType === "approve" && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{
                      background: "linear-gradient(90deg,#198754,#0f5132)",
                      border: "none",
                      color: "#fff",
                      boxShadow: "0 2px 8px rgba(25,135,84,.3)",
                    }}
                    onClick={handleApprove}
                  >
                    <i className="bi bi-check-circle me-1" />
                    Confirm Approval
                  </button>
                )}
                {reviewType === "reject" && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{
                      background: "linear-gradient(90deg,#d32f2f,#7d0a0a)",
                      border: "none",
                      color: "#fff",
                      boxShadow: "0 2px 8px rgba(211,47,47,.3)",
                    }}
                    onClick={handleReject}
                  >
                    <i className="bi bi-x-circle me-1" />
                    Confirm Rejection
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Cancel confirmation modal ── */}
      {showCancelModal && (
        <div
          className="modal d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowCancelModal(false);
          }}
        >
          <div className="modal-dialog modal-dialog-centered modal-sm">
            <div
              className="modal-content border-0"
              style={{
                borderRadius: "0.75rem",
                overflow: "hidden",
                boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
              }}
            >
              <div
                className="modal-header border-0"
                style={{
                  background: GRADIENT,
                  color: "#fff",
                  borderRadius: "0.75rem 0.75rem 0 0",
                }}
              >
                <h6 className="modal-title fw-bold d-flex align-items-center gap-2">
                  <i className="bi bi-list-ol" />
                  Cancel DNS Change
                </h6>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setShowCancelModal(false)}
                />
              </div>
              <div className="modal-body" style={{ fontSize: "0.9rem" }}>
                <p className="mb-0">
                  Are you sure you want to cancel DNS Change?
                </p>
                <p className="font-monospace text-muted small mt-1">
                  {change.id}
                </p>
              </div>
              <div className="modal-footer border-0 gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setShowCancelModal(false)}
                >
                  Decline
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    background: "linear-gradient(90deg,#198754,#0f5132)",
                    border: "none",
                    color: "#fff",
                  }}
                  onClick={handleCancelChange}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
