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

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GroupsTable } from '../components/groups/GroupsTable';
import { GroupForm } from '../components/groups/GroupForm';
import { Pagination } from '../components/common/Pagination';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useGroups } from '../hooks/useGroups';
import { groupsService } from '../services/groupsService';
import { useProfile } from '../contexts/ProfileContext';
import type { Group } from '../types/group';

export function GroupsPage() {
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const [ignoreAccess, setIgnoreAccess] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editGroup, setEditGroup] = useState<Group | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<Group | null>(null);
  const [myGroupsQuery, setMyGroupsQuery] = useState('');
  const [allGroupsQuery, setAllGroupsQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [searchFocused, setSearchFocused] = useState(false);
  const [roleFilter, setRoleFilter] = useState<'admin' | 'member' | 'norole' | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [tabFading, setTabFading] = useState(false);
  const [showCards, setShowCards] = useState(true);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const justSelectedRef = useRef(false);

  const activeQuery = ignoreAccess ? allGroupsQuery : myGroupsQuery;

  const {
    groups,
    isLoading,
    nextPage,
    prevPage,
    nextPageEnabled,
    prevPageEnabled,
    getPanelTitle,
    createGroup,
    updateGroup,
    deleteGroup,
    isCreating,
    isUpdating,
    isDeleting,
    resetPaging,
  } = useGroups(ignoreAccess, activeQuery);

  const { data: insightMyGroups } = useQuery({
    queryKey: ['insight-my-groups'],
    queryFn: async () => {
      const res = await groupsService.getGroups(false, undefined, 1000);
      return res.data.groups ?? [];
    },
  });

  const { data: insightAllGroups } = useQuery({
    queryKey: ['insight-all-groups'],
    queryFn: async () => {
      const res = await groupsService.getGroups(true, undefined, 1000);
      return res.data.groups ?? [];
    },
  });

  const insightGroupIdsSample = (insightMyGroups ?? []).slice(0, 10).map((g) => g.id);

  const { data: recentChangesCount } = useQuery({
    queryKey: ['insight-recent-changes', insightGroupIdsSample],
    queryFn: async () => {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const results = await Promise.all(
        insightGroupIdsSample.map((gid) =>
          groupsService.getGroupChanges(gid, 20).catch(() => ({ data: { changes: [] } }))
        )
      );
      return results.reduce((total, res) => {
        const changes = (res.data as { changes?: Array<{ created: string }> }).changes ?? [];
        return total + changes.filter((c) => c.created && new Date(c.created).getTime() > sevenDaysAgo).length;
      }, 0);
    },
    enabled: insightGroupIdsSample.length > 0,
  });

  const insightMyCount   = insightMyGroups?.length ?? null;
  const insightAllCount  = insightAllGroups?.length ?? null;
  const insightMgdCount  = insightMyGroups
    ? insightMyGroups.filter((g) => g.admins.some((a) => a.id === profile?.id)).length
    : null;
  const insightMemberOnlyCount = insightMyCount !== null && insightMgdCount !== null ? insightMyCount - insightMgdCount : null;
  const insightNotMemberCount  = insightAllCount !== null && insightMyCount !== null ? insightAllCount - insightMyCount : null;
  const insightSoleAdminCount  = insightMyGroups
    ? insightMyGroups.filter((g) => g.admins.some((a) => a.id === profile?.id) && g.admins.length === 1).length
    : null;
  useEffect(() => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false;
      return;
    }
    if (searchInput.length < 1) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await groupsService.getGroupsAbridged(10, undefined, ignoreAccess, searchInput);
        const names = (res.data.groups ?? []).map((g: { name: string }) => g.name).slice(0, 10);
        setSuggestions(names);
        setShowSuggestions(names.length > 0);
        setActiveSuggestion(-1);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput, ignoreAccess]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target as Node)) {
        setRoleDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = useCallback(() => {
    setShowSuggestions(false);
    setSearchFilter(searchInput);
    if (ignoreAccess) setAllGroupsQuery(searchInput);
    else setMyGroupsQuery(searchInput);
    resetPaging();
  }, [ignoreAccess, searchInput, resetPaging]);

  const handleSuggestionClick = (name: string) => {
    justSelectedRef.current = true;
    setSearchInput(name);
    setShowSuggestions(false);
    setSearchFilter(name);
    if (ignoreAccess) setAllGroupsQuery(name);
    else setMyGroupsQuery(name);
    resetPaging();
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      setShowSuggestions(false);
      handleSearch();
      return;
    }
    if (!showSuggestions) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestion((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestion((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const highlightMatch = (text: string, term: string) => {
    if (!term) return text;
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.split(regex).map((part, i) =>
      regex.test(part) ? <strong key={i}>{part}</strong> : part
    );
  };

  useEffect(() => {
    resetPaging();
    setSearchInput(ignoreAccess ? allGroupsQuery : myGroupsQuery);
    setSuggestions([]);
    setShowSuggestions(false);
  }, [ignoreAccess]);

  const handleRefresh = useCallback(() => {
    if (ignoreAccess) {
      setAllGroupsQuery('');
    } else {
      setMyGroupsQuery('');
    }
    setSearchInput('');
    setSuggestions([]);
    setShowSuggestions(false);
    setSearchFilter('');
    setRoleFilter(null);
    resetPaging();
    queryClient.invalidateQueries({ queryKey: ['groups'] });
  }, [ignoreAccess, resetPaging, queryClient]);

  const handleTabSwitch = useCallback((newIgnoreAccess: boolean) => {
    if (newIgnoreAccess === ignoreAccess) return;
    setTabFading(true);
    setTimeout(() => {
      setIgnoreAccess(newIgnoreAccess);
      setRoleFilter(null);
      setSearchFilter('');
      setSearchInput('');
      setSuggestions([]);
      setShowSuggestions(false);
      setTimeout(() => setTabFading(false), 40);
    }, 180);
  }, [ignoreAccess]);

  const handleCreate = (data: { name: string; email: string; description?: string }) => {
    createGroup(
      {
        ...data,
        members: profile ? [{ id: profile.id }] : [],
        admins: profile ? [{ id: profile.id }] : [],
      },
      { onSuccess: () => setShowForm(false) }
    );
  };

  const handleUpdate = (data: { name: string; email: string; description?: string }) => {
    if (!editGroup) return;
    updateGroup({ id: editGroup.id, group: { ...editGroup, ...data } }, {
      onSuccess: () => setEditGroup(null),
    });
  };

  const isGroupAdmin = (group: Group): boolean => {
    const isAdmin = group.admins.some((a) => a.id === profile?.id);
    return Boolean(isAdmin || profile?.isSuper);
  };

  const handleDelete = (group: Group) => setGroupToDelete(group);

  const handleDeleteConfirm = () => {
    if (groupToDelete) {
      deleteGroup(groupToDelete.id);
      setGroupToDelete(null);
    }
  };

  const insightSource = ignoreAccess ? (insightAllGroups ?? []) : (insightMyGroups ?? []);

 const searchFilteredGroups = searchFilter
    ? insightSource.filter((g) =>
        g.name.toLowerCase().includes(searchFilter.toLowerCase())
      )
    : roleFilter
    ? insightSource
    : groups;

  const roleFilterBase = searchFilter ? searchFilteredGroups : insightSource;

  const hasAdminRole = roleFilterBase.some(
    (g) => g.admins.some((a) => a.id === profile?.id) || Boolean(profile?.isSuper)
  );
  const hasMemberRole = roleFilterBase.some((g) => {
    const isAdminRole = g.admins.some((a) => a.id === profile?.id) || Boolean(profile?.isSuper);
    return (g.members?.some((m) => m.id === profile?.id) ?? false) && !isAdminRole;
  });
  const hasNoRoleInData = roleFilterBase.some((g) => {
    const isAdminRole = g.admins.some((a) => a.id === profile?.id) || Boolean(profile?.isSuper);
    return !(g.members?.some((m) => m.id === profile?.id) ?? false) && !isAdminRole;
  });

  const displayedGroups = roleFilter
    ? searchFilteredGroups.filter((g) => {
        const isAdminRole = g.admins.some((a) => a.id === profile?.id) || Boolean(profile?.isSuper);
        const isMemberRole = g.members?.some((m) => m.id === profile?.id);
        if (roleFilter === 'admin') return isAdminRole;
        if (roleFilter === 'member') return isMemberRole && !isAdminRole;
        if (roleFilter === 'norole') return !isMemberRole && !isAdminRole;
        return true;
      })
    : searchFilteredGroups;

  const roleFilterLabel: Record<string, string> = { admin: 'Admin', member: 'Member', norole: 'No Role' };

  const anyFilterActive = !!(roleFilter || searchFilter);
  const cardAdminFiltered = displayedGroups.filter(
    (g) => g.admins.some((a) => a.id === profile?.id) || Boolean(profile?.isSuper)
  ).length;
  const cardMemberOnlyFiltered = displayedGroups.filter(
    (g) =>
      g.members?.some((m) => m.id === profile?.id) &&
      !g.admins.some((a) => a.id === profile?.id) &&
      !profile?.isSuper
  ).length;
  const cardSoleAdminFiltered = displayedGroups.filter(
    (g) =>
      (g.admins.some((a) => a.id === profile?.id) || Boolean(profile?.isSuper)) &&
      g.admins.length === 1
  ).length;

  
  const cardCount      = anyFilterActive ? displayedGroups.length  : (ignoreAccess ? insightAllCount  : insightMyCount);
  const cardAdminCount = anyFilterActive ? cardAdminFiltered        : insightMgdCount;
  const cardMemberOnly = anyFilterActive ? cardMemberOnlyFiltered   : insightMemberOnlyCount;
  const cardSoleAdmin  = anyFilterActive ? cardSoleAdminFiltered    : insightSoleAdminCount;
  // Denominator for progress bar (% of filtered set or full set)
  const cardBaseCount  = anyFilterActive ? displayedGroups.length   : (insightMyCount ?? 0);

  return (
    <div>
      {/* ── Page header ── */}
      <div className="rounded-3 mb-4 d-flex justify-content-between align-items-center vds-page-header">
        <div className="d-flex align-items-center gap-3">
          <div className="rounded-3 d-flex align-items-center justify-content-center vds-page-header__icon">
            <i className="bi bi-people-fill text-white fs-5" />
          </div>
          <div>
            <h4 className="mb-0 fw-bold vds-page-header__title">Groups</h4>
            <small className="text-muted">Manage DNS groups and their members</small>
          </div>
        </div>
        <button
          className="btn btn-primary d-flex align-items-center gap-2 vds-btn-primary-shadow vds-btn-nav"
          onClick={() => { setShowForm(prev => { if (!prev) setEditGroup(null); return !prev; }); }}
        >
          <i className="bi bi-plus-circle-fill" />
          New Group
        </button>
      </div>

      {showForm && (
        <div className="card mb-4 vds-form-card">
          <div className="card-header vds-form-card__header vds-form-card__header--create d-flex align-items-center gap-2">
            <i className="bi bi-plus-circle" />
            Create New Group
          </div>
          <div className="card-body bg-white vds-form-card__body">
            <GroupForm
              onSubmit={handleCreate}
              onCancel={() => setShowForm(false)}
              isSubmitting={isCreating}
              mode="create"
            />
          </div>
        </div>
      )}

      {editGroup && (
        <div className="card mb-4 vds-form-card vds-form-card--edit">
          <div className="card-header vds-form-card__header vds-form-card__header--edit d-flex align-items-center gap-2">
            <i className="bi bi-pencil-square" />
            Edit Group: {editGroup.name}
          </div>
          <div className="card-body bg-white vds-form-card__body">
            <GroupForm
              initialData={editGroup}
              onSubmit={handleUpdate}
              onCancel={() => setEditGroup(null)}
              isSubmitting={isUpdating}
              mode="edit"
            />
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="card mb-2 vds-toolbar-card">
        <div className="card-body py-2 px-3">
          <div className="d-flex gap-3 flex-wrap align-items-center">
            <div className="vds-pill-toggle">
              <button
                type="button"
                className={`vds-pill-toggle__btn${!ignoreAccess ? ' vds-pill-toggle__btn--active' : ''}`}
                onClick={() => handleTabSwitch(false)}
              >
                <i className="bi bi-person-check" />My Groups
              </button>
              <button
                type="button"
                className={`vds-pill-toggle__btn${ignoreAccess ? ' vds-pill-toggle__btn--active' : ''}`}
                onClick={() => handleTabSwitch(true)}
              >
                <i className="bi bi-globe" />All Groups
              </button>
            </div>

            <div className="ms-auto d-flex align-items-center gap-2">

              {/* ── Role filter — dropdown ── */}
              <div ref={roleDropdownRef} className="position-relative">
                <button
                  className="btn btn-sm d-flex align-items-center gap-1 vds-btn-flat"
                  onClick={() => setRoleDropdownOpen((o) => !o)}
                >
                  <i className="bi bi-funnel" />
                  <span className="vds-btn-flat__label">Your Role</span>
                  {roleFilter && (
                    <span className="vds-filter-chip--accent">
                      {roleFilterLabel[roleFilter]}
                    </span>
                  )}
                  <i className={`bi bi-chevron-${roleDropdownOpen ? 'up' : 'down'} ms-1`} style={{ fontSize: '0.65rem', color: '#506080' }} />
                </button>
                {roleDropdownOpen && (
                  <ul
                    className="list-group position-absolute shadow"
                    style={{ zIndex: 1050, top: 'calc(100% + 4px)', right: 0, minWidth: '145px', borderRadius: '0.55rem', overflow: 'hidden', border: '1px solid #d4dbe8' }}
                  >
                    {hasAdminRole && (
                      <li
                        className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${roleFilter === 'admin' ? ' vds-role-item--selected' : ''}`}
                        style={{ cursor: 'pointer', fontSize: '0.85rem' }}
                        onMouseDown={() => { setRoleFilter(roleFilter === 'admin' ? null : 'admin'); setRoleDropdownOpen(false); }}
                      >
                        <i className="bi bi-shield-fill" />Admin
                      </li>
                    )}
                    {hasMemberRole && (
                      <li
                        className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${roleFilter === 'member' ? ' vds-role-item--selected' : ''}`}
                        style={{ cursor: 'pointer', fontSize: '0.85rem' }}
                        onMouseDown={() => { setRoleFilter(roleFilter === 'member' ? null : 'member'); setRoleDropdownOpen(false); }}
                      >
                        <i className="bi bi-person-check" />Member
                      </li>
                    )}
                    {hasNoRoleInData && (
                      <li
                        className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${roleFilter === 'norole' ? ' vds-role-item--selected' : ''}`}
                        style={{ cursor: 'pointer', fontSize: '0.85rem' }}
                        onMouseDown={() => { setRoleFilter(roleFilter === 'norole' ? null : 'norole'); setRoleDropdownOpen(false); }}
                      >
                        <i className="bi bi-person-dash" />No Role
                      </li>
                    )}
                  </ul>
                )}
              </div>

              {/* ── Search ── */}
              <div className="position-relative vds-search-wrapper" ref={suggestionsRef}>
                <div className="input-group input-group-sm vds-search-group" style={{ width: 220, flexShrink: 1 }}>
                  <span className="input-group-text border-0 bg-transparent pe-1">
                    <i className={`bi bi-search${searchFocused ? ' text-primary' : ' text-muted'}`} />
                  </span>
                  <input
                    id="group-search-text"
                    type="text"
                    className="form-control border-0 ps-0 shadow-none bg-transparent"
                    placeholder="Search group by name"
                    value={searchInput}
                    autoComplete="off"
                    onChange={(e) => {
                      const val = e.target.value;
                      setSearchInput(val);
                      if (val === '') {
                        setSearchFilter('');
                        if (ignoreAccess) setAllGroupsQuery('');
                        else setMyGroupsQuery('');
                        resetPaging();
                      }
                    }}
                    onKeyDown={handleSearchKeyDown}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                  />
                </div>
                {showSuggestions && (
                  <ul className="list-group position-absolute w-100 shadow-lg vds-suggestions-list" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                    {suggestions.slice(0, 10).map((name, i) => (
                      <li
                        key={name}
                        className={`list-group-item list-group-item-action vds-suggestion-item${i === activeSuggestion ? ' active' : ''}`}
                        onMouseDown={() => handleSuggestionClick(name)}
                      >
                        {highlightMatch(name, searchInput)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ── Refresh ── */}
              <button
                id="refresh-group-button"
                className="btn btn-sm d-flex align-items-center gap-1 vds-btn-flat"
                onClick={handleRefresh}
              >
                <i className="bi bi-arrow-clockwise" />
                <span className="vds-btn-flat__label">Refresh</span>
              </button>
              <button
                className="btn btn-sm d-flex align-items-center gap-1 vds-btn-flat"
                onClick={() => setShowCards((v) => !v)}
                title={showCards ? 'Hide insight cards' : 'Show insight cards'}
              >
                <i className={`bi ${showCards ? 'bi-eye-slash' : 'bi-eye'}`} />
                <span className="vds-btn-flat__label">{showCards ? 'Hide Cards' : 'Show Cards'}</span>
              </button>

            </div>
          </div>
        </div>
      </div>

      {(roleFilter || searchFilter) && (
        <div className="d-flex justify-content-end gap-2 mb-2 flex-wrap align-items-center px-1">
          {searchFilter && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className="bi bi-search" />
              Search: {searchFilter}
              <button
                type="button"
                className="btn-close ms-1"
                style={{ fontSize: '0.5rem', filter: 'invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)' }}
                aria-label="Remove search filter"
                onClick={() => {
                  setSearchFilter('');
                  setSearchInput('');
                  if (ignoreAccess) setAllGroupsQuery('');
                  else setMyGroupsQuery('');
                  resetPaging();
                }}
              />
            </span>
          )}
          {roleFilter && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className="bi bi-funnel" />
              Role: {roleFilterLabel[roleFilter]}
              <button
                type="button"
                className="btn-close ms-1"
                style={{ fontSize: '0.5rem', filter: 'invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)' }}
                aria-label="Remove role filter"
                onClick={() => setRoleFilter(null)}
              />
            </span>
          )}
          <button type="button" className="btn btn-sm vds-btn-flat d-flex align-items-center gap-1"
            style={{ color: '#e53e3e', border: '1px solid rgba(229,62,62,0.3)', fontSize: '0.78rem' }}
            onClick={() => {
              setSearchFilter(''); setSearchInput(''); setRoleFilter(null);
              if (ignoreAccess) setAllGroupsQuery(''); else setMyGroupsQuery('');
              resetPaging();
            }}>
            <i className="bi bi-x-circle" />Clear All
          </button>
        </div>
      )}

      {/* ── Insight cards + table (fade on tab switch) ── */}
      <div className={`vds-tab-content${tabFading ? ' vds-tab-content--fading' : ''}`}>

      {/* ── Insight cards ── */}
      {showCards && <div className="row g-2 mb-3 align-items-stretch">
        {/* Total Groups */}
        <div className="col-6 col-md-3 d-flex">
          <div className="rounded-3 px-3 py-2 w-100 d-flex flex-column vds-insight-card vds-insight-card--blue">
            <div className="d-flex align-items-center gap-2 mb-1">
              <div className="rounded-2 vds-insight-icon vds-insight-icon--blue">
                <i className="bi bi-globe2" />
              </div>
              <span className="vds-insight-label vds-insight-label--blue">Total Groups</span>
              <span className="vds-insight-value vds-insight-value--blue">
                {cardCount ?? <span className="vds-insight-skeleton vds-insight-skeleton--blue" />}
              </span>
            </div>
            <div className="vds-insight-body vds-insight-body--blue">
              <div className="vds-insight-stat-label">Platform-wide</div>
              <div className="vds-insight-stat-label vds-insight-stat-label--right">User belong to</div>
              <div className="vds-insight-stat-value vds-insight-stat-value--blue">{insightAllCount ?? '…'}</div>
              <div className="vds-insight-stat-value vds-insight-stat-value--blue vds-insight-stat-value--right">{insightMyCount ?? '…'}</div>
              <div className="vds-insight-footnote">
                <i className="bi bi-person-x me-1 vds-icon-blue-dim" />
                Not a member of {insightNotMemberCount !== null ? insightNotMemberCount : '…'} groups
              </div>
            </div>
          </div>
        </div>

        {/* My Groups tab */}
        <div className="col-6 col-md-3 d-flex">
          {!ignoreAccess ? (
            /* ── My Groups tab: Member Only ── */
            <div className="rounded-3 px-3 py-2 w-100 d-flex flex-column vds-insight-card vds-insight-card--purple">
              <div className="d-flex align-items-center gap-2 mb-1">
                <div className="rounded-2 vds-insight-icon vds-insight-icon--purple">
                  <i className="bi bi-person-lines-fill" />
                </div>
                <span className="vds-insight-label vds-insight-label--purple">Member Only</span>
                <span className="vds-insight-value vds-insight-value--purple">
                  {(anyFilterActive ? cardMemberOnly : insightMemberOnlyCount) ?? <span className="vds-insight-skeleton vds-insight-skeleton--purple" />}
                </span>
              </div>
              <div className="vds-insight-body vds-insight-body--purple">
                <div className="vds-insight-stat-label" style={{ gridColumn: '1 / -1' }}>My groups</div>
                <div className="vds-insight-stat-value vds-insight-stat-value--purple" style={{ gridColumn: '1 / -1' }}>{insightMyCount ?? '…'}</div>
                <div className="vds-insight-footnote">
                  <i className="bi bi-eye me-1 vds-icon-purple-dim" />
                  Groups where you're a member but not an admin
                </div>
              </div>
            </div>
          ) : (
            /* ── All Groups tab: My Groups ── */
            <div className="rounded-3 px-3 py-2 w-100 d-flex flex-column vds-insight-card vds-insight-card--purple">
              <div className="d-flex align-items-center gap-2 mb-1">
                <div className="rounded-2 vds-insight-icon vds-insight-icon--purple">
                  <i className="bi bi-person-check-fill" />
                </div>
                <span className="vds-insight-label vds-insight-label--purple">My Groups</span>
                <span className="vds-insight-value vds-insight-value--purple">
                  {(anyFilterActive ? cardCount : insightMyCount) ?? <span className="vds-insight-skeleton vds-insight-skeleton--purple" />}
                </span>
              </div>
              <div className="vds-insight-body vds-insight-body--purple">
                <div className="vds-insight-stat-label">Admin</div>
                <div className="vds-insight-stat-label vds-insight-stat-label--right">Member only</div>
                <div className="vds-insight-stat-value vds-insight-stat-value--purple">{cardAdminCount ?? '…'}</div>
                <div className="vds-insight-stat-value vds-insight-stat-value--purple vds-insight-stat-value--right">{cardMemberOnly ?? '…'}</div>
                <div className="vds-insight-footnote">
                  <i className="bi bi-info-circle me-1 vds-icon-purple-dim" />
                  Groups you are a member or admin of
                </div>
              </div>
            </div>
          )}
        </div>

        {/* I Manage */}
        <div className="col-6 col-md-3 d-flex">
          <div className="rounded-3 px-3 py-2 w-100 d-flex flex-column vds-insight-card vds-insight-card--amber">
            <div className="d-flex align-items-center gap-2 mb-1">
              <div className="rounded-2 vds-insight-icon vds-insight-icon--amber">
                <i className="bi bi-shield-fill" />
              </div>
              <span className="vds-insight-label vds-insight-label--amber">I Manage</span>
              <span className="vds-insight-value vds-insight-value--amber">
                {cardAdminCount ?? <span className="vds-insight-skeleton vds-insight-skeleton--amber" />}
              </span>
            </div>
            <div className="vds-insight-body-amber-outer">
              {(anyFilterActive ? cardBaseCount > 0 : (insightMyCount !== null && insightMgdCount !== null && insightMyCount > 0)) ? (
                <>
                  <div className="vds-insight-progress vds-insight-progress--amber">
                    <div
                      className="vds-insight-progress__fill vds-insight-progress__fill--amber"
                      style={{ width: `${cardBaseCount > 0 ? Math.round(((cardAdminCount ?? 0) / cardBaseCount) * 100) : 0}%` }}
                    />
                  </div>
                  <div className="vds-insight-body vds-insight-body--inner">
                    <div className="vds-insight-stat-label">% of my groups</div>
                    <div className="vds-insight-stat-label vds-insight-stat-label--right">Sole admin</div>
                    <div className="vds-insight-stat-value vds-insight-stat-value--amber">
                      {cardBaseCount > 0 ? Math.round(((cardAdminCount ?? 0) / cardBaseCount) * 100) : 0}%
                    </div>
                    <div className="vds-insight-stat-value vds-insight-stat-value--amber vds-insight-stat-value--right">{cardSoleAdmin ?? '…'}</div>
                  </div>
                  <div className="vds-insight-footnote">
                    <i className="bi bi-exclamation-triangle me-1 vds-icon-amber" />
                    Sole admin in {cardSoleAdmin !== null ? cardSoleAdmin : '…'} groups — only you can manage them
                  </div>
                </>
              ) : (
                <div className="vds-insight-no-data">No groups managed yet</div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Changes */}
        <div className="col-6 col-md-3 d-flex">
          <div className="rounded-3 px-3 py-2 w-100 d-flex flex-column vds-insight-card vds-insight-card--teal">
            <div className="d-flex align-items-center gap-2 mb-1">
              <div className="rounded-2 vds-insight-icon vds-insight-icon--teal">
                <i className="bi bi-clock-history" />
              </div>
              <span className="vds-insight-label vds-insight-label--teal">Recent Changes</span>
              <span className="vds-insight-value vds-insight-value--teal">
                {recentChangesCount !== undefined ? recentChangesCount : <span className="vds-insight-skeleton vds-insight-skeleton--teal" />}
              </span>
            </div>
            <div className="vds-insight-body vds-insight-body--teal">
              <div className="vds-insight-stat-label">Timeframe</div>
              <div className="vds-insight-stat-label vds-insight-stat-label--right">Groups scanned</div>
              <div className="vds-insight-stat-value vds-insight-stat-value--teal">Last 7 days</div>
              <div className="vds-insight-stat-value vds-insight-stat-value--teal vds-insight-stat-value--right">{insightGroupIdsSample.length} / {insightMyCount ?? '…'}</div>
              <div className="vds-insight-footnote">
                <i className="bi bi-info-circle me-1 vds-icon-teal-dim" />
                {insightGroupIdsSample.length < (insightMyCount ?? 0) ? 'First 10 groups scanned for activity' : 'All your groups scanned'}
              </div>
            </div>
          </div>
        </div>
      </div>}

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          {(!anyFilterActive && (nextPageEnabled || prevPageEnabled)) && (
            <Pagination
              onPrev={prevPage}
              onNext={nextPage}
              prevEnabled={prevPageEnabled}
              nextEnabled={nextPageEnabled}
              panelTitle={getPanelTitle()}
            />
          )}
          <GroupsTable
            groups={displayedGroups}
            onDelete={handleDelete}
            onEdit={(g) => { setEditGroup(g); setShowForm(false); }}
            isDeleting={isDeleting}
            isGroupAdmin={isGroupAdmin}
            currentUserId={profile?.id}
          />
          {(!anyFilterActive && (nextPageEnabled || prevPageEnabled)) && (
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
      </div>
      {/* ── Delete confirmation modal ── */}
      {groupToDelete && (
        <div
          className="modal d-block"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setGroupToDelete(null); }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title fw-semibold">Delete Group</h5>
                <button type="button" className="btn-close" onClick={() => setGroupToDelete(null)} />
              </div>
              <div className="modal-body">
                Are you sure you want to delete group{' '}
                <strong>{groupToDelete.name}</strong>? This action cannot be undone.
              </div>
              <div className="modal-footer">
                <button className="btn btn-outline-secondary" onClick={() => setGroupToDelete(null)}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={handleDeleteConfirm}>
                  <i className="bi bi-trash me-1" />Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
