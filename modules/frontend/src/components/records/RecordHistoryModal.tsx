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
import { useQuery } from '@tanstack/react-query';
import { recordsService } from '../../services/recordsService';

interface RecordHistoryModalProps {
  record: any;
  onClose: () => void;
}

export function RecordHistoryModal({ record, onClose }: RecordHistoryModalProps) {
  const [page, setPage] = useState(1);
  const [expandedIdx, setExpandedIdx] = useState(-1);

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['recordHistory', record.id, record.zoneId, page],
    queryFn: () =>
      recordsService.listRecordSetChangeHistory(record.zoneId, 10, undefined, record.fqdn, record.type),
  });

  const changes = historyData?.changes || [];
  const hasMore = historyData?.hasMore || false;

  return (
    <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-lg">
        <div className="modal-content">
          <div className="modal-header" style={{ backgroundColor: '#cfe0f5', borderBottom: '2px solid #9ec5e0' }}>
            <div>
              <h5 className="modal-title mb-0" style={{ color: '#2c4a6e' }}>Record History</h5>
              <small className="text-muted">{record.fqdn} ({record.type})</small>
            </div>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div className="modal-body">
            {isLoading ? (
              <div className="text-center p-4">
                <div className="spinner-border" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            ) : (
              <>
                <table className="table table-sm table-hover">
                  <thead style={{ backgroundColor: '#cfe0f5', borderBottom: '2px solid #9ec5e0' }}>
                    <tr>
                      <th style={{ color: '#2c4a6e' }}>Date</th>
                      <th style={{ color: '#2c4a6e' }}>User</th>
                      <th style={{ color: '#2c4a6e' }}>Type</th>
                      <th style={{ color: '#2c4a6e' }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((change: any, idx: number) => (
                      <React.Fragment key={idx}>
                        <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedIdx(expandedIdx === idx ? -1 : idx)}>
                          <td>{new Date(change.created).toLocaleString()}</td>
                          <td>{change.userName || 'System'}</td>
                          <td>{change.changeType}</td>
                          <td>
                            <button className="btn btn-link btn-sm p-0">
                              {expandedIdx === idx ? '▼' : '▶'} View
                            </button>
                          </td>
                        </tr>
                        {expandedIdx === idx && (
                          <tr>
                            <td colSpan={4}>
                              <pre style={{ backgroundColor: '#f4f8fd', padding: '10px', borderRadius: '4px', fontSize: '0.85rem' }}>
                                {JSON.stringify(change.updates, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
                {(page > 1 || hasMore) && (
                  <div className="d-flex justify-content-between mt-3">
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </button>
                    <span style={{ color: '#7a98b5' }}>Page {page}</span>
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      disabled={!hasMore}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
