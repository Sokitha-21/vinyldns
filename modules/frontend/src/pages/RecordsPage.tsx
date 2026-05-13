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

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RecordsTable } from "../components/records/RecordsTable";
import { Pagination } from "../components/common/Pagination";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { useRecords } from "../hooks/useRecords";
import { recordsService } from "../services/recordsService";
import { TimeFilterDropdown } from "../components/common/TimeFilterDropdown";
import type { TimeRange } from "../components/common/TimeFilterDropdown";
import { RecordHistoryModal } from "../components/records/RecordHistoryModal";

const STATUS_LABELS: Record<string, string> = {
  Active: "Active",
  Inactive: "Inactive",
  Pending: "Pending",
  PendingDelete: "Pending Delete",
  PendingUpdate: "Pending Update",
};

export function RecordsPage() {
  const queryClient = useQueryClient();

  // ── API search params ──────────────────────────────────────────────────────
  const [nameInput, setNameInput] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [nameSort, setNameSort] = useState("ASC");
  const [ownerGroupFilter, setOwnerGroupFilter] = useState("");

  // ── Client-side filters (applied to loaded records) ───────────────────────
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [accessFilter, setAccessFilter] = useState<"shared" | "private" | null>(
    null,
  );
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showInstructions, setShowInstructions] = useState(false);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [accessDropdownOpen, setAccessDropdownOpen] = useState(false);
  const [zoneDropdownOpen, setZoneDropdownOpen] = useState(false);

  // ── Record history modal ─────────────────────────────────────────────────
  const [historyRecord, setHistoryRecord] = useState<any | null>(null);

  // ── Suggestions state ─────────────────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const accessDropdownRef = useRef<HTMLDivElement>(null);
  const zoneDropdownRef = useRef<HTMLDivElement>(null);
  const justSelectedRef = useRef(false);

  const {
    records,
    isLoading,
    search,
    nextPage,
    prevPage,
    nextPageEnabled,
    prevPageEnabled,
    getPanelTitle,
  } = useRecords();

  // ── Close all dropdowns on outside click ─────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (suggestionsRef.current && !suggestionsRef.current.contains(t))
        setShowSuggestions(false);
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(t))
        setTypeDropdownOpen(false);
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(t))
        setStatusDropdownOpen(false);
      if (accessDropdownRef.current && !accessDropdownRef.current.contains(t))
        setAccessDropdownOpen(false);
      if (zoneDropdownRef.current && !zoneDropdownRef.current.contains(t))
        setZoneDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Suggestions fetch (debounced) ─────────────────────────────────────────
  useEffect(() => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    const rawTerm = nameInput.split(" | ")[0].trim();
    if (rawTerm.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await recordsService.getRecordSuggestions(rawTerm);
        const items = (res.data.recordSets ?? []).map((rs) => ({
          value: `${rs.fqdn ?? rs.name} | ${rs.type}`,
          label: `name: ${rs.fqdn ?? rs.name} | type: ${rs.type}`,
        }));
        setSuggestions(items);
        setShowSuggestions(items.length > 0);
        setActiveSuggestion(-1);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [nameInput]);

  // ── Derived filter options from loaded records ────────────────────────────
  const availableTypes = useMemo(
    () =>
      Array.from(new Set(records.map((r: any) => r.type as string)))
        .filter(Boolean)
        .sort() as string[],
    [records],
  );
  const availableStatuses = useMemo(
    () =>
      Array.from(new Set(records.map((r: any) => r.status as string))).filter(
        Boolean,
      ) as string[],
    [records],
  );
  const availableZones = useMemo(
    () =>
      Array.from(new Set(records.map((r: any) => r.zoneName as string)))
        .filter(Boolean)
        .sort() as string[],
    [records],
  );
  const hasShared = records.some((r: any) => r.zoneShared === true);
  const hasPrivate = records.some((r: any) => r.zoneShared === false);

  // ── isWithinRange (same as ZonesPage) ────────────────────────────────────
  const isWithinRange = useCallback(
    (
      dateStr: string | undefined,
      range: TimeRange,
      from: string,
      to: string,
    ): boolean => {
      if (range === "all") return true;
      if (!dateStr) return true;
      const ts = new Date(dateStr).getTime();
      const now = Date.now();
      if (range === "1d") return ts >= now - 86400000;
      if (range === "7d") return ts >= now - 7 * 86400000;
      if (range === "30d") return ts >= now - 30 * 86400000;
      if (range === "90d") return ts >= now - 90 * 86400000;
      if (range === "custom") {
        if (from && ts < new Date(from).getTime()) return false;
        if (to && ts > new Date(to + "T23:59:59").getTime()) return false;
      }
      return true;
    },
    [],
  );

  // ── Client-side filtering ─────────────────────────────────────────────────
  const anyClientFilterActive = !!(
    statusFilter ||
    accessFilter ||
    zoneFilter ||
    timeRange !== "all"
  );
  const displayedRecords = anyClientFilterActive
    ? records.filter((r: any) => {
        const matchesStatus = !statusFilter || r.status === statusFilter;
        const matchesAccess =
          !accessFilter ||
          (accessFilter === "shared"
            ? r.zoneShared === true
            : r.zoneShared === false);
        const matchesZone = !zoneFilter || r.zoneName === zoneFilter;
        const matchesTime = isWithinRange(
          r.updated as string | undefined,
          timeRange,
          dateFrom,
          dateTo,
        );
        return matchesStatus && matchesAccess && matchesZone && matchesTime;
      })
    : records;

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleSearch = useCallback(() => {
    setShowSuggestions(false);
    let name = nameInput;
    let type = typeFilter;
    if (nameInput.includes(" | ")) {
      const parts = nameInput.split(" | ");
      name = parts[0].trim();
      type = parts[1]?.trim() || typeFilter;
      setTypeFilter(type);
    }
    search({ name, type, sort: nameSort, ownerGroup: ownerGroupFilter });
  }, [nameInput, typeFilter, nameSort, ownerGroupFilter, search]);

  const handleSuggestionClick = (value: string) => {
    justSelectedRef.current = true;
    setNameInput(value);
    setShowSuggestions(false);
    const parts = value.split(" | ");
    const name = parts[0].trim();
    const type = parts[1]?.trim() || typeFilter;
    if (type !== typeFilter) setTypeFilter(type);
    search({ name, type, sort: nameSort, ownerGroup: ownerGroupFilter });
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (showSuggestions && activeSuggestion >= 0)
        handleSuggestionClick(suggestions[activeSuggestion].value);
      else handleSearch();
      return;
    }
    if (!showSuggestions) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestion((p) => Math.min(p + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestion((p) => Math.max(p - 1, 0));
    } else if (e.key === "Escape") setShowSuggestions(false);
  };

  const handleToggleSort = () => {
    const next = nameSort === "ASC" ? "DESC" : "ASC";
    setNameSort(next);
    search({
      name: nameInput,
      type: typeFilter,
      sort: next,
      ownerGroup: ownerGroupFilter,
    });
  };

  const handleRefresh = () => {
    setNameInput("");
    setTypeFilter("");
    setNameSort("ASC");
    setOwnerGroupFilter("");
    setStatusFilter(null);
    setAccessFilter(null);
    setZoneFilter(null);
    setTimeRange("all");
    setDateFrom("");
    setDateTo("");
    search({ name: "", type: "", sort: "ASC", ownerGroup: "" });
    void queryClient.invalidateQueries({ queryKey: ["recordsets"] });
  };

  const highlightMatch = (text: string, term: string) => {
    if (!term) return <>{text}</>;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    return (
      <>
        {text
          .split(regex)
          .map((part, i) =>
            regex.test(part) ? <strong key={i}>{part}</strong> : part,
          )}
      </>
    );
  };

  // Active filter count for badge
  const activeFilterCount =
    [typeFilter, statusFilter, accessFilter, zoneFilter].filter(Boolean)
      .length + (timeRange !== "all" ? 1 : 0);

  return (
    <div>
      {/* ── Page header ── */}
      <div className="rounded-3 mb-4 d-flex justify-content-between align-items-center vds-page-header">
        <div className="d-flex align-items-center gap-3">
          <div className="rounded-3 d-flex align-items-center justify-content-center vds-page-header__icon">
            <i className="bi bi-search text-white fs-5" />
          </div>
          <div>
            <h4 className="mb-0 fw-bold vds-page-header__title">
              Global RecordSet Search
            </h4>
            <small className="text-muted">
              Read-only view of the current disposition of records in VinylDNS
            </small>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-sm d-flex align-items-center gap-2 vds-btn-flat"
          onClick={() => setShowInstructions((v) => !v)}
        >
          <i
            className={`bi ${showInstructions ? "bi-chevron-up" : "bi-info-circle"}`}
          />
          <span className="vds-btn-flat__label">How to Search</span>
        </button>
      </div>

      {showInstructions && (
        <div className="card mb-3 vds-instructions-card">
          <div className="card-body" style={{ fontSize: "0.875rem" }}>
            <p className="mb-2">
              The search is based on the fully qualified domain name (FQDN). A
              minimum of <strong>two alphanumeric characters</strong> is{" "}
              <em>required</em>. A search term cannot{" "}
              <strong>both start and end</strong> with a wildcard.
            </p>
            <div className="row g-3">
              <div className="col-md-6">
                <p className="fw-semibold mb-1 text-primary">Examples</p>
                <ul className="mb-0 ps-3 text-muted small">
                  <li>
                    <code>test.example.com.</code> → exact match
                  </li>
                  <li>
                    <code>test.*</code> → test.example.com., test.net.
                  </li>
                  <li>
                    <code>*example.com</code> → one.example.com.,
                    test.example.com.
                  </li>
                  <li>
                    <code>*example*</code> → <strong>INVALID</strong>
                  </li>
                </ul>
              </div>
              <div className="col-md-6">
                <p className="fw-semibold mb-1 text-primary">PTR Records</p>
                <ul className="mb-0 ps-3 text-muted small">
                  <li>Look up by IP address or FQDN</li>
                  <li>IPv6 compressed/expanded formats supported</li>
                  <li>Partial IP matching not supported</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="card mb-3 vds-toolbar-card">
        <div className="card-body py-2 px-3">
          <div className="d-flex gap-2 flex-wrap align-items-center">
            {/* Search input */}
            <div className="position-relative" ref={suggestionsRef}>
              <div
                className="input-group input-group-sm vds-search-group"
                style={{ width: 280, flexShrink: 1 }}
              >
                <span className="input-group-text border-0 bg-transparent pe-1">
                  <i className="bi bi-search text-muted" />
                </span>
                <input
                  type="text"
                  className="form-control border-0 ps-0 shadow-none bg-transparent"
                  placeholder="Search by FQDN"
                  value={nameInput}
                  autoComplete="off"
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                />
              </div>
              {showSuggestions && (
                <ul
                  className="list-group position-absolute shadow-lg vds-suggestions-list"
                  style={{ width: "100%", zIndex: 1050 }}
                >
                  {suggestions.map((item, i) => {
                    const [fqdnPart, typePart] = item.value.split(" | ");
                    const term = nameInput.split(" | ")[0];
                    return (
                      <li
                        key={item.value}
                        className={`list-group-item list-group-item-action vds-suggestion-item d-flex justify-content-between align-items-center${i === activeSuggestion ? " active" : ""}`}
                        onMouseDown={() => handleSuggestionClick(item.value)}
                      >
                        <span className="text-truncate me-2">
                          {highlightMatch(fqdnPart, term)}
                        </span>
                        <span className="vds-type-badge flex-shrink-0">
                          {typePart}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Type filter dropdown */}
            <div ref={typeDropdownRef} className="position-relative">
              <button
                className="btn btn-sm d-flex align-items-center gap-1 vds-btn-flat"
                onClick={() => setTypeDropdownOpen((o) => !o)}
              >
                <i className="bi bi-tag" />
                <span className="vds-btn-flat__label">Type</span>
                {typeFilter && (
                  <span className="vds-filter-chip--accent">{typeFilter}</span>
                )}
                <i
                  className={`bi bi-chevron-${typeDropdownOpen ? "up" : "down"} ms-1`}
                  style={{ fontSize: "0.65rem", color: "#506080" }}
                />
              </button>
              {typeDropdownOpen && (
                <ul
                  className="list-group position-absolute shadow vds-toolbar-filter-list"
                  style={{
                    zIndex: 1050,
                    top: "calc(100% + 4px)",
                    left: 0,
                    minWidth: "130px",
                    borderRadius: "0.55rem",
                    overflow: "hidden",
                    border: "1px solid #d4dbe8",
                  }}
                >
                  {(availableTypes.length > 0
                    ? availableTypes
                    : [
                        "A",
                        "AAAA",
                        "CNAME",
                        "MX",
                        "NS",
                        "PTR",
                        "SOA",
                        "SPF",
                        "SRV",
                        "TXT",
                        "NAPTR",
                        "DS",
                        "SSHFP",
                        "CAA",
                      ]
                  ).map((t) => (
                    <li
                      key={t}
                      className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${typeFilter === t ? " vds-role-item--selected" : ""}`}
                      style={{ cursor: "pointer", fontSize: "0.85rem" }}
                      onMouseDown={() => {
                        const next = typeFilter === t ? "" : t;
                        setTypeFilter(next);
                        setTypeDropdownOpen(false);
                        search({
                          name: nameInput,
                          type: next,
                          sort: nameSort,
                          ownerGroup: ownerGroupFilter,
                        });
                      }}
                    >
                      <span
                        className="vds-type-badge"
                        style={{ fontSize: "0.68rem", padding: "1px 6px" }}
                      >
                        {t}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Status filter dropdown */}
            <div ref={statusDropdownRef} className="position-relative">
              <button
                className="btn btn-sm d-flex align-items-center gap-1 vds-btn-flat"
                onClick={() => setStatusDropdownOpen((o) => !o)}
              >
                <i className="bi bi-activity" />
                <span className="vds-btn-flat__label">Status</span>
                {statusFilter && (
                  <span className="vds-filter-chip--accent">
                    {STATUS_LABELS[statusFilter] ?? statusFilter}
                  </span>
                )}
                <i
                  className={`bi bi-chevron-${statusDropdownOpen ? "up" : "down"} ms-1`}
                  style={{ fontSize: "0.65rem", color: "#506080" }}
                />
              </button>
              {statusDropdownOpen && availableStatuses.length > 0 && (
                <ul
                  className="list-group position-absolute shadow vds-toolbar-filter-list"
                  style={{
                    zIndex: 1050,
                    top: "calc(100% + 4px)",
                    left: 0,
                    minWidth: "155px",
                    borderRadius: "0.55rem",
                    overflow: "hidden",
                    border: "1px solid #d4dbe8",
                  }}
                >
                  {availableStatuses.map((s) => (
                    <li
                      key={s}
                      className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${statusFilter === s ? " vds-role-item--selected" : ""}`}
                      style={{ cursor: "pointer", fontSize: "0.85rem" }}
                      onMouseDown={() => {
                        setStatusFilter(statusFilter === s ? null : s);
                        setStatusDropdownOpen(false);
                      }}
                    >
                      <i
                        className={`bi ${s === "Active" ? "bi-check-circle-fill text-success" : s.startsWith("Pending") ? "bi-clock text-warning" : "bi-dash-circle text-secondary"}`}
                      />
                      {STATUS_LABELS[s] ?? s}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Zone Access filter dropdown */}
            <div ref={accessDropdownRef} className="position-relative">
              <button
                className="btn btn-sm d-flex align-items-center gap-1 vds-btn-flat"
                onClick={() => setAccessDropdownOpen((o) => !o)}
              >
                <i className="bi bi-shield-lock" />
                <span className="vds-btn-flat__label">Access</span>
                {accessFilter && (
                  <span className="vds-filter-chip--accent">
                    {accessFilter === "shared" ? "Shared" : "Private"}
                  </span>
                )}
                <i
                  className={`bi bi-chevron-${accessDropdownOpen ? "up" : "down"} ms-1`}
                  style={{ fontSize: "0.65rem", color: "#506080" }}
                />
              </button>
              {accessDropdownOpen && (hasShared || hasPrivate) && (
                <ul
                  className="list-group position-absolute shadow vds-toolbar-filter-list"
                  style={{
                    zIndex: 1050,
                    top: "calc(100% + 4px)",
                    left: 0,
                    minWidth: "135px",
                    borderRadius: "0.55rem",
                    overflow: "hidden",
                    border: "1px solid #d4dbe8",
                  }}
                >
                  {hasShared && (
                    <li
                      className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${accessFilter === "shared" ? " vds-role-item--selected" : ""}`}
                      style={{ cursor: "pointer", fontSize: "0.85rem" }}
                      onMouseDown={() => {
                        setAccessFilter(
                          accessFilter === "shared" ? null : "shared",
                        );
                        setAccessDropdownOpen(false);
                      }}
                    >
                      <i className="bi bi-share-fill" /> Shared
                    </li>
                  )}
                  {hasPrivate && (
                    <li
                      className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${accessFilter === "private" ? " vds-role-item--selected" : ""}`}
                      style={{ cursor: "pointer", fontSize: "0.85rem" }}
                      onMouseDown={() => {
                        setAccessFilter(
                          accessFilter === "private" ? null : "private",
                        );
                        setAccessDropdownOpen(false);
                      }}
                    >
                      <i className="bi bi-lock-fill text-secondary" /> Private
                    </li>
                  )}
                </ul>
              )}
            </div>

            {/* Zone filter dropdown */}
            {availableZones.length > 0 && (
              <div ref={zoneDropdownRef} className="position-relative">
                <button
                  className="btn btn-sm d-flex align-items-center gap-1 vds-btn-flat"
                  onClick={() => setZoneDropdownOpen((o) => !o)}
                >
                  <i className="bi bi-diagram-3" />
                  <span className="vds-btn-flat__label">Zone</span>
                  {zoneFilter && (
                    <span
                      className="vds-filter-chip--accent"
                      style={{
                        maxWidth: 90,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {zoneFilter}
                    </span>
                  )}
                  <i
                    className={`bi bi-chevron-${zoneDropdownOpen ? "up" : "down"} ms-1`}
                    style={{ fontSize: "0.65rem", color: "#506080" }}
                  />
                </button>
                {zoneDropdownOpen && (
                  <ul
                    className="list-group position-absolute shadow vds-toolbar-filter-list"
                    style={{
                      zIndex: 1050,
                      top: "calc(100% + 4px)",
                      left: 0,
                      minWidth: "180px",
                      maxHeight: "220px",
                      overflowY: "auto",
                      borderRadius: "0.55rem",
                      border: "1px solid #d4dbe8",
                    }}
                  >
                    {availableZones.map((z) => (
                      <li
                        key={z}
                        className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${zoneFilter === z ? " vds-role-item--selected" : ""}`}
                        style={{ cursor: "pointer", fontSize: "0.85rem" }}
                        onMouseDown={() => {
                          setZoneFilter(zoneFilter === z ? null : z);
                          setZoneDropdownOpen(false);
                        }}
                      >
                        <i
                          className="bi bi-diagram-3 text-muted"
                          style={{ fontSize: "0.75rem" }}
                        />
                        {z}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Last Updated time filter */}
            <TimeFilterDropdown
              value={timeRange}
              dateFrom={dateFrom}
              dateTo={dateTo}
              onChange={setTimeRange}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
            />

            {/* Refresh */}
            <button
              type="button"
              className="btn btn-sm d-flex align-items-center gap-1 vds-btn-flat"
              onClick={handleRefresh}
            >
              <i className="bi bi-arrow-clockwise" />
              <span className="vds-btn-flat__label">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Active filter chips ── */}
      {activeFilterCount > 0 && (
        <div className="d-flex justify-content-end gap-2 mb-2 flex-wrap align-items-center px-1">
          {typeFilter && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className="bi bi-tag" /> Type: {typeFilter}
              <button
                type="button"
                className="btn-close ms-1"
                style={{
                  fontSize: "0.5rem",
                  filter:
                    "invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)",
                }}
                onClick={() => {
                  setTypeFilter("");
                  search({
                    name: nameInput,
                    type: "",
                    sort: nameSort,
                    ownerGroup: ownerGroupFilter,
                  });
                }}
              />
            </span>
          )}
          {statusFilter && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className="bi bi-activity" /> Status:{" "}
              {STATUS_LABELS[statusFilter] ?? statusFilter}
              <button
                type="button"
                className="btn-close ms-1"
                style={{
                  fontSize: "0.5rem",
                  filter:
                    "invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)",
                }}
                onClick={() => setStatusFilter(null)}
              />
            </span>
          )}
          {accessFilter && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i
                className={`bi ${accessFilter === "shared" ? "bi-share-fill" : "bi-lock-fill"}`}
              />
              Access: {accessFilter === "shared" ? "Shared" : "Private"}
              <button
                type="button"
                className="btn-close ms-1"
                style={{
                  fontSize: "0.5rem",
                  filter:
                    "invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)",
                }}
                onClick={() => setAccessFilter(null)}
              />
            </span>
          )}
          {zoneFilter && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className="bi bi-diagram-3" /> Zone: {zoneFilter}
              <button
                type="button"
                className="btn-close ms-1"
                style={{
                  fontSize: "0.5rem",
                  filter:
                    "invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)",
                }}
                onClick={() => setZoneFilter(null)}
              />
            </span>
          )}
          {timeRange !== "all" && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className="bi bi-clock" />
              Last Updated:{" "}
              {timeRange === "1d"
                ? "Today"
                : timeRange === "7d"
                  ? "Last 7 days"
                  : timeRange === "30d"
                    ? "Last 30 days"
                    : timeRange === "90d"
                      ? "Last 90 days"
                      : `${dateFrom || "…"} – ${dateTo || "…"}`}
              <button
                type="button"
                className="btn-close ms-1"
                style={{
                  fontSize: "0.5rem",
                  filter:
                    "invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)",
                }}
                onClick={() => {
                  setTimeRange("all");
                  setDateFrom("");
                  setDateTo("");
                }}
              />
            </span>
          )}
        </div>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          <RecordsTable
            records={displayedRecords}
            showZone
            nameSort={nameSort}
            onToggleSort={handleToggleSort}
            onViewHistory={(rec) => setHistoryRecord(rec)}
          />
          {(nextPageEnabled || prevPageEnabled) && (
            <Pagination
              onPrev={prevPage}
              onNext={nextPage}
              prevEnabled={prevPageEnabled}
              nextEnabled={nextPageEnabled}
              panelTitle={getPanelTitle()}
            />
          )}
        </>
      )}

      {/* ── Record History Modal ── */}
      {historyRecord && (
        <RecordHistoryModal
          record={historyRecord}
          onClose={() => setHistoryRecord(null)}
        />
      )}
    </div>
  );
}
