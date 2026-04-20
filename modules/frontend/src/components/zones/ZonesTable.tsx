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

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Zone } from '../../types/zone';
import { formatDateTime } from '../../utils/dateUtils';

type SortDir = 'asc' | 'desc' | null;
function SortArrow({ dir }: { dir: SortDir }) {
  if (dir === 'asc')  return <i className="bi bi-arrow-up"      style={{ fontSize: '0.7rem', color: '#2e5090', marginLeft: 3 }} />;
  if (dir === 'desc') return <i className="bi bi-arrow-down"    style={{ fontSize: '0.7rem', color: '#2e5090', marginLeft: 3 }} />;
  return                     <i className="bi bi-arrow-down-up" style={{ fontSize: '0.65rem', color: '#898a8b', marginLeft: 3, opacity: 0.7 }} />;
}

interface ZonesTableProps {
  zones: Zone[];
  showAllZones?: boolean;
}

export function ZonesTable({ zones, showAllZones }: ZonesTableProps) {
  const [lastSyncSort, setLastSyncSort] = useState<SortDir>(null);

  if (zones.length === 0) {
    return (
      <div className="vds-empty-state">
        <i className="bi bi-diagram-3 fs-1 mb-2" style={{ opacity: 0.4 }} />
        <p className="mb-0 fw-semibold">No zones found</p>
        <small className="text-muted">
          {showAllZones
            ? 'No zones match the search criteria.'
            : 'You do not own any zones. You can manage records in shared zones through DNS Changes.'}
        </small>
      </div>
    );
  }

  const initials = (name: string) =>
    name.split(/[-_.]+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

  const statusClass = (status: string) => {
    if (status === 'Active') return 'vds-zone-status-badge--active';
    if (status === 'Deleted') return 'vds-zone-status-badge--deleted';
    if (status === 'Syncing') return 'vds-zone-status-badge--syncing';
    return 'vds-zone-status-badge--pending';
  };

  const sortedZones = lastSyncSort
    ? [...zones].sort((a, b) =>
        (lastSyncSort === 'asc' ? 1 : -1) *
        (new Date(a.latestSync ?? '').getTime() - new Date(b.latestSync ?? '').getTime()))
    : zones;

  return (
    <div className="vds-zones-table-wrap">
      <table className="vds-zones-table">
        <thead>
          <tr>
            <th>Zone Name</th>
            <th>Email</th>
            <th>Admin Group</th>
            <th>Status</th>
            <th
              onClick={() => setLastSyncSort((d) => d === 'asc' ? 'desc' : 'asc')}
              style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
            >Last Sync <SortArrow dir={lastSyncSort} /></th>
            <th>Access</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedZones.map((zone) => (
            <tr key={zone.id}>
              <td>
                <div className="d-flex align-items-center gap-2">
                  <span className="vds-zone-avatar">{initials(zone.name)}</span>
                  <Link
                    to={`/zones/${zone.id}`}
                    className="fw-semibold text-decoration-none vds-table-primary"
                  >
                    {zone.name}
                  </Link>
                </div>
              </td>
              <td className="vds-table-secondary">{zone.email}</td>
              <td>
                {zone.adminGroupId ? (
                  <Link
                    to={`/groups/${zone.adminGroupId}`}
                    className="vds-table-primary text-decoration-none"
                  >
                    {zone.adminGroupName ?? zone.adminGroupId}
                  </Link>
                ) : (
                  <span className={zone.adminGroupName ? 'vds-table-secondary' : 'vds-table-placeholder'}>
                    {zone.adminGroupName ?? '—'}
                  </span>
                )}
              </td>
              <td>
                <span className={`vds-zone-status-badge ${statusClass(zone.status)}`}>
                  {zone.status}
                </span>
              </td>
              <td className="vds-table-secondary vds-table-nowrap">
                {zone.latestSync ? formatDateTime(zone.latestSync) : '—'}
              </td>
              <td>
                <span className={`vds-access-badge ${zone.shared ? 'vds-access-badge--shared' : 'vds-access-badge--private'}`}>
                  <i className={`bi ${zone.shared ? 'bi-share-fill' : 'bi-lock-fill'} me-1`} style={{ fontSize: '0.65rem' }} />
                  {zone.shared ? 'Shared' : 'Private'}
                </span>
              </td>
              <td>
                <Link
                  to={`/zones/${zone.id}`}
                  className="vds-action-btn vds-action-btn--view"
                  title="View zone"
                >
                  <i className="bi bi-eye-fill" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
