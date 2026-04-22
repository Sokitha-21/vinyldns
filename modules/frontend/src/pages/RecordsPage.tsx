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

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RecordsTable } from '../components/records/RecordsTable';
import { RecordHistoryModal } from '../components/records/RecordHistoryModal';
import { FilterChip } from '../components/common/FilterChip';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useRecords } from '../hooks/useRecords';
import { recordsService } from '../services/recordsService';

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'PTR', 'SOA', 'SPF', 'SRV', 'TXT', 'NAPTR', 'DS', 'CAA'];

// Debounce utility
function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export function RecordsPage() {
  const [nameInput, setNameInput] = useState('');
  const debouncedTerm = useDebounce(nameInput, 300);
  const [typeFilters, setTypeFilters] = useState<Set<string>>(new Set());
  const [zoneFilters, setZoneFilters] = useState<Set<string>>(new Set());
  const [zoneAccessFilter, setZoneAccessFilter] = useState<'all' | 'shared' | 'private'>('all');
  const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());
  const [ownerGroupFilter, setOwnerGroupFilter] = useState('');
  const [recordDataFilter, setRecordDataFilter] = useState('');
  const [nameSort, setNameSort] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [historyRecord, setHistoryRecord] = useState<any>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const { records, isLoading, search } = useRecords();

  // Autocomplete suggestions query
  const { data: suggestions = [] } = useQuery({
    queryKey: ['recordSuggestions', debouncedTerm],
    queryFn: () => {
      if (debouncedTerm.length < 2) return [];
      return recordsService.getRecordSuggestions(debouncedTerm);
    },
    enabled: debouncedTerm.length >= 2,
    staleTime: 15000,
  });

  const uniqueZones = useMemo(
    () => [...new Set(records.map((r: any) => r.zone || '').filter(Boolean))],
    [records]
  );

  const uniqueStatuses = useMemo(
    () => [...new Set(records.map((r: any) => r.status || '').filter(Boolean))],
    [records]
  );

  const hasSharedZones = useMemo(
    () => records.some((r: any) => r.zoneShared === true),
    [records]
  );

  const hasPrivateZones = useMemo(
    () => records.some((r: any) => r.zoneShared === false),
    [records]
  );

  const filteredRecords = useMemo(() => {
    return records.filter((r: any) => {
      if (typeFilters.size > 0 && !typeFilters.has(r.type)) return false;
      if (zoneFilters.size > 0 && !zoneFilters.has(r.zone)) return false;
      if (zoneAccessFilter === 'shared' && r.zoneShared !== true) return false;
      if (zoneAccessFilter === 'private' && r.zoneShared !== false) return false;
      if (statusFilters.size > 0 && !statusFilters.has(r.status)) return false;
      if (ownerGroupFilter && r.ownerGroupName !== ownerGroupFilter) return false;
      if (recordDataFilter && !r.data?.toLowerCase().includes(recordDataFilter.toLowerCase())) return false;
      return true;
    });
  }, [records, typeFilters, zoneFilters, zoneAccessFilter, statusFilters, ownerGroupFilter, recordDataFilter]);

  const handleSearch = useCallback(() => {
    const [name, type] = nameInput.includes('|')
      ? nameInput.split('|').map((s: string) => s.trim())
      : [nameInput, ''];
    search({ name, type: type || undefined, sort: nameSort });
  }, [nameInput, nameSort, search]);

  const handleSelectSuggestion = useCallback((suggestion: any) => {
    setNameInput(suggestion.name);
    setShowSuggestions(false);
    setActiveIdx(-1);
    setTimeout(() => handleSearch(), 0);
  }, [handleSearch]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        setActiveIdx((idx) => (idx < suggestions.length - 1 ? idx + 1 : idx));
      } else if (e.key === 'ArrowUp') {
        setActiveIdx((idx) => (idx > 0 ? idx - 1 : -1));
      } else if (e.key === 'Enter') {
        if (activeIdx >= 0 && suggestions[activeIdx]) {
          handleSelectSuggestion(suggestions[activeIdx]);
        } else {
          handleSearch();
        }
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
        setActiveIdx(-1);
      }
    },
    [activeIdx, suggestions, handleSelectSuggestion, handleSearch]
  );

  const handleTypeSelect = useCallback((type: string) => {
    setTypeFilters((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }, []);

  const handleZoneSelect = useCallback((zone: string) => {
    setZoneFilters((prev) => {
      const next = new Set(prev);
      next.has(zone) ? next.delete(zone) : next.add(zone);
      return next;
    });
  }, []);

  const handleStatusSelect = useCallback((status: string) => {
    setStatusFilters((prev) => {
      const next = new Set(prev);
      next.has(status) ? next.delete(status) : next.add(status);
      return next;
    });
  }, []);

  const handleClearAllFilters = useCallback(() => {
    setTypeFilters(new Set());
    setZoneFilters(new Set());
    setZoneAccessFilter('all');
    setStatusFilters(new Set());
    setOwnerGroupFilter('');
    setRecordDataFilter('');
  }, []);

  return (
    <div style={{ backgroundColor: '#f9fafb' }} className="min-vh-100 p-4">
      {historyRecord && (
        <RecordHistoryModal
          record={historyRecord}
          onClose={() => setHistoryRecord(null)}
        />
      )}

      <div className="container-fluid">
        <div className="mb-4">
          <h1 className="h3 fw-bold mb-3">Global RecordSet Search</h1>
          <button
            className="btn btn-outline-secondary btn-sm me-2"
            onClick={() => setShowInstructions(!showInstructions)}
          >
            ℹ️ Instructions
          </button>
          <button
            className="btn btn-outline-primary btn-sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            🔽 {showFilters ? 'Hide' : 'Show'} Filters
          </button>
        </div>

        {showInstructions && (
          <div className="alert alert-info alert-dismissible fade show" role="alert">
            <strong>Search Tips:</strong> Enter FQDN and optionally add <code>| Type</code> (e.g., <code>example.com | A</code>) to filter by record type.
            <button type="button" className="btn-close" onClick={() => setShowInstructions(false)} />
          </div>
        )}

        {/* Search Bar */}
        <div style={{ backgroundColor: '#f4f8fd', border: '1px solid #dce8f5' }} className="card mb-4">
          <div className="card-body">
            <div className="position-relative">
              <input
                type="text"
                className="form-control form-control-lg"
                placeholder="Search FQDN (e.g., example.com or example.com | A)"
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  setShowSuggestions(e.target.value.length >= 2);
                  setActiveIdx(-1);
                }}
                onKeyDown={handleNameKeyDown}
                onFocus={() => nameInput.length >= 2 && setShowSuggestions(true)}
                style={{ backgroundColor: '#f4f8fd' }}
              />
              {showSuggestions && suggestions.length > 0 && (
                <div
                  ref={suggestionsRef}
                  className="position-absolute top-100 start-0 w-100 bg-white border border-secondary rounded mt-1 shadow"
                  style={{ maxHeight: '200px', overflowY: 'auto', zIndex: 1000 }}
                >
                  {suggestions.map((s: any, idx: number) => (
                    <div
                      key={idx}
                      onClick={() => handleSelectSuggestion(s)}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: idx === activeIdx ? '#e7f1ff' : 'white',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={() => setActiveIdx(idx)}
                    >
                      {s.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="row g-4">
          {/* Filter Panel */}
          {showFilters && (
            <div className="col-lg-5">
              <div style={{ backgroundColor: '#f8fbff', border: '1px solid #dce8f5' }} className="card">
                <div className="card-header" style={{ backgroundColor: '#cfe0f5', borderBottom: '2px solid #9ec5e0' }}>
                  <h5 className="mb-0" style={{ color: '#2c4a6e' }}>RECORD TYPE</h5>
                </div>
                <div className="card-body" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                  {RECORD_TYPES.map((type) => (
                    <div key={type} className="form-check mb-2">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        id={`type-${type}`}
                        checked={typeFilters.has(type)}
                        onChange={() => handleTypeSelect(type)}
                      />
                      <label className="form-check-label" htmlFor={`type-${type}`}>
                        {type}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {showFilters && (
            <div className="col-lg-4">
              <div style={{ backgroundColor: '#f8fbff', border: '1px solid #dce8f5' }} className="card mb-3">
                <div className="card-header" style={{ backgroundColor: '#cfe0f5', borderBottom: '2px solid #9ec5e0' }}>
                  <h5 className="mb-0" style={{ color: '#2c4a6e' }}>ZONE</h5>
                </div>
                <div className="card-body" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {uniqueZones.map((zone) => (
                    <div key={zone} className="form-check mb-2">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        id={`zone-${zone}`}
                        checked={zoneFilters.has(zone)}
                        onChange={() => handleZoneSelect(zone)}
                      />
                      <label className="form-check-label" htmlFor={`zone-${zone}`}>
                        {zone}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ backgroundColor: '#f8fbff', border: '1px solid #dce8f5' }} className="card mb-3">
                <div className="card-header" style={{ backgroundColor: '#cfe0f5', borderBottom: '2px solid #9ec5e0' }}>
                  <h5 className="mb-0" style={{ color: '#2c4a6e' }}>RECORD DATA</h5>
                </div>
                <div className="card-body">
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Search record data…"
                    value={recordDataFilter}
                    onChange={(e) => setRecordDataFilter(e.target.value)}
                    style={{ backgroundColor: '#f4f8fd' }}
                  />
                </div>
              </div>

              <div style={{ backgroundColor: '#f8fbff', border: '1px solid #dce8f5' }} className="card">
                <div className="card-header" style={{ backgroundColor: '#cfe0f5', borderBottom: '2px solid #9ec5e0' }}>
                  <h5 className="mb-0" style={{ color: '#2c4a6e' }}>OWNER GROUP</h5>
                </div>
                <div className="card-body">
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Owner group name…"
                    value={ownerGroupFilter}
                    onChange={(e) => setOwnerGroupFilter(e.target.value)}
                    style={{ backgroundColor: '#f4f8fd' }}
                  />
                </div>
              </div>
            </div>
          )}

          {showFilters && (
            <div className="col-lg-3">
              <div style={{ backgroundColor: '#f8fbff', border: '1px solid #dce8f5' }} className="card mb-3">
                <div className="card-header" style={{ backgroundColor: '#cfe0f5', borderBottom: '2px solid #9ec5e0' }}>
                  <h5 className="mb-0" style={{ color: '#2c4a6e' }}>ZONE ACCESS TYPE</h5>
                </div>
                <div className="card-body">
                  <div className="form-check mb-2">
                    <input
                      type="radio"
                      className="form-check-input"
                      id="access-all"
                      name="zoneAccess"
                      checked={zoneAccessFilter === 'all'}
                      onChange={() => setZoneAccessFilter('all')}
                    />
                    <label className="form-check-label" htmlFor="access-all">All</label>
                  </div>
                  {hasSharedZones && (
                    <div className="form-check mb-2">
                      <input
                        type="radio"
                        className="form-check-input"
                        id="access-shared"
                        name="zoneAccess"
                        checked={zoneAccessFilter === 'shared'}
                        onChange={() => setZoneAccessFilter('shared')}
                      />
                      <label className="form-check-label" htmlFor="access-shared">Shared</label>
                    </div>
                  )}
                  {hasPrivateZones && (
                    <div className="form-check mb-2">
                      <input
                        type="radio"
                        className="form-check-input"
                        id="access-private"
                        name="zoneAccess"
                        checked={zoneAccessFilter === 'private'}
                        onChange={() => setZoneAccessFilter('private')}
                      />
                      <label className="form-check-label" htmlFor="access-private">Private</label>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ backgroundColor: '#f8fbff', border: '1px solid #dce8f5' }} className="card">
                <div className="card-header" style={{ backgroundColor: '#cfe0f5', borderBottom: '2px solid #9ec5e0' }}>
                  <h5 className="mb-0" style={{ color: '#2c4a6e' }}>STATUS</h5>
                </div>
                <div className="card-body" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {uniqueStatuses.map((status) => (
                    <div key={status} className="form-check mb-2">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        id={`status-${status}`}
                        checked={statusFilters.has(status)}
                        onChange={() => handleStatusSelect(status)}
                      />
                      <label className="form-check-label" htmlFor={`status-${status}`}>
                        {status}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <button
                className="btn btn-outline-danger btn-sm w-100 mt-3"
                onClick={handleClearAllFilters}
              >
                Clear All Filters
              </button>
            </div>
          )}

          {/* Results */}
          <div className={showFilters ? 'col-lg-12' : 'col-12'}>
            {isLoading ? (
              <LoadingSpinner />
            ) : (
              <RecordsTable
                records={filteredRecords}
                onViewHistory={(record: any) => setHistoryRecord(record)}
                showZone={true}
                showOwnerGroup={true}
                nameSort={nameSort}
                onToggleSort={(sort: string) => setNameSort(sort)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
