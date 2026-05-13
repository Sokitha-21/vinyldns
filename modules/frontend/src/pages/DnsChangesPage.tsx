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
import { Link } from "react-router-dom";
import { DnsChangesTable } from "../components/dnsChanges/DnsChangesTable";
import { Pagination } from "../components/common/Pagination";
import { useDnsChanges } from "../hooks/useDnsChanges";
import { useProfile } from "../contexts/ProfileContext";

export function DnsChangesPage() {
  const { profile } = useProfile();
  const canReview = Boolean(profile?.isSuper || profile?.isSupport);

  // Tab state: "my" | "all"
  const [activeTab, setActiveTab] = useState<"my" | "all">("my");
  const ignoreAccess = activeTab === "all";

  // Filters (only relevant when ignoreAccess = true)
  const [submitterName, setSubmitterName] = useState("");
  const [approvalStatus, setApprovalStatus] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  const {
    dnsChanges,
    isLoading,
    nextPage,
    prevPage,
    nextPageEnabled,
    prevPageEnabled,
    getPanelTitle,
    cancelBatchChange,
  } = useDnsChanges(
    ignoreAccess,
    ignoreAccess ? submitterName || undefined : undefined,
    approvalStatus || undefined,
    dateStart || undefined,
    dateEnd || undefined,
  );

  const handleCancel = (change: { id: string }) => {
    if (window.confirm("Cancel this batch change?")) {
      cancelBatchChange(change.id);
    }
  };

  const currentUserName = profile?.userName ?? "";

  return (
    <div>
      {/* ── Page header ── */}
      <div className="rounded-3 mb-4 d-flex justify-content-between align-items-center vds-page-header">
        <div className="d-flex align-items-center gap-3">
          <div className="rounded-3 d-flex align-items-center justify-content-center vds-page-header__icon">
            <i className="bi bi-list-ol text-white fs-5" />
          </div>
          <div>
            <h4 className="mb-0 fw-bold vds-page-header__title">DNS Changes</h4>
            <small className="text-muted">
              View and manage batch DNS change requests
            </small>
          </div>
        </div>
        <Link
          to="/dnschanges/new"
          className="btn btn-primary d-flex align-items-center gap-2 vds-btn-primary-shadow vds-btn-nav"
        >
          <i className="bi bi-plus-circle-fill" />
          New DNS Change
        </Link>
      </div>

      {/* ── Toolbar card ── */}
      <div className="card mb-3 vds-toolbar-card">
        <div className="card-body py-2 px-3">
          <div className="d-flex gap-3 flex-wrap align-items-center">
            {/* Tab toggle (super/support only) */}
            {canReview && (
              <div className="vds-pill-toggle">
                <button
                  type="button"
                  className={`vds-pill-toggle__btn${activeTab === "my" ? " vds-pill-toggle__btn--active" : ""}`}
                  onClick={() => setActiveTab("my")}
                >
                  <i className="bi bi-person-fill" />
                  My Requests
                </button>
                <button
                  type="button"
                  className={`vds-pill-toggle__btn${activeTab === "all" ? " vds-pill-toggle__btn--active" : ""}`}
                  onClick={() => setActiveTab("all")}
                >
                  <i className="bi bi-people-fill" />
                  All Requests
                </button>
              </div>
            )}

            {/* "Open Requests Only" toggle */}
            <label
              className="d-flex align-items-center gap-2 mb-0 vds-toggle-label"
              htmlFor="pendingReviewSwitch"
              style={{ cursor: "pointer", userSelect: "none" }}
            >
              <input
                type="checkbox"
                id="pendingReviewSwitch"
                className="form-check-input"
                checked={approvalStatus === "PendingReview"}
                onChange={(e) =>
                  setApprovalStatus(e.target.checked ? "PendingReview" : "")
                }
                style={{
                  width: 36,
                  height: 20,
                  cursor: "pointer",
                  accentColor: "#1e5fa8",
                }}
              />
              <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                Open Requests Only
              </span>
              {approvalStatus === "PendingReview" && (
                <span
                  className="badge d-inline-flex align-items-center gap-1"
                  style={{
                    background: "linear-gradient(90deg, #b7770d, #9a6109)",
                    color: "#fff",
                    fontSize: "0.7rem",
                    borderRadius: 20,
                    padding: "0.25em 0.7em",
                    fontWeight: 700,
                  }}
                >
                  <i
                    className="bi bi-hourglass-split"
                    style={{ fontSize: "0.62rem" }}
                  />
                  Pending Review
                </span>
              )}
            </label>

            <span
              className="ms-auto d-flex align-items-center gap-1 text-muted"
              style={{ fontSize: "0.78rem" }}
            >
              {/* <i className="bi bi-bar-chart-line" /> */}
              {getPanelTitle()}
            </span>
          </div>

          {/* Filters row (only for All Requests) */}
          {ignoreAccess && (
            <div className="mt-2 pt-2 border-top">
              <div className="row g-2 align-items-end">
                {/* Submitter search */}
                <div className="col-12 col-md-4">
                  <label
                    className="form-label mb-1 small fw-semibold text-muted text-uppercase"
                    style={{ letterSpacing: "0.06em", fontSize: "0.7rem" }}
                  >
                    <i className="bi bi-person-search me-1" />
                    Submitter
                  </label>
                  <div className="input-group input-group-sm vds-search-group">
                    <span className="input-group-text border-0 bg-transparent pe-1">
                      <i className="bi bi-person text-muted" />
                    </span>
                    <input
                      type="text"
                      className="form-control border-0 ps-0 shadow-none bg-transparent"
                      placeholder="Search by username"
                      value={submitterName}
                      onChange={(e) => setSubmitterName(e.target.value)}
                    />
                  </div>
                </div>

                {/* From date */}
                <div className="col-12 col-md-3">
                  <label
                    className="form-label mb-1 small fw-semibold text-muted text-uppercase"
                    style={{ letterSpacing: "0.06em", fontSize: "0.7rem" }}
                  >
                    <i className="bi bi-calendar-event me-1" />
                    From Date
                  </label>
                  <input
                    type="datetime-local"
                    className="form-control form-control-sm"
                    value={dateStart}
                    onChange={(e) => setDateStart(e.target.value)}
                  />
                </div>

                {/* To date */}
                <div className="col-12 col-md-3">
                  <label
                    className="form-label mb-1 small fw-semibold text-muted text-uppercase"
                    style={{ letterSpacing: "0.06em", fontSize: "0.7rem" }}
                  >
                    <i className="bi bi-calendar-check me-1" />
                    To Date
                  </label>
                  <input
                    type="datetime-local"
                    className="form-control form-control-sm"
                    value={dateEnd}
                    onChange={(e) => setDateEnd(e.target.value)}
                  />
                </div>

                {/* Reset */}
                <div className="col-12 col-md-2">
                  <button
                    type="button"
                    className="btn btn-sm w-100 d-flex align-items-center justify-content-center gap-1 vds-btn-flat"
                    onClick={() => {
                      setSubmitterName("");
                      setDateStart("");
                      setDateEnd("");
                    }}
                  >
                    <i className="bi bi-arrow-counterclockwise" />
                    <span className="vds-btn-flat__label">Reset</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Table + Pagination ── */}
      {isLoading ? (
        <div
          className="card vds-toolbar-card d-flex flex-column align-items-center justify-content-center py-5 gap-3"
          style={{ minHeight: 220 }}
        >
          <div
            className="spinner-border text-primary"
            role="status"
            style={{ width: 40, height: 40 }}
          >
            <span className="visually-hidden">Loading…</span>
          </div>
          <span className="text-muted small fw-semibold">Loading changes…</span>
        </div>
      ) : (
        <div className="card vds-toolbar-card overflow-hidden">
          <DnsChangesTable
            changes={dnsChanges}
            onCancel={handleCancel}
            ignoreAccess={ignoreAccess}
            currentUserName={currentUserName}
          />
          <div className="card-footer d-flex align-items-center justify-content-between py-2 px-3">
            <span className="text-muted small">
              {/* <i className="bi bi-bar-chart-line me-1" /> */}
              {getPanelTitle()}
            </span>
            <Pagination
              onPrev={prevPage}
              onNext={nextPage}
              prevEnabled={prevPageEnabled}
              nextEnabled={nextPageEnabled}
              panelTitle={getPanelTitle()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
