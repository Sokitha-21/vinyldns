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

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { dnsChangeService } from "../services/dnsChangeService";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { formatDateTime } from "../utils/dateUtils";
import { copyToClipboard } from "../utils/dateUtils";
import { useDnsChanges } from "../hooks/useDnsChanges";
import { useProfile } from "../contexts/ProfileContext";
import { useBreadcrumbs } from "../contexts/BreadcrumbContext";
import type { SingleChange, ValidationError } from "../types/dnsChange";

// ── Batch-level status helpers ────────────────────────────────────────────────

function batchStatusClass(status: string): string {
  switch (status) {
    case "Complete":
      return "vds-status-badge--success";
    case "Failed":
      return "vds-status-badge--danger";
    case "PartialFailure":
      return "vds-status-badge--warning";
    case "PendingProcessing":
      return "vds-status-badge--info";
    case "PendingReview":
      return "vds-status-badge--warning";
    case "Rejected":
      return "vds-status-badge--danger";
    case "Scheduled":
      return "vds-status-badge--info";
    case "Cancelled":
      return "vds-status-badge--secondary";
    default:
      return "vds-status-badge--secondary";
  }
}

function batchStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PartialFailure: "Partial Failure",
    PendingProcessing: "Pending Processing",
    PendingReview: "Pending Review",
  };
  return map[status] ?? status;
}

// ── Approval-status helpers ───────────────────────────────────────────────────

function approvalStatusClass(status: string): string {
  switch (status) {
    case "PendingReview":
      return "vds-status-badge--warning";
    case "ManuallyApproved":
      return "vds-status-badge--success";
    case "ManuallyRejected":
      return "vds-status-badge--danger";
    case "Cancelled":
      return "vds-status-badge--secondary";
    default:
      return "vds-status-badge--secondary";
  }
}

function approvalStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PendingReview: "Pending Review",
    ManuallyApproved: "Approved",
    ManuallyRejected: "Rejected",
  };
  return map[status] ?? status;
}

// ── Per-change status helpers ─────────────────────────────────────────────────

function changeStatusClass(status: string): string {
  switch (status) {
    case "Complete":
      return "vds-status-badge--success";
    case "Pending":
      return "vds-status-badge--info";
    case "NeedsReview":
      return "vds-status-badge--warning";
    case "Failed":
      return "vds-status-badge--danger";
    case "Rejected":
      return "vds-status-badge--danger";
    case "Cancelled":
      return "vds-status-badge--secondary";
    default:
      return "vds-status-badge--secondary";
  }
}

function changeStatusLabel(status: string): string {
  const map: Record<string, string> = { NeedsReview: "Needs Review" };
  return map[status] ?? status;
}

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
          {String(rec.address ?? "\u2014")}
        </span>
      );
    case "CNAME":
      return (
        <span className="font-monospace small">
          {String(rec.cname ?? "\u2014")}
        </span>
      );
    case "PTR":
      return (
        <span className="font-monospace small">
          {String(rec.ptrdname ?? "\u2014")}
        </span>
      );
    case "TXT":
    case "SPF":
      return (
        <span className="small" style={{ wordBreak: "break-all" }}>
          {String(rec.text ?? "\u2014")}
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
          {String(rec.nsdname ?? "\u2014")}
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
      return <span className="small vds-table-secondary">\u2014</span>;
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
      <span className="small vds-table-secondary">
        No further action is required.
      </span>
    );
  }

  if (
    batchApprovalStatus === "AutoApproved" &&
    change.status === "Complete" &&
    change.systemMessage
  ) {
    return (
      <span className="small vds-table-secondary">
        \u2139\ufe0f {change.systemMessage}
      </span>
    );
  }

  if (change.systemMessage && change.status === "Failed") {
    return <span className="small text-danger">{change.systemMessage}</span>;
  }

  if (errors.length === 0)
    return <span className="vds-table-secondary small">\u2014</span>;

  return (
    <ul className="mb-0 ps-3 small text-danger">
      {errors.map((msg, i) => (
        <li key={i}>{msg}</li>
      ))}
    </ul>
  );
}

// ── Change type badge ─────────────────────────────────────────────────────────

function ChangeTypeBadge({ changeType }: { changeType: string }) {
  let mod = "vds-change-type-badge--default";
  if (changeType === "Add") mod = "vds-change-type-badge--add";
  else if (changeType === "DeleteRecordSet")
    mod = "vds-change-type-badge--delete";
  else if (changeType === "UpdateRecord") mod = "vds-change-type-badge--update";
  return <span className={`vds-change-type-badge ${mod}`}>{changeType}</span>;
}

// ── Main component ────────────────────────────────────────────────────────────

export function DnsChangeDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { profile } = useProfile();
  const { approveBatchChange, rejectBatchChange, cancelBatchChange } =
    useDnsChanges();
  const { setCrumbs } = useBreadcrumbs();

  const canReview = Boolean(profile?.isSuper || profile?.isSupport);
  const currentUserName = profile?.userName ?? "";

  // Breadcrumb
  useEffect(() => {
    setCrumbs([
      { label: "DNS Changes", to: "/dnschanges" },
      { label: id ? `${id.substring(0, 8)}\u2026` : "Detail" },
    ]);
    return () => setCrumbs(null);
  }, [id, setCrumbs]);

  const [query, setQuery] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [reviewType, setReviewType] = useState<"approve" | "reject" | null>(
    null,
  );
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

  const handleApprove = useCallback(() => {
    if (!change) return;
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
  }, [reviewType, change, reviewComment, approveBatchChange, refetch]);

  const handleReject = useCallback(() => {
    if (!change) return;
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
  }, [reviewType, change, reviewComment, rejectBatchChange, refetch]);

  const handleCancelReview = useCallback(() => {
    setReviewType(null);
    setReviewComment("");
  }, []);

  const handleCancelChange = useCallback(() => {
    if (!change) return;
    cancelBatchChange(change.id, {
      onSuccess: () => {
        setShowCancelModal(false);
        void refetch();
      },
    });
  }, [change, cancelBatchChange, refetch]);

  const filteredChanges = useMemo(
    () =>
      query.trim()
        ? (change?.changes ?? []).filter((c) => {
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
        : (change?.changes ?? []),
    [query, change],
  );

  // ── Loading / error states ───────────────────────────────────────────────────

  if (isLoading) return <LoadingSpinner />;

  if (!change)
    return (
      <div className="vds-empty-state">
        <i
          className="bi bi-exclamation-triangle fs-1 mb-2 text-danger"
          style={{ opacity: 0.7 }}
        />
        <p className="mb-0 fw-semibold">Batch change not found</p>
        <small className="text-muted mb-3">
          The requested DNS change does not exist or was removed.
        </small>
        <Link to="/dnschanges" className="btn btn-sm btn-outline-primary mt-2">
          <i className="bi bi-arrow-left me-1" />
          Back to DNS Changes
        </Link>
      </div>
    );

  const approvalStatus = change.approvalStatus ?? "";
  const canCancelChange =
    approvalStatus === "PendingReview" && currentUserName === change.userName;
  const reviewConfirmationMsg =
    reviewType === "approve"
      ? "Confirm approval of this DNS change?"
      : "Confirm rejection of this DNS change?";
  const showReviewStatus =
    approvalStatus === "PendingReview" ||
    approvalStatus === "ManuallyApproved" ||
    approvalStatus === "ManuallyRejected" ||
    approvalStatus === "Cancelled";

  return (
    <div>
      {/* ── Page header ── */}
      <div className="vds-page-header rounded-3 mb-3 d-flex justify-content-between align-items-center flex-wrap gap-3">
        <div className="d-flex align-items-center gap-3">
          <div className="vds-page-header__icon rounded-3 d-flex align-items-center justify-content-center">
            <i className="bi bi-list-ol text-white fs-5" />
          </div>
          <div>
            <div className="d-flex align-items-center gap-2 flex-wrap mb-1">
              <h4 className="mb-0 fw-bold vds-page-header__title">
                DNS Change
              </h4>
              <span
                className={`vds-status-badge ${batchStatusClass(change.status)}`}
              >
                {batchStatusLabel(change.status)}
              </span>
            </div>
            <small className="text-muted font-monospace">{change.id}</small>
          </div>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <button
            type="button"
            className="btn btn-sm vds-btn-flat d-flex align-items-center gap-1"
            onClick={() => dnsChangeService.exportToCsv(change)}
          >
            <i className="bi bi-download" />
            <span className="vds-btn-flat__label">Export CSV</span>
          </button>
        </div>
      </div>

      {/* ── Info strip ── */}
      <div className="vds-info-strip">
        <div>
          <div className="d-flex align-items-center gap-2 vds-info-label">
            Batch ID
            <button
              type="button"
              className="btn btn-sm p-0 border-0 bg-transparent vds-copy-btn text-secondary"
              title="Copy Batch ID"
              onClick={() => void copyToClipboard(change.id)}
            >
              <i className="bi bi-clipboard" />
            </button>
          </div>
          <div className="fw-semibold text-break vds-info-value font-monospace">
            {change.id}
          </div>
        </div>
        <div>
          <div className="vds-info-label">Submitted</div>
          <div className="vds-info-value">
            {formatDateTime(change.createdTimestamp)}
          </div>
        </div>
        <div>
          <div className="vds-info-label">Submitter</div>
          <div className="vds-info-value">{change.userName}</div>
        </div>
        {(change.ownerGroupName || change.ownerGroupId) && (
          <div>
            <div className="vds-info-label">Owner Group</div>
            <div className="vds-info-value">
              {change.ownerGroupName ?? (
                <span className="text-danger small">
                  <i className="bi bi-exclamation-triangle-fill me-1" />
                  Group deleted
                </span>
              )}
            </div>
          </div>
        )}
        {change.scheduledTime && (
          <div>
            <div className="vds-info-label">Scheduled</div>
            <div className="vds-info-value">
              {formatDateTime(change.scheduledTime)}
            </div>
          </div>
        )}
        {showReviewStatus && (
          <div>
            <div className="vds-info-label">Review Status</div>
            <div className="mt-1">
              <span
                className={`vds-status-badge ${approvalStatusClass(approvalStatus)}`}
              >
                {approvalStatusLabel(approvalStatus)}
              </span>
            </div>
          </div>
        )}
        {change.changes?.length != null && (
          <div>
            <div className="vds-info-label">Total Changes</div>
            <div className="vds-info-value">{change.changes.length}</div>
          </div>
        )}
      </div>

      {/* ── Description callout (when present) ── */}
      {change.comments && (
        <div
          className="d-flex gap-2 align-items-start p-3 rounded-3 mb-3"
          style={{
            background: "rgba(30,95,168,0.05)",
            border: "1px solid #dce8fb",
          }}
        >
          <i
            className="bi bi-chat-left-text text-primary mt-1"
            style={{ fontSize: "0.85rem", flexShrink: 0 }}
          />
          <div>
            <div className="vds-info-label mb-1">Description</div>
            <p className="mb-0 small">{change.comments}</p>
          </div>
        </div>
      )}

      {/* ── Review details (when manually approved / rejected) ── */}
      {(approvalStatus === "ManuallyApproved" ||
        approvalStatus === "ManuallyRejected") && (
        <div
          className="d-flex flex-column gap-2 p-3 rounded-3 mb-3"
          style={{
            background:
              approvalStatus === "ManuallyApproved"
                ? "rgba(34,197,94,0.06)"
                : "rgba(239,68,68,0.06)",
            border: `1px solid ${approvalStatus === "ManuallyApproved" ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.16)"}`,
          }}
        >
          <div className="d-flex align-items-center gap-2">
            <i
              className={`bi ${approvalStatus === "ManuallyApproved" ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"}`}
              style={{ fontSize: "0.95rem" }}
            />
            <span className="fw-semibold small">
              {approvalStatus === "ManuallyApproved" ? "Approved" : "Rejected"}{" "}
              by{" "}
              {change.reviewerUserName ?? (
                <span className="text-danger">
                  <i className="bi bi-exclamation-triangle-fill me-1" />
                  deleted reviewer
                </span>
              )}
              {change.reviewTimestamp && (
                <span className="text-muted fw-normal">
                  {" "}
                  · {formatDateTime(change.reviewTimestamp)}
                </span>
              )}
            </span>
          </div>
          {change.reviewComment && (
            <p className="mb-0 ms-4 small text-muted">{change.reviewComment}</p>
          )}
        </div>
      )}

      {/* ── Changes table ── */}
      <div className="vds-tab-panel-content rounded-3 mb-3">
        {/* Section toolbar */}
        <div className="px-3 py-2 d-flex align-items-center justify-content-between flex-wrap gap-2 vds-section-toolbar">
          <div className="d-flex align-items-center gap-2">
            <i
              className="bi bi-list-check text-primary"
              style={{ fontSize: "0.9rem" }}
            />
            <span className="vds-section-toolbar__title fw-semibold">
              Changes
            </span>
            <span className="vds-count-badge">
              {filteredChanges.length}
              {query.trim() ? ` / ${change.changes?.length ?? 0}` : ""}
            </span>
          </div>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <button
              type="button"
              className="btn btn-sm vds-btn-flat d-flex align-items-center gap-1"
              onClick={() => void refetch()}
            >
              <i className="bi bi-arrow-clockwise" />
              <span className="vds-btn-flat__label">Refresh</span>
            </button>
            {canCancelChange && (
              <button
                type="button"
                className="btn btn-sm btn-outline-warning d-flex align-items-center gap-1"
                onClick={() => setShowCancelModal(true)}
              >
                <i className="bi bi-x-circle me-1" />
                Cancel Changes
              </button>
            )}
            <div
              className="input-group input-group-sm vds-search-group"
              style={{ width: 210 }}
            >
              <span className="input-group-text border-0 bg-transparent pe-1">
                <i className="bi bi-search text-muted" />
              </span>
              <input
                type="search"
                className="form-control border-0 ps-0 shadow-none bg-transparent"
                placeholder="Filter changes…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div
          className="vds-zones-table-wrap"
          style={{ borderRadius: 0, boxShadow: "none", border: "none" }}
        >
          <table className="vds-zones-table">
            <thead>
              <tr>
                <th>Change Type</th>
                <th>Input Name</th>
                <th>Recordset Name</th>
                <th>Zone Name</th>
                <th>Record Type</th>
                <th>Record Data</th>
                <th>TTL</th>
                <th>Status</th>
                <th>Additional Info</th>
              </tr>
            </thead>
            <tbody>
              {filteredChanges.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div
                      className="vds-empty-state"
                      style={{
                        border: "none",
                        background: "transparent",
                        padding: "1.5rem",
                      }}
                    >
                      <i
                        className="bi bi-inbox fs-3 mb-2"
                        style={{ opacity: 0.4 }}
                      />
                      <p className="mb-0 fw-semibold small">
                        {query
                          ? "No changes match your filter"
                          : "No changes found"}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredChanges.map((c) => (
                  <tr
                    key={c.id}
                    className={c.outstandingErrors ? "vds-row-error" : ""}
                  >
                    <td>
                      <ChangeTypeBadge changeType={c.changeType} />
                    </td>
                    <td
                      className="vds-table-primary font-monospace small vds-table-nowrap"
                      title={c.inputName}
                    >
                      {c.inputName}
                    </td>
                    <td
                      className="vds-table-secondary small vds-table-nowrap"
                      title={c.recordName ?? ""}
                    >
                      {c.recordName || "\u2014"}
                    </td>
                    <td
                      className="vds-table-secondary small vds-table-nowrap"
                      title={c.zoneName ?? ""}
                    >
                      {c.zoneName || "\u2014"}
                    </td>
                    <td>
                      <span className="vds-type-badge">{c.type}</span>
                    </td>
                    <td style={{ maxWidth: 180 }}>
                      <RecordDataCell change={c} />
                    </td>
                    <td className="vds-table-secondary small vds-table-nowrap">
                      {c.ttl != null ? `${c.ttl}s` : "\u2014"}
                    </td>
                    <td>
                      <div className="d-flex align-items-center gap-1">
                        <span
                          className={`vds-status-badge ${changeStatusClass(c.status)}`}
                        >
                          {changeStatusLabel(c.status)}
                        </span>
                        {c.outstandingErrors && (
                          <i
                            className="bi bi-exclamation-circle-fill text-danger"
                            style={{ fontSize: "0.78rem" }}
                          />
                        )}
                      </div>
                    </td>
                    <td style={{ maxWidth: 240 }}>
                      <AdditionalInfoCell
                        change={c}
                        batchApprovalStatus={approvalStatus}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Review panel (super/support only, when PendingReview) ── */}
      {canReview && approvalStatus === "PendingReview" && (
        <div className="vds-tab-panel-content rounded-3 mb-3">
          <div className="px-3 py-2 d-flex align-items-center gap-2 vds-section-toolbar">
            <i
              className="bi bi-clipboard2-check text-warning"
              style={{ fontSize: "0.9rem" }}
            />
            <span className="vds-section-toolbar__title fw-semibold">
              Review DNS Change
            </span>
          </div>
          <div className="p-3">
            <div className="mb-3">
              <label
                className="form-label fw-semibold small"
                htmlFor="review-comment"
              >
                Review Comment (optional):
              </label>
              <textarea
                id="review-comment"
                className="form-control"
                rows={3}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
              />
            </div>
            <div className="d-flex gap-2 justify-content-end flex-wrap align-items-center">
              {!reviewType ? (
                <>
                  <button
                    type="button"
                    className="btn btn-success d-flex align-items-center gap-1"
                    onClick={handleApprove}
                  >
                    <i className="bi bi-check-circle" />
                    Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger d-flex align-items-center gap-1"
                    onClick={handleReject}
                  >
                    <i className="bi bi-x-circle" />
                    Reject
                  </button>
                </>
              ) : (
                <>
                  <span className="me-auto small text-muted align-self-center">
                    {reviewConfirmationMsg}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary d-flex align-items-center gap-1"
                    onClick={handleCancelReview}
                  >
                    Cancel Review
                  </button>
                  {reviewType === "approve" && (
                    <button
                      type="button"
                      className="btn btn-success d-flex align-items-center gap-1"
                      onClick={handleApprove}
                    >
                      <i className="bi bi-check-circle" />
                      Confirm Approval
                    </button>
                  )}
                  {reviewType === "reject" && (
                    <button
                      type="button"
                      className="btn btn-danger d-flex align-items-center gap-1"
                      onClick={handleReject}
                    >
                      <i className="bi bi-x-circle" />
                      Confirm Rejection
                    </button>
                  )}
                </>
              )}
            </div>
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
            <div className="modal-content">
              <div className="modal-header">
                <h6 className="modal-title fw-bold">Cancel DNS Change</h6>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowCancelModal(false)}
                />
              </div>
              <div className="modal-body">
                <p className="mb-0">
                  Are you sure you want to cancel this DNS Change?
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-default"
                  onClick={() => setShowCancelModal(false)}
                >
                  Decline
                </button>
                <button
                  type="button"
                  className="btn btn-success"
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
