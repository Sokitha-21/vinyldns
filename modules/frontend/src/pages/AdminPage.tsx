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

import React, { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { useProfile } from '../contexts/ProfileContext';
import { useAlerts } from '../contexts/AlertContext';
import '../styles/admin.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type ConfigTab = 'backend' | 'nameservers' | 'highvalue' | 'manualreview';

type Role = 'super' | 'support' | 'normal';

type BackendConn = { name: string; keyName: string; key: string; primaryServer: string; };
interface Backend {
  id: string;
  zoneConnection: BackendConn;
  transferConnection: BackendConn;
  tsigUsage: string;
}

interface AppConfig {
  className: string;
  legacy: boolean;
  defaultBackendId: string;
  backends: Backend[];
  approvedNameServers: string[];
  highValueDomains: { regexList: string[]; ipList: string[] };
  manualReviewDomains: { domainList: string[]; ipList: string[]; zoneNameList: string[] };
}

type HighValueConfig = AppConfig['highValueDomains'];
type ManualReviewConfig = AppConfig['manualReviewDomains'];

interface ManagedUser {
  id: string;
  userName: string;
  firstName: string;
  lastName: string;
  email: string;
  isSuper: boolean;
  isSupport: boolean;
  lockStatus: 'Unlocked' | 'Locked';
  created: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRoleFromUser(u: ManagedUser): Role {
  if (u.isSuper) return 'super';
  if (u.isSupport) return 'support';
  return 'normal';
}

function roleMeta(role: Role) {
  switch (role) {
    case 'super':   return { label: 'Super User',   cls: 'adm-badge adm-badge--super',   icon: 'bi-shield-fill-check' };
    case 'support': return { label: 'Support',       cls: 'adm-badge adm-badge--support', icon: 'bi-headset' };
    default:        return { label: 'Normal User',   cls: 'adm-badge adm-badge--normal',  icon: 'bi-person-fill' };
  }
}

function initials(u: ManagedUser) {
  return `${u.firstName[0] ?? ''}${u.lastName[0] ?? ''}`.toUpperCase();
}

// ─── TagInput ─────────────────────────────────────────────────────────────────

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

function TagInput({ tags, onChange, placeholder = 'Type and press Enter…' }: TagInputProps) {
  const [inputVal, setInputVal] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = () => {
    const trimmed = inputVal.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputVal('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && inputVal === '' && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className="adm-tag-input" onClick={() => inputRef.current?.focus()}>
      {tags.map((t) => (
        <span key={t} className="adm-tag">
          {t}
          <button
            type="button"
            className="adm-tag__remove"
            onClick={(e) => { e.stopPropagation(); onChange(tags.filter((x) => x !== t)); }}
            aria-label={`Remove ${t}`}
          >
            <i className="bi bi-x" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        className="adm-tag-input__field"
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={addTag}
        placeholder={tags.length === 0 ? placeholder : ''}
      />
    </div>
  );
}

// ─── BackendCard ──────────────────────────────────────────────────────────────

interface BackendCardProps {
  backend: Backend;
  isDefault: boolean;
  onChange: (b: Backend) => void;
}

function BackendCard({ backend, isDefault, onChange }: BackendCardProps) {
  const [open, setOpen] = useState(false);

  const update = (patch: Partial<Backend>) => onChange({ ...backend, ...patch });
  const updateZone = (patch: Partial<BackendConn>) =>
    update({ zoneConnection: { ...backend.zoneConnection, ...patch } });
  const updateTransfer = (patch: Partial<BackendConn>) =>
    update({ transferConnection: { ...backend.transferConnection, ...patch } });

  return (
    <div className={`adm-backend-card${isDefault ? ' adm-backend-card--default' : ''}`}>
      <div className="adm-backend-card__header" onClick={() => setOpen(!open)}>
        <div className="adm-backend-card__title">
          <i className="bi bi-hdd-network-fill adm-backend-card__icon" />
          <span className="adm-backend-card__id">{backend.id}</span>
          {isDefault && <span className="adm-badge adm-badge--primary ms-2">Default</span>}
        </div>
        <div className="adm-backend-card__meta">
          <i className={`bi bi-chevron-${open ? 'up' : 'down'} adm-backend-card__chevron`} />
        </div>
      </div>

      {open && (
        <div className="adm-backend-card__body">
          <div className="row g-3">
            <div className="col-md-6">
              <div className="adm-conn-block">
                <div className="adm-conn-block__label">
                  <i className="bi bi-arrow-left-right" /> Zone Connection
                </div>
                <div className="adm-form-group">
                  <label className="adm-label">Name</label>
                  <input className="adm-input" value={backend.zoneConnection.name}
                    onChange={e => updateZone({ name: e.target.value })} />
                </div>
                <div className="adm-form-group">
                  <label className="adm-label">Key Name</label>
                  <input className="adm-input" value={backend.zoneConnection.keyName}
                    onChange={e => updateZone({ keyName: e.target.value })} />
                </div>
                <div className="adm-form-group">
                  <label className="adm-label">Key</label>
                  <input className="adm-input adm-input--mono" type="password" value={backend.zoneConnection.key}
                    onChange={e => updateZone({ key: e.target.value })} />
                </div>
                <div className="adm-form-group">
                  <label className="adm-label">Primary Server</label>
                  <input className="adm-input" value={backend.zoneConnection.primaryServer}
                    onChange={e => updateZone({ primaryServer: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="adm-conn-block">
                <div className="adm-conn-block__label">
                  <i className="bi bi-arrow-repeat" /> Transfer Connection
                </div>
                <div className="adm-form-group">
                  <label className="adm-label">Name</label>
                  <input className="adm-input" value={backend.transferConnection.name}
                    onChange={e => updateTransfer({ name: e.target.value })} />
                </div>
                <div className="adm-form-group">
                  <label className="adm-label">Key Name</label>
                  <input className="adm-input" value={backend.transferConnection.keyName}
                    onChange={e => updateTransfer({ keyName: e.target.value })} />
                </div>
                <div className="adm-form-group">
                  <label className="adm-label">Key</label>
                  <input className="adm-input adm-input--mono" type="password" value={backend.transferConnection.key}
                    onChange={e => updateTransfer({ key: e.target.value })} />
                </div>
                <div className="adm-form-group">
                  <label className="adm-label">Primary Server</label>
                  <input className="adm-input" value={backend.transferConnection.primaryServer}
                    onChange={e => updateTransfer({ primaryServer: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="col-12">
              <div className="adm-form-group">
                <label className="adm-label">TSIG Usage</label>
                <select className="adm-input adm-select" value={backend.tsigUsage}
                  onChange={e => update({ tsigUsage: e.target.value })}>
                  <option value="always">always</option>
                  <option value="never">never</option>
                  <option value="auto">auto</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AdminPage() {
  const { profile } = useProfile();
  const { addAlert } = useAlerts();
  const isSuper = profile?.isSuper ?? false;

  // Config state
  const [config, setConfig] = useState<AppConfig>({
    className: 'vinyldns.api.backend.dns.DnsBackendProviderLoader',
    legacy: false,
    defaultBackendId: 'default',
    backends: [
      {
        id: 'default',
        zoneConnection: {
          name: 'vinyldns.',
          keyName: 'vinyldns.',
          key: 'nzisn+4G2ldMn0q1CV3vsg==',
          primaryServer: '127.0.0.1:19001',
        },
        transferConnection: {
          name: 'vinyldns.',
          keyName: 'vinyldns.',
          key: 'nzisn+4G2ldMn0q1CV3vsg==',
          primaryServer: '127.0.0.1:19001',
        },
        tsigUsage: 'always',
      },
      {
        id: 'func-test-backend',
        zoneConnection: {
          name: 'vinyldns.',
          keyName: 'vinyldns.',
          key: 'nzisn+4G2ldMn0q1CV3vsg==',
          primaryServer: '127.0.0.1:19001',
        },
        transferConnection: {
          name: 'vinyldns.',
          keyName: 'vinyldns.',
          key: 'nzisn+4G2ldMn0q1CV3vsg==',
          primaryServer: '127.0.0.1:19001',
        },
        tsigUsage: 'always',
      },
    ],
    approvedNameServers: [
      '172.17.42.1.',
      'ns1.parent.com.',
      'ns1.parent.com1.',
      'ns1.parent.com2.',
      'ns1.parent.com3.',
      'ns1.parent.com4.',
    ],
    highValueDomains: {
      regexList: ['high-value-domain.*'],
      ipList: [
        '192.0.1.252',
        '192.0.1.253',
        '192.0.2.252',
        '192.0.2.253',
        '192.0.3.252',
        '192.0.3.253',
        '192.0.4.252',
        '192.0.4.253',
        'fd69:27cc:fe91:0:0:0:0:ffff',
        'fd69:27cc:fe91:0:0:0:ffff:0',
        'fd69:27cc:fe92:0:0:0:0:ffff',
        'fd69:27cc:fe92:0:0:0:ffff:0',
        'fd69:27cc:fe93:0:0:0:0:ffff',
        'fd69:27cc:fe93:0:0:0:ffff:0',
        'fd69:27cc:fe94:0:0:0:0:ffff',
        'fd69:27cc:fe94:0:0:0:ffff:0',
      ],
    },
    manualReviewDomains: {
      domainList: ['needs-review.*'],
      ipList: [
        '192.0.1.254',
        '192.0.1.255',
        '192.0.2.254',
        '192.0.2.255',
        '192.0.3.254',
        '192.0.3.255',
        '192.0.4.254',
        '192.0.4.255',
        'fd69:27cc:fe91:0:0:0:ffff:1',
        'fd69:27cc:fe91:0:0:0:ffff:2',
        'fd69:27cc:fe92:0:0:0:ffff:1',
        'fd69:27cc:fe92:0:0:0:ffff:2',
        'fd69:27cc:fe93:0:0:0:ffff:1',
        'fd69:27cc:fe93:0:0:0:ffff:2',
        'fd69:27cc:fe94:0:0:0:ffff:1',
        'fd69:27cc:fe94:0:0:0:ffff:2',
      ],
      zoneNameList: [
        'zone.requires.review.',
        'zone.requires.review1.',
        'zone.requires.review2.',
        'zone.requires.review3.',
        'zone.requires.review4.',
      ],
    },
  });
  const [configLoading] = useState(false);
  const [configError] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [activeTab, setActiveTab] = useState<ConfigTab>('backend');
  const [reloadStatus, setReloadStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [reloadMsg, setReloadMsg] = useState('');
  const [lastReloadTime, setLastReloadTime] = useState<string | null>(null);

  // User mgmt state
  const [users, setUsers] = useState<ManagedUser[]>([]);

  // Panel A – Lock / Unlock
  const [lockUsername, setLockUsername] = useState('');
  const [lockAction, setLockAction] = useState<'lock' | 'unlock'>('lock');
  const [lockResult, setLockResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Panel B – Check Status
  const [statusUsername, setStatusUsername] = useState('');
  const [statusResult, setStatusResult] = useState<ManagedUser | 'notfound' | null>(null);

  // Panel C – Update Permission
  const [permUsername, setPermUsername] = useState('');
  const [permRole, setPermRole] = useState<Role>('normal');
  const [permResult, setPermResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    type: 'lock' | 'unlock' | 'role';
    userId: string;
    newRole?: Role;
  } | null>(null);

  // ── Config helpers ────────────────────────────────────────────────────────

  const fetchConfig = () => { /* will be wired to GET /appconfig later */ };

  useEffect(() => { fetchConfig(); }, []);

  const handleConfigUpdate = () => {
    setUpdateStatus('success');
    addAlert('success', 'Configuration saved successfully.');
    setTimeout(() => setUpdateStatus('idle'), 3000);
  };

  const patchHVD = (patch: Partial<HighValueConfig>) =>
    setConfig(c => ({ ...c, highValueDomains: { ...c.highValueDomains, ...patch } }));

  const patchMRD = (patch: Partial<ManualReviewConfig>) =>
    setConfig(c => ({ ...c, manualReviewDomains: { ...c.manualReviewDomains, ...patch } }));

  const updateBackend = (updated: Backend) =>
    setConfig(c => ({
      ...c,
      backends: c.backends.map(b => b.id === updated.id ? updated : b),
    }));

  const handleReload = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    const dateStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    setLastReloadTime(`${dateStr} at ${timeStr}`);
    setReloadStatus('success');
    setReloadMsg('Configuration reloaded successfully at ' + timeStr);
    fetchConfig();
    setTimeout(() => setReloadStatus('idle'), 4000);
    // POST /appconfig/refresh will be wired here later
  };

  // ── User helpers ──────────────────────────────────────────────────────────

  const applyRole = (userId: string, role: Role) => {
    setUsers(us => us.map(u => u.id !== userId ? u : {
      ...u,
      isSuper: role === 'super',
      isSupport: role === 'support',
    }));
  };

  const applyLock = (userId: string, lock: boolean) => {
    setUsers(us => us.map(u => u.id !== userId ? u : {
      ...u,
      lockStatus: lock ? 'Locked' : 'Unlocked',
    }));
  };

  const handleLockSubmit = () => {
    const q = lockUsername.trim().toLowerCase();
    if (!q) return;
    const found = users.find(u => u.userName.toLowerCase() === q);
    if (!found) { setLockResult({ ok: false, msg: `User "${lockUsername}" not found.` }); return; }
    const alreadyInState = found.lockStatus === (lockAction === 'lock' ? 'Locked' : 'Unlocked');
    if (alreadyInState) {
      setLockResult({ ok: false, msg: `User "${found.userName}" is already ${found.lockStatus.toLowerCase()}.` });
      return;
    }
    setConfirmModal({ type: lockAction, userId: found.id });
  };

  const handleStatusCheck = () => {
    const q = statusUsername.trim().toLowerCase();
    if (!q) return;
    const found = users.find(u => u.userName.toLowerCase() === q);
    setStatusResult(found ?? 'notfound');
  };

  const handlePermSubmit = () => {
    const q = permUsername.trim().toLowerCase();
    if (!q) return;
    const found = users.find(u => u.userName.toLowerCase() === q);
    if (!found) { setPermResult({ ok: false, msg: `User "${permUsername}" not found.` }); return; }
    const current = getRoleFromUser(found);
    if (current === permRole) {
      setPermResult({ ok: false, msg: `"${found.userName}" already has the ${roleMeta(permRole).label} role.` });
      return;
    }
    setConfirmModal({ type: 'role', userId: found.id, newRole: permRole });
  };

  // ── Tab meta ──────────────────────────────────────────────────────────────

  const tabs: { id: ConfigTab; label: string; icon: string }[] = [
    { id: 'backend',      label: 'DNS Backends',      icon: 'bi-hdd-network-fill' },
    { id: 'nameservers',  label: 'Name Servers',       icon: 'bi-signpost-split-fill' },
    { id: 'highvalue',    label: 'High-Value Domains', icon: 'bi-shield-lock-fill' },
    { id: 'manualreview', label: 'Manual Review',      icon: 'bi-clipboard2-check-fill' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="adm-page">
        {/* ═══ HERO HEADER ═══════════════════════════════════════════════════════ */}
      <div className="adm-hero">
        <div className="adm-hero__text">
          <div className="adm-hero__eyebrow">
            <i className="bi bi-shield-shaded" /> System Administration
          </div>
          <h1 className="adm-hero__title">Admin Control Panel</h1>
        </div>
        <div className="adm-hero__actions">
          <div className="adm-last-reload">
            <i className="bi bi-clock-history" />
            <span>
              Last reloaded:{' '}
              <strong>{lastReloadTime ?? '—'}</strong>
            </span>
          </div>
          <button
            className={`adm-reload-btn${reloadStatus === 'loading' ? ' adm-reload-btn--loading' : ''}${reloadStatus === 'success' ? ' adm-reload-btn--success' : ''}${reloadStatus === 'error' ? ' adm-reload-btn--error' : ''}`}
            onClick={handleReload}
            disabled={reloadStatus === 'loading'}
          >
            <i className={`bi ${reloadStatus === 'success' ? 'bi-check2-circle' : reloadStatus === 'error' ? 'bi-exclamation-circle' : 'bi-arrow-clockwise'} adm-reload-btn__icon`} />
            <span>
              {reloadStatus === 'loading' ? 'Reloading…'
                : reloadStatus === 'success' ? 'Reloaded!'
                : reloadStatus === 'error' ? 'Failed'
                : 'Reload Config'}
            </span>
          </button>
        </div>
      </div>

      {reloadStatus === 'success' && (
        <div className="adm-toast adm-toast--success">
          <i className="bi bi-check-circle-fill" /> {reloadMsg}
        </div>
      )}

      {/* ═══ SECTION 1 – CONFIG ════════════════════════════════════════════════ */}
      <section className="adm-section">
        <div className="adm-section__header">
          <div className="adm-section__title">
            <div className="adm-section__title-left">
              <span className="adm-section__icon adm-section__icon--blue">
                <i className="bi bi-sliders2" />
              </span>
              Configuration Profile
            </div>
            <button
              className={`adm-update-btn${updateStatus === 'loading' ? ' adm-update-btn--loading' : ''}${updateStatus === 'success' ? ' adm-update-btn--success' : ''}`}
              onClick={handleConfigUpdate}
              disabled={updateStatus === 'loading' || configLoading}
            >
              <i className={`bi ${updateStatus === 'success' ? 'bi-check2-circle' : updateStatus === 'error' ? 'bi-exclamation-circle' : 'bi-floppy-fill'}`} />
              {' '}{updateStatus === 'loading' ? 'Saving…' : updateStatus === 'success' ? 'Saved!' : updateStatus === 'error' ? 'Failed' : 'Update'}
            </button>
          </div>
          <div className="adm-section__desc">
            Edit backend, name server, and domain policy settings. Click <strong>Reload Config</strong> to apply.
          </div>
        </div>

        {/* Tabs */}
        <div className={`adm-tabs${configLoading ? ' d-none' : ''}`}>
          {tabs.map(t => (
            <button
              key={t.id}
              className={`adm-tab${activeTab === t.id ? ' adm-tab--active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              <i className={`bi ${t.icon}`} />
              <span className="adm-tab__label">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="adm-tab-panel">

          {configLoading && (
            <div className="adm-config-loading">
              <div className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
              Loading configuration…
            </div>
          )}
          {configError && (
            <div className="adm-inline-msg adm-inline-msg--err">
              <i className="bi bi-exclamation-circle-fill" /> {configError}
              <button className="btn btn-sm ms-3" onClick={() => void fetchConfig()}>Retry</button>
            </div>
          )}

          {/* ── BACKEND ─────────────────────────────────────────────────────── */}
          {!configLoading && activeTab === 'backend' && (
            <div>
              <div className="adm-provider-block">
                <div className="adm-sub-label mb-2">
                  <i className="bi bi-cpu-fill" /> Provider Settings
                </div>
                <div className="row g-3 mb-1">
                  <div className="col-md-8">
                    <div className="adm-form-group">
                      <label className="adm-label">Class Name</label>
                      <input
                        className="adm-input"
                        value={config.className}
                        onChange={e => setConfig(c => ({ ...c, className: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="adm-form-group">
                      <label className="adm-label">Legacy Mode</label>
                      <div className="adm-toggle-row">
                        <button
                          type="button"
                          className={`adm-toggle-btn${config.legacy ? ' adm-toggle-btn--on' : ' adm-toggle-btn--off'}`}
                          onClick={() => setConfig(c => ({ ...c, legacy: !c.legacy }))}
                          aria-pressed={config.legacy}
                        >
                          <span className="adm-toggle-btn__knob" />
                        </button>
                        <span className={`adm-toggle-label${config.legacy ? ' adm-toggle-label--on' : ''}`}>
                          {config.legacy ? 'true' : 'false'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="adm-field-row mb-3">
                <label className="adm-label">Default Backend ID</label>
                <input
                  className="adm-input adm-input--sm"
                  value={config.defaultBackendId}
                  onChange={e => setConfig(c => ({ ...c, defaultBackendId: e.target.value }))}
                />
              </div>
              <div className="adm-sub-label mb-2">
                <i className="bi bi-diagram-3-fill" /> Configured Backends
              </div>
              <div className="adm-backend-list">
                {config.backends.map(b => (
                  <BackendCard
                    key={b.id}
                    backend={b}
                    isDefault={b.id === config.defaultBackendId}
                    onChange={updateBackend}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── NAME SERVERS ─────────────────────────────────────────────────── */}
          {!configLoading && activeTab === 'nameservers' && (
            <div>
              <div className="adm-field-desc">
                <i className="bi bi-info-circle" /> Fully-qualified name-servers that VinylDNS will treat as approved. Type a value and press <kbd>Enter</kbd> to add.
              </div>
              <TagInput
                tags={config.approvedNameServers}
                onChange={v => setConfig(c => ({ ...c, approvedNameServers: v }))}
                placeholder="e.g. ns1.example.com."
              />
              <div className="adm-count-badge mt-2">
                <i className="bi bi-tag-fill" /> {config.approvedNameServers.length} server{config.approvedNameServers.length !== 1 ? 's' : ''}
              </div>
            </div>
          )}

          {/* ── HIGH-VALUE DOMAINS ───────────────────────────────────────────── */}
          {!configLoading && activeTab === 'highvalue' && (
            <div className="row g-4">
              <div className="col-md-6">
                <div className="adm-list-card adm-list-card--red">
                  <div className="adm-list-card__header">
                    <i className="bi bi-regex" />
                    <span>Regex List</span>
                    <span className="adm-list-card__count">{config.highValueDomains.regexList.length}</span>
                  </div>
                  <p className="adm-list-card__desc">Applied to all record types except PTR.</p>
                  <TagInput
                    tags={config.highValueDomains.regexList}
                    onChange={v => patchHVD({ regexList: v })}
                    placeholder="e.g. high-value-domain.*"
                  />
                </div>
              </div>
              <div className="col-md-6">
                <div className="adm-list-card adm-list-card--orange">
                  <div className="adm-list-card__header">
                    <i className="bi bi-diagram-2-fill" />
                    <span>IP List</span>
                    <span className="adm-list-card__count">{config.highValueDomains.ipList.length}</span>
                  </div>
                  <p className="adm-list-card__desc">Used exclusively for PTR records. Supports IPv4 and IPv6.</p>
                  <TagInput
                    tags={config.highValueDomains.ipList}
                    onChange={v => patchHVD({ ipList: v })}
                    placeholder="e.g. 192.0.2.252"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── MANUAL REVIEW ────────────────────────────────────────────────── */}
          {!configLoading && activeTab === 'manualreview' && (
            <div className="row g-4">
              <div className="col-md-4">
                <div className="adm-list-card adm-list-card--purple">
                  <div className="adm-list-card__header">
                    <i className="bi bi-fonts" />
                    <span>Domain List</span>
                    <span className="adm-list-card__count">{config.manualReviewDomains.domainList.length}</span>
                  </div>
                  <p className="adm-list-card__desc">FQDNs / regex for all record types except PTR.</p>
                  <TagInput
                    tags={config.manualReviewDomains.domainList}
                    onChange={v => patchMRD({ domainList: v })}
                    placeholder="e.g. needs-review.*"
                  />
                </div>
              </div>
              <div className="col-md-4">
                <div className="adm-list-card adm-list-card--teal">
                  <div className="adm-list-card__header">
                    <i className="bi bi-diagram-2-fill" />
                    <span>IP List</span>
                    <span className="adm-list-card__count">{config.manualReviewDomains.ipList.length}</span>
                  </div>
                  <p className="adm-list-card__desc">Used exclusively for PTR records.</p>
                  <TagInput
                    tags={config.manualReviewDomains.ipList}
                    onChange={v => patchMRD({ ipList: v })}
                    placeholder="e.g. 192.0.1.254"
                  />
                </div>
              </div>
              <div className="col-md-4">
                <div className="adm-list-card adm-list-card--cyan">
                  <div className="adm-list-card__header">
                    <i className="bi bi-globe2" />
                    <span>Zone Name List</span>
                    <span className="adm-list-card__count">{config.manualReviewDomains.zoneNameList.length}</span>
                  </div>
                  <p className="adm-list-card__desc">Zone names that always require review.</p>
                  <TagInput
                    tags={config.manualReviewDomains.zoneNameList}
                    onChange={v => patchMRD({ zoneNameList: v })}
                    placeholder="e.g. zone.requires.review."
                  />
                </div>
              </div>
            </div>
          )}

        </div>
      </section>

      {/* ═══ SECTION 2 – USER MANAGEMENT (super only) ═════════════════════════ */}
      {isSuper ? (
        <section className="adm-section">
          <div className="adm-section__header">
            <div className="adm-section__title">
              <div className="adm-section__title-left">
                <span className="adm-section__icon adm-section__icon--violet">
                  <i className="bi bi-people-fill" />
                </span>
                User Access Management
              </div>
            </div>
            <div className="adm-section__desc">
              Manage user lock status and permissions by username.
            </div>
          </div>

          <div className="adm-action-grid">

            {/* ── Panel A: Lock / Unlock ─────────────────────────────────── */}
            <div className="adm-action-panel adm-action-panel--lock">
              <div className="adm-action-panel__header">
                <div className="adm-action-panel__icon-wrap">
                  <i className="bi bi-lock-fill" />
                </div>
                <div>
                  <div className="adm-action-panel__title">Lock / Unlock User</div>
                  <div className="adm-action-panel__sub">Enable or disable a user's access</div>
                </div>
              </div>

              <div className="adm-action-panel__body">
                <label className="adm-label">Username</label>
                <div className="adm-input-wrap">
                  <i className="bi bi-person-fill adm-input-wrap__icon" />
                  <input
                    className="adm-input adm-input--icon"
                    placeholder="Enter the username"
                    value={lockUsername}
                    onChange={e => { setLockUsername(e.target.value); setLockResult(null); }}
                    onKeyDown={e => e.key === 'Enter' && handleLockSubmit()}
                  />
                </div>

                <label className="adm-label mt-3">Select Action</label>
                <div className="adm-radio-group">
                  <label className={`adm-radio${lockAction === 'lock' ? ' adm-radio--active adm-radio--red' : ''}`}>
                    <input type="radio" name="lockAction" value="lock" checked={lockAction === 'lock'}
                      onChange={() => setLockAction('lock')} />
                    <span className="adm-radio__dot" />
                    <i className="bi bi-lock-fill" />
                    Lock
                  </label>
                  <label className={`adm-radio${lockAction === 'unlock' ? ' adm-radio--active adm-radio--green' : ''}`}>
                    <input type="radio" name="lockAction" value="unlock" checked={lockAction === 'unlock'}
                      onChange={() => setLockAction('unlock')} />
                    <span className="adm-radio__dot" />
                    <i className="bi bi-unlock-fill" />
                    Unlock
                  </label>
                </div>

                {lockResult && (
                  <div className={`adm-inline-msg ${lockResult.ok ? 'adm-inline-msg--ok' : 'adm-inline-msg--err'}`}>
                    <i className={`bi ${lockResult.ok ? 'bi-check-circle-fill' : 'bi-exclamation-circle-fill'}`} />
                    {lockResult.msg}
                  </div>
                )}
              </div>

              <div className="adm-action-panel__footer">
                <button className="adm-panel-btn adm-panel-btn--primary" onClick={handleLockSubmit}>
                  <i className="bi bi-send-fill" /> Submit
                </button>
                <button className="adm-panel-btn adm-panel-btn--ghost" onClick={() => { setLockUsername(''); setLockAction('lock'); setLockResult(null); }}>
                  <i className="bi bi-x-lg" /> Clear
                </button>
              </div>
            </div>

            {/* ── Panel B: Check Status ──────────────────────────────────── */}
            <div className="adm-action-panel adm-action-panel--status">
              <div className="adm-action-panel__header">
                <div className="adm-action-panel__icon-wrap adm-action-panel__icon-wrap--blue">
                  <i className="bi bi-person-lines-fill" />
                </div>
                <div>
                  <div className="adm-action-panel__title">Check User Status</div>
                  <div className="adm-action-panel__sub">View role, lock state &amp; permissions</div>
                </div>
              </div>

              <div className="adm-action-panel__body">
                <label className="adm-label">Username</label>
                <div className="adm-input-wrap">
                  <i className="bi bi-search adm-input-wrap__icon" />
                  <input
                    className="adm-input adm-input--icon"
                    placeholder="Enter the username"
                    value={statusUsername}
                    onChange={e => { setStatusUsername(e.target.value); setStatusResult(null); }}
                    onKeyDown={e => e.key === 'Enter' && handleStatusCheck()}
                  />
                </div>

                {/* Result */}
                {statusResult === 'notfound' && (
                  <div className="adm-inline-msg adm-inline-msg--err mt-3">
                    <i className="bi bi-person-x-fill" /> User <strong>{statusUsername}</strong> not found.
                  </div>
                )}

                {statusResult && statusResult !== 'notfound' && (() => {
                  const u = statusResult;
                  const role = getRoleFromUser(u);
                  const rm = roleMeta(role);
                  const isLocked = u.lockStatus === 'Locked';
                  return (
                    <div className="adm-status-card">
                      <div className="adm-status-card__row">
                        <div className={`adm-avatar adm-avatar--${role} adm-avatar--lg`}>{initials(u)}</div>
                        <div>
                          <div className="adm-status-card__name">{u.userName}</div>
                          <div className="adm-status-card__full">{u.firstName} {u.lastName}</div>
                          <div className="adm-status-card__email">{u.email}</div>
                        </div>
                      </div>
                      <div className="adm-status-card__pills">
                        <span className={`adm-status ${isLocked ? 'adm-status--locked' : 'adm-status--active'}`}>
                          <i className={`bi ${isLocked ? 'bi-lock-fill' : 'bi-unlock-fill'}`} />
                          {u.lockStatus}
                        </span>
                        <span className={rm.cls}>
                          <i className={`bi ${rm.icon}`} /> {rm.label}
                        </span>
                        <span className="adm-status-card__since">
                          <i className="bi bi-calendar3" /> Since {u.created}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="adm-action-panel__footer">
                <button className="adm-panel-btn adm-panel-btn--blue" onClick={handleStatusCheck}>
                  <i className="bi bi-binoculars-fill" /> Check Status
                </button>
                <button className="adm-panel-btn adm-panel-btn--ghost" onClick={() => { setStatusUsername(''); setStatusResult(null); }}>
                  <i className="bi bi-x-lg" /> Clear
                </button>
              </div>
            </div>

            {/* ── Panel C: Update Permission ─────────────────────────────────────── */}
            <div className="adm-action-panel adm-action-panel--perm">
              <div className="adm-action-panel__header">
                <div className="adm-action-panel__icon-wrap adm-action-panel__icon-wrap--violet">
                  <i className="bi bi-shield-lock-fill" />
                </div>
                <div>
                  <div className="adm-action-panel__title">Update Permission</div>
                  <div className="adm-action-panel__sub">Assign a role to any user</div>
                </div>
              </div>

              <div className="adm-action-panel__body">
                <label className="adm-label">Username</label>
                <div className="adm-input-wrap">
                  <i className="bi bi-person-fill adm-input-wrap__icon" />
                  <input
                    className="adm-input adm-input--icon"
                    placeholder="Enter the username"
                    value={permUsername}
                    onChange={e => { setPermUsername(e.target.value); setPermResult(null); }}
                    onKeyDown={e => e.key === 'Enter' && handlePermSubmit()}
                  />
                </div>

                <label className="adm-label mt-3">Select Permission</label>
                <div className="adm-perm-radio-group">
                  {([
                    { value: 'super'   as Role, label: 'Super User',   icon: 'bi-shield-fill-check', mod: 'super'   },
                    { value: 'support' as Role, label: 'Support User',  icon: 'bi-headset',            mod: 'support' },
                    { value: 'normal'  as Role, label: 'Normal User',   icon: 'bi-person-fill',        mod: 'normal'  },
                  ]).map(opt => (
                    <label
                      key={opt.value}
                      className={`adm-perm-radio adm-perm-radio--${opt.mod}${permRole === opt.value ? ' adm-perm-radio--active' : ''}`}
                    >
                      <input type="radio" name="permRole" value={opt.value} checked={permRole === opt.value}
                        onChange={() => setPermRole(opt.value)} />
                      <span className="adm-perm-radio__dot" />
                      <i className={`bi ${opt.icon} adm-perm-radio__ico`} />
                      {opt.label}
                    </label>
                  ))}
                </div>

                {permResult && (
                  <div className={`adm-inline-msg ${permResult.ok ? 'adm-inline-msg--ok' : 'adm-inline-msg--err'}`}>
                    <i className={`bi ${permResult.ok ? 'bi-check-circle-fill' : 'bi-exclamation-circle-fill'}`} />
                    {permResult.msg}
                  </div>
                )}
              </div>

              <div className="adm-action-panel__footer">
                <button className="adm-panel-btn adm-panel-btn--violet" onClick={handlePermSubmit}>
                  <i className="bi bi-send-fill" /> Submit
                </button>
                <button className="adm-panel-btn adm-panel-btn--ghost" onClick={() => { setPermUsername(''); setPermRole('normal'); setPermResult(null); }}>
                  <i className="bi bi-x-lg" /> Clear
                </button>
              </div>
            </div>

          </div>
        </section>
      ) : (
        <section className="adm-section adm-section--locked">
          <div className="adm-locked-notice">
            <i className="bi bi-shield-lock-fill adm-locked-notice__icon" />
            <div>
              <div className="adm-locked-notice__title">Super User Access Required</div>
              <div className="adm-locked-notice__sub">
                User Access Management is only available to super users. Contact an administrator to request elevated permissions.
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═══ CONFIRM MODAL ════════════════════════════════════════════════════ */}
      {confirmModal && (() => {
        const user = users.find(u => u.id === confirmModal.userId);
        if (!user) return null;
        const isLockAction = confirmModal.type === 'lock' || confirmModal.type === 'unlock';
        const isLock = confirmModal.type === 'lock';

        return (
          <div className="adm-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setConfirmModal(null); }}>
            <div className="adm-modal">
              <div className="adm-modal__header">
                <div className={`adm-modal__icon adm-modal__icon--${isLockAction ? (isLock ? 'red' : 'green') : 'blue'}`}>
                  <i className={`bi ${isLockAction ? (isLock ? 'bi-lock-fill' : 'bi-unlock-fill') : 'bi-shield-fill-check'}`} />
                </div>
                <span className="adm-modal__title">
                  {isLockAction
                    ? `${isLock ? 'Lock' : 'Unlock'} user "${user.userName}"?`
                    : `Change role for "${user.userName}"?`}
                </span>
                <button className="adm-modal__close" onClick={() => setConfirmModal(null)} aria-label="Close">
                  <i className="bi bi-x-lg" />
                </button>
              </div>
              <div className="adm-modal__body">
                {isLockAction ? (
                  <p>
                    {isLock
                      ? 'Locking this user will prevent them from logging in and using the API. They can be unlocked at any time.'
                      : 'Unlocking will restore full access for this user immediately.'}
                  </p>
                ) : (
                  <p>
                    You are changing <strong>{user.userName}</strong>'s role to{' '}
                    <strong>{roleMeta(confirmModal.newRole!).label}</strong>.
                    This affects their permissions across the entire system.
                  </p>
                )}
              </div>
              <div className="adm-modal__footer">
                <button className="adm-btn adm-btn--ghost" onClick={() => setConfirmModal(null)}>
                  Cancel
                </button>
                <button
                  className={`adm-btn ${isLockAction ? (isLock ? 'adm-btn--danger' : 'adm-btn--success') : 'adm-btn--primary'}`}
                  onClick={() => {
                    if (isLockAction) {
                      applyLock(confirmModal.userId, isLock);
                      setLockResult({ ok: true, msg: `User "${user.userName}" has been ${isLock ? 'locked' : 'unlocked'} successfully.` });
                      // refresh status panel if it's showing the same user
                      setStatusResult(prev =>
                        prev && prev !== 'notfound' && prev.id === confirmModal.userId
                          ? { ...prev, lockStatus: isLock ? 'Locked' : 'Unlocked' }
                          : prev
                      );
                    } else if (confirmModal.newRole) {
                      applyRole(confirmModal.userId, confirmModal.newRole);
                      setPermResult({ ok: true, msg: `"${user.userName}" is now a ${roleMeta(confirmModal.newRole).label}.` });
                    }
                    setConfirmModal(null);
                  }}
                >
                  <i className={`bi ${isLockAction ? (isLock ? 'bi-lock-fill' : 'bi-unlock-fill') : 'bi-check2-circle'}`} />
                  Confirm
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
