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
import { ZonesTable } from '../components/zones/ZonesTable';
import { AbandonedZonesTable } from '../components/zones/AbandonedZonesTable';
import { ZoneForm } from '../components/zones/ZoneForm';
import { Pagination } from '../components/common/Pagination';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { TimeFilterDropdown } from '../components/common/TimeFilterDropdown';
import type { TimeRange } from '../components/common/TimeFilterDropdown';
import { useZones, useDeletedZones } from '../hooks/useZones';
import { groupsService } from '../services/groupsService';
import { zonesService } from '../services/zonesService';
import { useProfile } from '../contexts/ProfileContext';
import type { Zone } from '../types/zone';

// ── Tab type ───────────────────────────────────────────────────────────────────
type MainTab = 'myZones' | 'allZones' | 'abandonedZones';
type AbandonedSubTab = 'myAbandoned' | 'allAbandoned';

export function ZonesPage() {
  const queryClient = useQueryClient();
  const { profile } = useProfile();
  const isSuper = profile?.isSuper ?? false;
  const isSupport = profile?.isSupport ?? false;
  const canSeeAllAbandoned = isSuper || isSupport;

  // ── Tab state ────────────────────────────────────────────────────────────────
  const [mainTab, setMainTab] = useState<MainTab>('myZones');
  const [abandonedSubTab, setAbandonedSubTab] = useState<AbandonedSubTab>('myAbandoned');
  const [tabFading, setTabFading] = useState(false);

  // ── Modals / forms ───────────────────────────────────────────────────────────
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [showCards, setShowCards] = useState(true);
  // ── Per-tab search inputs (committed on Search / Enter) ──────────────────────
  const [myZonesInput,   setMyZonesInput]   = useState('');
  const [allZonesInput,  setAllZonesInput]  = useState('');
  const [abandonedInput, setAbandonedInput] = useState('');

  // Committed queries
  const [myZonesQuery,   setMyZonesQuery]   = useState('');
  const [allZonesQuery,  setAllZonesQuery]  = useState('');
  const [abandonedQuery, setAbandonedQuery] = useState('');

  // ── Per-tab filters ───────────────────────────────────────────────────────────
  const [myZonesByGroup,  setMyZonesByGroup]  = useState(false);
  const [allZonesByGroup, setAllZonesByGroup] = useState(false);
  const [myZonesHidePtr,  setMyZonesHidePtr]  = useState(false);
  const [allZonesHidePtr, setAllZonesHidePtr] = useState(false);

  // ── Fancy filter dropdowns ─────────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [accessFilter, setAccessFilter] = useState<'shared' | 'private' | null>(null);
  const [statusDropdownOpen, setStatusDropdownOpen]   = useState(false);
  const [accessDropdownOpen, setAccessDropdownOpen]   = useState(false);
  const statusDropdownRef  = useRef<HTMLDivElement>(null);
  const accessDropdownRef  = useRef<HTMLDivElement>(null);

  // ── Abandoned zone filters ────────────────────────────────────────────────────
  const [abanStatusFilter, setAbanStatusFilter] = useState<string | null>(null);
  const [abanAccessFilter, setAbanAccessFilter] = useState<'shared' | 'private' | null>(null);
  const [abanByGroup, setAbanByGroup] = useState(false);
  const [abanByFilter, setAbanByFilter] = useState<string | null>(null);
  const [abanStatusDropdownOpen, setAbanStatusDropdownOpen] = useState(false);
  const [abanAccessDropdownOpen, setAbanAccessDropdownOpen] = useState(false);
  const [abanByDropdownOpen, setAbanByDropdownOpen] = useState(false);
  const abanStatusDropdownRef = useRef<HTMLDivElement>(null);
  const abanAccessDropdownRef = useRef<HTMLDivElement>(null);
  const abanByDropdownRef = useRef<HTMLDivElement>(null);

  // ── Search suggestions ────────────────────────────────────────────────────────
  const [mySuggestionsOpen,  setMySuggestionsOpen]  = useState(false);
  const [allSuggestionsOpen, setAllSuggestionsOpen] = useState(false);
  const mySuggestionsRef  = useRef<HTMLDivElement>(null);
  const allSuggestionsRef = useRef<HTMLDivElement>(null);
  // Debounced values for suggestions queries
  const [myZonesSuggestQuery,  setMyZonesSuggestQuery]  = useState('');
  const [allZonesSuggestQuery, setAllZonesSuggestQuery] = useState('');

  // ── Client-side email filter ───────────────────────────────────────────────────
  const [emailFilter, setEmailFilter] = useState('');

  // ── Time filters ──────────────────────────────────────────────────────────────
  const [zoneTimeRange, setZoneTimeRange] = useState<TimeRange>('all');
  const [zoneDateFrom, setZoneDateFrom] = useState('');
  const [zoneDateTo, setZoneDateTo] = useState('');
  const [abanTimeRange, setAbanTimeRange] = useState<TimeRange>('all');
  const [abanDateFrom, setAbanDateFrom] = useState('');
  const [abanDateTo, setAbanDateTo] = useState('');

  // ── Zones hooks ───────────────────────────────────────────────────────────────
  const myZones = useZones(false, !myZonesHidePtr);
  const allZones = useZones(true,  !allZonesHidePtr);

  
  const myAbandoned  = useDeletedZones(false, mainTab === 'abandonedZones');
  const allAbandoned = useDeletedZones(true,  mainTab === 'abandonedZones');

  const activeAbandonedHook =
    abandonedSubTab === 'myAbandoned' ? myAbandoned : allAbandoned;

  // ── Backend IDs & groups (for ZoneForm) ──────────────────────────────────────
  const { data: groupsData } = useQuery({
    queryKey: ['all-groups'],
    queryFn: async () => {
      const res = await groupsService.getGroups(true, '');
      return res.data.groups ?? [];
    },
  });

  const { data: backendIds } = useQuery({
    queryKey: ['backend-ids'],
    queryFn: async () => {
      const res = await zonesService.getBackendIds();
      return res.data ?? [];
    },
  });

  // ── Insight data ─────────────────────────────────────────────────────────────
  const { data: insightMyZones } = useQuery({
    queryKey: ['insight-my-zones'],
    queryFn: async () => {
      const res = await zonesService.getZones(100, undefined, undefined, false, false, true);
      return res.data.zones ?? [];
    },
  });

  const { data: insightAllZones } = useQuery({
    queryKey: ['insight-all-zones'],
    queryFn: async () => {
      const res = await zonesService.getZones(100, undefined, undefined, false, true, true);
      return res.data.zones ?? [];
    },
  });

  const { data: insightAbandonedData } = useQuery({
    queryKey: ['insight-abandoned-zones'],
    queryFn: async () => {
      const res = await zonesService.getDeletedZones(100, undefined, undefined, false);
      return res.data.zonesDeletedInfo ?? [];
    },
  });
  const insightAbandonedCount = insightAbandonedData?.length ?? null;

  const insightMyCount  = insightMyZones?.length ?? null;
  const insightAllCount = insightAllZones?.length ?? null;

  // ── Search suggestions queries (ignoreAccess + includeReverse like old portal) ─
  const { data: mySuggestData } = useQuery({
    queryKey: ['zone-suggestions-my', myZonesSuggestQuery],
    queryFn: async () => {
      const res = await zonesService.getZones(10, undefined, myZonesSuggestQuery, false, false, true);
      return res.data.zones ?? [];
    },
    enabled: myZonesSuggestQuery.length > 0 && !myZonesSuggestQuery.includes('@'),
  });

  const { data: allSuggestData } = useQuery({
    queryKey: ['zone-suggestions-all', allZonesSuggestQuery],
    queryFn: async () => {
      const res = await zonesService.getZones(10, undefined, allZonesSuggestQuery, false, true, true);
      return res.data.zones ?? [];
    },
    enabled: allZonesSuggestQuery.length > 0 && !allZonesSuggestQuery.includes('@'),
  });

  const mySuggestions  = mySuggestData  ?? [];
  const allSuggestions = allSuggestData ?? [];

  const fmtAge = (days: number): string => {
    if (days < 1) return 'Today';
    if (days < 30) return `${days}d`;
    if (days < 365) return `${Math.floor(days / 30)}mo`;
    const y = Math.floor(days / 365);
    const m = Math.floor((days % 365) / 30);
    return m > 0 ? `${y}y ${m}mo` : `${y}y`;
  };

  const insightSource = mainTab === 'allZones' ? (insightAllZones ?? []) : (insightMyZones ?? []);
  const zonesForTab   = mainTab === 'allZones' ? allZones.zones : myZones.zones;
  const filterSource  = insightSource.length > 0 ? insightSource : zonesForTab;

  const byGroupActive = mainTab === 'allZones' ? allZonesByGroup : myZonesByGroup;

  const isWithinRange = (dateStr: string | undefined, range: TimeRange, from: string, to: string): boolean => {
    if (range === 'all') return true;
    if (!dateStr) return true;
    const ts = new Date(dateStr).getTime();
    const now = Date.now();
    if (range === '1d') return ts >= now - 86400000;
    if (range === '7d') return ts >= now - 7 * 86400000;
    if (range === '30d') return ts >= now - 30 * 86400000;
    if (range === '90d') return ts >= now - 90 * 86400000;
    if (range === 'custom') {
      // Append T00:00:00 / T23:59:59 without timezone so JS parses as local (browser) time,
      // not UTC — ensuring the filter respects the user's local timezone.
      if (from && ts < new Date(from + 'T00:00:00').getTime()) return false;
      if (to && ts > new Date(to + 'T23:59:59').getTime()) return false;
    }
    return true;
  };

  const anyFilterActive = !!(emailFilter || statusFilter || accessFilter || zoneTimeRange !== 'all');
  // When a name search is committed, use the suggestions data (ignoreAccess:true, includeReverse:true)
  // as the display base — matching old portal behaviour so reverse and non-owned zones are found.
  // Fall back to zonesForTab if suggestions haven't loaded yet.
  const activeNameQuery = mainTab === 'allZones' ? allZonesQuery : myZonesQuery;
  const activeSuggestions = mainTab === 'allZones' ? allSuggestions : mySuggestions;
  const clientFilterBase = activeNameQuery
    ? (activeSuggestions.length > 0 ? activeSuggestions : zonesForTab)
    : filterSource;
  const displayedZones = anyFilterActive
    ? clientFilterBase.filter((z) => {
        const matchesSearch = !emailFilter || (
          byGroupActive
            ? (z.adminGroupName ?? '').toLowerCase().includes(emailFilter.toLowerCase())
            : (
                z.name.toLowerCase().includes(emailFilter.toLowerCase()) ||
                z.email.toLowerCase().includes(emailFilter.toLowerCase())
              )
        );
        const matchesStatus = !statusFilter || z.status === statusFilter;
        const matchesAccess = !accessFilter || (accessFilter === 'shared' ? z.shared : !z.shared);
        const matchesTime = isWithinRange(z.latestSync, zoneTimeRange, zoneDateFrom, zoneDateTo);
        return matchesSearch && matchesStatus && matchesAccess && matchesTime;
      })
    : null;

  const renderedZones = displayedZones ?? zonesForTab;

  // ── Abandoned zones client-side filtering ──────────────────────────────────────────
  const abandonedZonesRaw = activeAbandonedHook.deletedZones;
  const abanStatuses     = Array.from(new Set(abandonedZonesRaw.map((i) => i.zoneChange.zone.status))).filter(Boolean) as string[];
  const abanByOptions    = Array.from(new Set(abandonedZonesRaw.map((i) => i.userName ?? i.zoneChange.userId).filter(Boolean)));
  const abanHasShared    = abandonedZonesRaw.some((i) => !!i.zoneChange.zone.shared);
  const abanHasPrivate   = abandonedZonesRaw.some((i) => !i.zoneChange.zone.shared);
  const anyAbandonedFilterActive = !!(abandonedInput || abanStatusFilter || abanAccessFilter || abanByGroup || abanByFilter || abanTimeRange !== 'all');
  const displayedAbandonedZones = anyAbandonedFilterActive
    ? abandonedZonesRaw.filter((item) => {
        const z = item.zoneChange.zone;
        const matchesSearch = !abandonedInput || (
          abanByGroup
            ? (item.adminGroupName ?? z.adminGroupId ?? '').toLowerCase().includes(abandonedInput.toLowerCase())
            : (
                z.name.toLowerCase().includes(abandonedInput.toLowerCase()) ||
                z.email.toLowerCase().includes(abandonedInput.toLowerCase())
              )
        );
        const matchesStatus = !abanStatusFilter || z.status === abanStatusFilter;
        const matchesAccess = !abanAccessFilter || (abanAccessFilter === 'shared' ? !!z.shared : !z.shared);
        const byUser = item.userName ?? item.zoneChange.userId;
        const matchesBy = !abanByFilter || byUser === abanByFilter;
        const matchesTime = isWithinRange(z.updated, abanTimeRange, abanDateFrom, abanDateTo);
        return matchesSearch && matchesStatus && matchesAccess && matchesBy && matchesTime;
      })
    : abandonedZonesRaw;

  const cardSource: Zone[] =
    mainTab === 'abandonedZones'
      ? displayedAbandonedZones.map((i) => i.zoneChange.zone)
      : (displayedZones ?? insightSource);

  const cardLoading =
    mainTab === 'abandonedZones' ? insightAbandonedData === undefined
    : mainTab === 'allZones'     ? insightAllZones === undefined
    :                              insightMyZones  === undefined;

  const cardTotal          = cardSource.length;
  const cardActiveCount    = cardSource.filter((z) => z.status === 'Active').length;
  const cardSyncingCount   = cardSource.filter((z) => z.status === 'Syncing').length;
  const cardIncidentCount  = cardSource.filter((z) => z.status !== 'Active' && z.status !== 'Deleted').length;
  const cardSharedCount    = cardSource.filter((z) => !!z.shared).length;
  const cardPtrCount       = cardSource.filter((z) => z.name.includes('in-addr.arpa') || z.name.includes('ip6.arpa')).length;
  const cardNeverSynced    = cardSource.filter((z) => !z.latestSync).length;
  const cardRecentlySynced = cardSource.filter((z) =>
    Boolean(z.latestSync) && (Date.now() - new Date(z.latestSync!).getTime()) <= 7 * 86400000
  ).length;
  const cardNewThisMonth   = cardSource.filter((z) =>
    Boolean(z.created) && (Date.now() - new Date(z.created!).getTime()) <= 30 * 86400000
  ).length;
  const cardOldestAgeDays: number | null = (() => {
    const times = cardSource
      .filter((z) => Boolean(z.created))
      .map((z) => new Date(z.created!).getTime());
    return times.length ? Math.floor((Date.now() - Math.min(...times)) / 86400000) : null;
  })();

  const cardContextLabel =
    mainTab === 'abandonedZones' ? 'Abandoned'
    : mainTab === 'allZones'     ? 'All Zones'
    :                              'My Zones';
  const cardFiltered = mainTab === 'abandonedZones' ? anyAbandonedFilterActive : anyFilterActive;

  const skeletonBlue   = <span className="vds-insight-skeleton vds-insight-skeleton--blue" />;
  const skeletonTeal   = <span className="vds-insight-skeleton vds-insight-skeleton--teal" />;
  const skeletonPurple = <span className="vds-insight-skeleton vds-insight-skeleton--purple" />;
  const skeletonAmber  = <span className="vds-insight-skeleton vds-insight-skeleton--amber" />;

  const card1RefLabel  = mainTab === 'abandonedZones' ? 'Total abandoned' : 'Platform';
  const card1ViewLabel = mainTab === 'abandonedZones' ? 'Showing' : 'In view';
  const card1RefCount  = mainTab === 'abandonedZones' ? insightAbandonedCount : insightAllCount;

  const statusFilterLabel: Record<string, string> = {
    Active: 'Active',
    Deleted: 'Deleted',
    Syncing: 'Syncing',
    PendingDelete: 'Pending Delete',
    PendingUpdate: 'Pending Update',
  };

  const availableStatuses = Array.from(new Set(filterSource.map((z) => z.status))) as string[];
  const hasShared  = renderedZones.some((z) => !!z.shared);
  const hasPrivate = renderedZones.some((z) => !z.shared);
  // ── Sync committed queries → hooks ───────────────────────────────────────────
  useEffect(() => { myZones.search(myZonesQuery, myZonesByGroup); },
    [myZonesQuery, myZonesByGroup]); 
  useEffect(() => { allZones.search(allZonesQuery, allZonesByGroup); },
    [allZonesQuery, allZonesByGroup]); 
  useEffect(() => { myAbandoned.search(abandonedQuery); },
    [abandonedQuery]); 
  useEffect(() => { allAbandoned.search(abandonedQuery); },
    [abandonedQuery]); 

  // ── Debounce search inputs for suggestions ────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setMyZonesSuggestQuery(myZonesInput), 300);
    return () => clearTimeout(timer);
  }, [myZonesInput]);

  useEffect(() => {
    const timer = setTimeout(() => setAllZonesSuggestQuery(allZonesInput), 300);
    return () => clearTimeout(timer);
  }, [allZonesInput]);

  // ── Outside-click handler for filter dropdowns ───────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
      if (accessDropdownRef.current && !accessDropdownRef.current.contains(e.target as Node)) {
        setAccessDropdownOpen(false);
      }
      if (abanStatusDropdownRef.current && !abanStatusDropdownRef.current.contains(e.target as Node)) {
        setAbanStatusDropdownOpen(false);
      }
      if (abanAccessDropdownRef.current && !abanAccessDropdownRef.current.contains(e.target as Node)) {
        setAbanAccessDropdownOpen(false);
      }
      if (abanByDropdownRef.current && !abanByDropdownRef.current.contains(e.target as Node)) {
        setAbanByDropdownOpen(false);
      }
      if (mySuggestionsRef.current && !mySuggestionsRef.current.contains(e.target as Node)) {
        setMySuggestionsOpen(false);
      }
      if (allSuggestionsRef.current && !allSuggestionsRef.current.contains(e.target as Node)) {
        setAllSuggestionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  
  useEffect(() => {
    if (profile && !canSeeAllAbandoned && abandonedSubTab === 'allAbandoned') {
      setAbandonedSubTab('myAbandoned');
    }
  }, [profile, canSeeAllAbandoned, abandonedSubTab]);
  
  const handleTabSwitch = useCallback((tab: MainTab) => {
    if (tab === mainTab) return;
    setTabFading(true);
    setTimeout(() => {
      setMainTab(tab);
      setTimeout(() => setTabFading(false), 40);
    }, 180);
  }, [mainTab]);

  const handleAbandonedSubTabSwitch = useCallback((sub: AbandonedSubTab) => {
    if (sub === abandonedSubTab) return;
    setAbandonedSubTab(sub);
  }, [abandonedSubTab]);

  // ── Refresh ────────────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    setStatusFilter(null);
    setAccessFilter(null);
    setEmailFilter('');
    setMySuggestionsOpen(false);
    setAllSuggestionsOpen(false);
    setZoneTimeRange('all'); setZoneDateFrom(''); setZoneDateTo('');
    if (mainTab === 'myZones') {
      setMyZonesInput(''); setMyZonesQuery('');
      myZones.resetPaging();
      void queryClient.invalidateQueries({ queryKey: ['zones'] });
    } else if (mainTab === 'allZones') {
      setAllZonesInput(''); setAllZonesQuery('');
      allZones.resetPaging();
      void queryClient.invalidateQueries({ queryKey: ['zones'] });
    } else {
      setAbandonedInput(''); setAbandonedQuery('');
      setAbanStatusFilter(null);
      setAbanAccessFilter(null);
      setAbanByGroup(false);
      setAbanByFilter(null);
      setAbanTimeRange('all'); setAbanDateFrom(''); setAbanDateTo('');
      myAbandoned.resetPaging();
      allAbandoned.resetPaging();
      void queryClient.invalidateQueries({ queryKey: ['deleted-zones'] });
    }
  }, [mainTab, myZones, allZones, myAbandoned, allAbandoned, queryClient]);

  // ── Search handlers ───────────────────────────────────────────────────────────
  const handleMyZonesSearch = useCallback(() => {
    setMySuggestionsOpen(false);
    // Sync suggest query immediately so suggestions data is ready for display base
    setMyZonesSuggestQuery(myZonesInput);
    setEmailFilter(myZonesInput);
    if (!myZonesInput.includes('@')) setMyZonesQuery(myZonesInput);
    else setMyZonesQuery('');
    myZones.resetPaging();
  }, [myZonesInput, myZones]);

  const handleAllZonesSearch = useCallback(() => {
    setAllSuggestionsOpen(false);
    // Sync suggest query immediately so suggestions data is ready for display base
    setAllZonesSuggestQuery(allZonesInput);
    setEmailFilter(allZonesInput);
    if (!allZonesInput.includes('@')) setAllZonesQuery(allZonesInput);
    else setAllZonesQuery('');
    allZones.resetPaging();
  }, [allZonesInput, allZones]);

  const handleAbandonedSearch = useCallback(() => {
    if (!abanByGroup && !abandonedInput.includes('@')) {
      setAbandonedQuery(abandonedInput);
    } else {
      setAbandonedQuery('');
    }
    myAbandoned.resetPaging();
    allAbandoned.resetPaging();
  }, [abandonedInput, abanByGroup, myAbandoned, allAbandoned]);

  // ── Zone CRUD ─────────────────────────────────────────────────────────────────
  const handleCreate = (data: Zone) => {
    myZones.createZone(data, { onSuccess: () => setShowConnectForm(false) });
  };

  // Sync search box on tab switch
  useEffect(() => {
    if (mainTab === 'myZones') setMyZonesInput(myZonesQuery);
    else if (mainTab === 'allZones') setAllZonesInput(allZonesQuery);
    else setAbandonedInput(abandonedQuery);
  }, [mainTab]); 

  const isLoadingCurrent =
    mainTab === 'myZones'   ? myZones.isLoading :
    mainTab === 'allZones'  ? allZones.isLoading :
    activeAbandonedHook.isLoading;

  return (
    <div>
      {/* ── Page header ── */}
      <div className="rounded-3 mb-4 d-flex justify-content-between align-items-center vds-page-header">
        <div className="d-flex align-items-center gap-3">
          <div className="rounded-3 d-flex align-items-center justify-content-center vds-page-header__icon">
            <i className="bi bi-diagram-3-fill text-white fs-5" />
          </div>
          <div>
            <h4 className="mb-0 fw-bold vds-page-header__title">Zones</h4>
            <small className="text-muted">Manage DNS zones and their configurations</small>
          </div>
        </div>
        {mainTab === 'myZones' && isSuper && (
          <button
            className="btn btn-primary d-flex align-items-center gap-2 vds-btn-primary-shadow vds-btn-nav"
            onClick={() => setShowConnectForm((p) => !p)}
          >
            <i className="bi bi-plug-fill" />
            Connect Zone
          </button>
        )}
      </div>

      {/* ── Connect Zone form ── */}
      {showConnectForm && (
        <div className="card mb-4 vds-form-card">
          <div className="card-header vds-form-card__header vds-form-card__header--create d-flex align-items-center gap-2">
            <i className="bi bi-plug" />
            Connect to Zone
          </div>
          <div className="card-body bg-white vds-form-card__body">
            <ZoneForm
              groups={groupsData ?? []}
              backendIds={backendIds ?? []}
              onSubmit={handleCreate}
              onCancel={() => setShowConnectForm(false)}
              isSubmitting={myZones.isCreating}
              mode="create"
            />
          </div>
        </div>
      )}


      {/* ── Toolbar ── */}
      <div className="card mb-2 vds-toolbar-card">
        <div className="card-body py-2 px-3">
          <div className="d-flex gap-3 flex-wrap align-items-center">

            {/* Tab pills */}
            <div className="vds-pill-toggle">
              <button
                type="button"
                className={`vds-pill-toggle__btn${mainTab === 'myZones' ? ' vds-pill-toggle__btn--active' : ''}`}
                onClick={() => handleTabSwitch('myZones')}
              >
                <i className="bi bi-person-check" />My Zones
              </button>
              <button
                type="button"
                className={`vds-pill-toggle__btn${mainTab === 'allZones' ? ' vds-pill-toggle__btn--active' : ''}`}
                onClick={() => handleTabSwitch('allZones')}
              >
                <i className="bi bi-globe" />All Zones
              </button>
              <button
                type="button"
                className={`vds-pill-toggle__btn${mainTab === 'abandonedZones' ? ' vds-pill-toggle__btn--active' : ''}`}
                onClick={() => handleTabSwitch('abandonedZones')}
              >
                <i className="bi bi-trash3" />Abandoned Zones
              </button>
            </div>

            <div className="d-flex align-items-center gap-2 flex-wrap">

              {/* My Zones search + filters */}
              {mainTab === 'myZones' && (
                <>
                  <div ref={mySuggestionsRef} className="position-relative" style={{ width: 220, flexShrink: 1 }}>
                    <div className="vds-search-group input-group input-group-sm">
                      <span className="input-group-text border-0 bg-transparent pe-1">
                        <i className="bi bi-search text-muted" />
                      </span>
                      <input
                        type="text"
                        className="form-control border-0 ps-0 shadow-none bg-transparent"
                        placeholder="Search by name or email"
                        value={myZonesInput}
                        autoComplete="off"
                        onFocus={() => { if (myZonesInput.length > 0) setMySuggestionsOpen(true); }}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMyZonesInput(val);
                          setMySuggestionsOpen(val.length > 0);
                          if (val === '') {
                            setEmailFilter('');
                            setMyZonesQuery('');
                            myZones.resetPaging();
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { setMySuggestionsOpen(false); handleMyZonesSearch(); }
                          if (e.key === 'Escape') setMySuggestionsOpen(false);
                        }}
                      />
                    </div>
                    {mySuggestionsOpen && mySuggestions.length > 0 && !myZonesInput.includes('@') && (
                      <ul className="list-group position-absolute shadow" style={{ zIndex: 1060, top: 'calc(100% + 2px)', left: 0, minWidth: '100%', width: 'max-content', maxHeight: '260px', overflowY: 'auto', borderRadius: '0.55rem', border: '1px solid #d4dbe8' }}>
                        {mySuggestions.slice(0, 10).map((z) => (
                          <li
                            key={z.id}
                            className="list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item"
                            style={{ cursor: 'pointer', fontSize: '0.82rem' }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setMyZonesInput(z.name);
                              setEmailFilter(z.name);
                              setMyZonesQuery(z.name);
                              setMySuggestionsOpen(false);
                              myZones.resetPaging();
                            }}
                          >
                            <i className="bi bi-diagram-3 text-muted" style={{ fontSize: '0.75rem', flexShrink: 0 }} />
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.name}</span>
                            {z.shared && <span className="badge vds-badge-shared" style={{ fontSize: '0.65rem', flexShrink: 0 }}>shared</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* By Admin Group toggle */}
                  <button
                    className={`btn btn-sm d-flex align-items-center gap-1 vds-btn-flat${myZonesByGroup ? ' vds-btn-flat--active' : ''}`}
                    onClick={() => { setMyZonesByGroup((v) => !v); myZones.resetPaging(); }}
                  >
                    <i className="bi bi-people" />
                    <span className="vds-btn-flat__label">By Admin Group</span>
                    {myZonesByGroup && <span className="vds-filter-chip--accent">On</span>}
                  </button>

                  {/* Hide PTR toggle */}
                  <button
                    className={`btn btn-sm d-flex align-items-center gap-1 vds-btn-flat${myZonesHidePtr ? ' vds-btn-flat--active' : ''}`}
                    onClick={() => { setMyZonesHidePtr((v) => !v); myZones.resetPaging(); }}
                  >
                    <i className="bi bi-arrow-left-right" />
                    <span className="vds-btn-flat__label">Hide PTR</span>
                    {myZonesHidePtr && <span className="vds-filter-chip--accent">On</span>}
                  </button>

                  {/* Status filter dropdown */}
                  <div ref={statusDropdownRef} className="position-relative">
                    <button
                      className="btn btn-sm d-flex align-items-center gap-1 vds-btn-flat"
                      onClick={() => setStatusDropdownOpen((o) => !o)}
                    >
                      <i className="bi bi-funnel" />
                      <span className="vds-btn-flat__label">Status</span>
                      {statusFilter && <span className="vds-filter-chip--accent">{statusFilterLabel[statusFilter]}</span>}
                      <i className={`bi bi-chevron-${statusDropdownOpen ? 'up' : 'down'} ms-1`} style={{ fontSize: '0.65rem', color: '#506080' }} />
                    </button>
                    {statusDropdownOpen && availableStatuses.length > 0 && (
                      <ul className="list-group position-absolute shadow" style={{ zIndex: 1050, top: 'calc(100% + 4px)', right: 0, minWidth: '145px', borderRadius: '0.55rem', overflow: 'hidden', border: '1px solid #d4dbe8' }}>
                        {availableStatuses.map((s) => (
                          <li
                            key={s}
                            className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${statusFilter === s ? ' vds-role-item--selected' : ''}`}
                            style={{ cursor: 'pointer', fontSize: '0.85rem' }}
                            onMouseDown={() => { setStatusFilter(statusFilter === s ? null : s); setStatusDropdownOpen(false); }}
                          >
                            <i className={`bi ${s === 'Active' ? 'bi-check-circle-fill text-success' : 'bi-x-circle text-secondary'}`} />
                            {statusFilterLabel[s] ?? s}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Access filter dropdown */}
                  <div ref={accessDropdownRef} className="position-relative">
                    <button
                      className="btn btn-sm d-flex align-items-center gap-1 vds-btn-flat"
                      onClick={() => setAccessDropdownOpen((o) => !o)}
                    >
                      <i className="bi bi-shield-lock" />
                      <span className="vds-btn-flat__label">Access</span>
                      {accessFilter && <span className="vds-filter-chip--accent">{accessFilter === 'shared' ? 'Shared' : 'Private'}</span>}
                      <i className={`bi bi-chevron-${accessDropdownOpen ? 'up' : 'down'} ms-1`} style={{ fontSize: '0.65rem', color: '#506080' }} />
                    </button>
                    {accessDropdownOpen && (hasShared || hasPrivate) && (
                      <ul className="list-group position-absolute shadow" style={{ zIndex: 1050, top: 'calc(100% + 4px)', right: 0, minWidth: '140px', borderRadius: '0.55rem', overflow: 'hidden', border: '1px solid #d4dbe8' }}>
                        {hasShared && (
                          <li
                            className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${accessFilter === 'shared' ? ' vds-role-item--selected' : ''}`}
                            style={{ cursor: 'pointer', fontSize: '0.85rem' }}
                            onMouseDown={() => { setAccessFilter(accessFilter === 'shared' ? null : 'shared'); setAccessDropdownOpen(false); }}
                          >
                            <i className="bi bi-share-fill" /> Shared
                          </li>
                        )}
                        {hasPrivate && (
                          <li
                            className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${accessFilter === 'private' ? ' vds-role-item--selected' : ''}`}
                            style={{ cursor: 'pointer', fontSize: '0.85rem' }}
                            onMouseDown={() => { setAccessFilter(accessFilter === 'private' ? null : 'private'); setAccessDropdownOpen(false); }}
                          >
                            <i className="bi bi-lock-fill text-secondary" /> Private
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                </>
              )}

              {/* All Zones search + filters */}
              {mainTab === 'allZones' && (
                <>
                  <div ref={allSuggestionsRef} className="position-relative" style={{ width: 220, flexShrink: 1 }}>
                    <div className="vds-search-group input-group input-group-sm">
                      <span className="input-group-text border-0 bg-transparent pe-1">
                        <i className="bi bi-search text-muted" />
                      </span>
                      <input
                        type="text"
                        className="form-control border-0 ps-0 shadow-none bg-transparent"
                        placeholder="Search by name or email"
                        value={allZonesInput}
                        autoComplete="off"
                        onFocus={() => { if (allZonesInput.length > 0) setAllSuggestionsOpen(true); }}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAllZonesInput(val);
                          setAllSuggestionsOpen(val.length > 0);
                          if (val === '') {
                            setEmailFilter('');
                            setAllZonesQuery('');
                            allZones.resetPaging();
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { setAllSuggestionsOpen(false); handleAllZonesSearch(); }
                          if (e.key === 'Escape') setAllSuggestionsOpen(false);
                        }}
                      />
                    </div>
                    {allSuggestionsOpen && allSuggestions.length > 0 && !allZonesInput.includes('@') && (
                      <ul className="list-group position-absolute shadow" style={{ zIndex: 1060, top: 'calc(100% + 2px)', left: 0, minWidth: '100%', width: 'max-content', maxHeight: '260px', overflowY: 'auto', borderRadius: '0.55rem', border: '1px solid #d4dbe8' }}>
                        {allSuggestions.slice(0, 10).map((z) => (
                          <li
                            key={z.id}
                            className="list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item"
                            style={{ cursor: 'pointer', fontSize: '0.82rem' }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setAllZonesInput(z.name);
                              setEmailFilter(z.name);
                              setAllZonesQuery(z.name);
                              setAllSuggestionsOpen(false);
                              allZones.resetPaging();
                            }}
                          >
                            <i className="bi bi-diagram-3 text-muted" style={{ fontSize: '0.75rem', flexShrink: 0 }} />
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.name}</span>
                            {z.shared && <span className="badge vds-badge-shared" style={{ fontSize: '0.65rem', flexShrink: 0 }}>shared</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* By Admin Group toggle */}
                  <button
                    className={`btn btn-sm d-flex align-items-center gap-1 vds-btn-flat${allZonesByGroup ? ' vds-btn-flat--active' : ''}`}
                    onClick={() => { setAllZonesByGroup((v) => !v); allZones.resetPaging(); }}
                  >
                    <i className="bi bi-people" />
                    <span className="vds-btn-flat__label">By Admin Group</span>
                    {allZonesByGroup && <span className="vds-filter-chip--accent">On</span>}
                  </button>

                  {/* Hide PTR toggle */}
                  <button
                    className={`btn btn-sm d-flex align-items-center gap-1 vds-btn-flat${allZonesHidePtr ? ' vds-btn-flat--active' : ''}`}
                    onClick={() => { setAllZonesHidePtr((v) => !v); allZones.resetPaging(); }}
                  >
                    <i className="bi bi-arrow-left-right" />
                    <span className="vds-btn-flat__label">Hide PTR</span>
                    {allZonesHidePtr && <span className="vds-filter-chip--accent">On</span>}
                  </button>

                  {/* Status filter dropdown */}
                  <div ref={statusDropdownRef} className="position-relative">
                    <button
                      className="btn btn-sm d-flex align-items-center gap-1 vds-btn-flat"
                      onClick={() => setStatusDropdownOpen((o) => !o)}
                    >
                      <i className="bi bi-funnel" />
                      <span className="vds-btn-flat__label">Status</span>
                      {statusFilter && <span className="vds-filter-chip--accent">{statusFilterLabel[statusFilter] ?? statusFilter}</span>}
                      <i className={`bi bi-chevron-${statusDropdownOpen ? 'up' : 'down'} ms-1`} style={{ fontSize: '0.65rem', color: '#506080' }} />
                    </button>
                    {statusDropdownOpen && availableStatuses.length > 0 && (
                      <ul className="list-group position-absolute shadow" style={{ zIndex: 1050, top: 'calc(100% + 4px)', right: 0, minWidth: '145px', borderRadius: '0.55rem', overflow: 'hidden', border: '1px solid #d4dbe8' }}>
                        {availableStatuses.map((s) => (
                          <li
                            key={s}
                            className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${statusFilter === s ? ' vds-role-item--selected' : ''}`}
                            style={{ cursor: 'pointer', fontSize: '0.85rem' }}
                            onMouseDown={() => { setStatusFilter(statusFilter === s ? null : s); setStatusDropdownOpen(false); }}
                          >
                            <i className={`bi ${s === 'Active' ? 'bi-check-circle-fill text-success' : 'bi-x-circle text-secondary'}`} />
                            {statusFilterLabel[s] ?? s}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Access filter dropdown */}
                  <div ref={accessDropdownRef} className="position-relative">
                    <button
                      className="btn btn-sm d-flex align-items-center gap-1 vds-btn-flat"
                      onClick={() => setAccessDropdownOpen((o) => !o)}
                    >
                      <i className="bi bi-shield-lock" />
                      <span className="vds-btn-flat__label">Access</span>
                      {accessFilter && <span className="vds-filter-chip--accent">{accessFilter === 'shared' ? 'Shared' : 'Private'}</span>}
                      <i className={`bi bi-chevron-${accessDropdownOpen ? 'up' : 'down'} ms-1`} style={{ fontSize: '0.65rem', color: '#506080' }} />
                    </button>
                    {accessDropdownOpen && (hasShared || hasPrivate) && (
                      <ul className="list-group position-absolute shadow" style={{ zIndex: 1050, top: 'calc(100% + 4px)', right: 0, minWidth: '140px', borderRadius: '0.55rem', overflow: 'hidden', border: '1px solid #d4dbe8' }}>
                        {hasShared && (
                          <li
                            className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${accessFilter === 'shared' ? ' vds-role-item--selected' : ''}`}
                            style={{ cursor: 'pointer', fontSize: '0.85rem' }}
                            onMouseDown={() => { setAccessFilter(accessFilter === 'shared' ? null : 'shared'); setAccessDropdownOpen(false); }}
                          >
                            <i className="bi bi-share-fill" /> Shared
                          </li>
                        )}
                        {hasPrivate && (
                          <li
                            className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${accessFilter === 'private' ? ' vds-role-item--selected' : ''}`}
                            style={{ cursor: 'pointer', fontSize: '0.85rem' }}
                            onMouseDown={() => { setAccessFilter(accessFilter === 'private' ? null : 'private'); setAccessDropdownOpen(false); }}
                          >
                            <i className="bi bi-lock-fill text-secondary" /> Private
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                </>
              )}

              {/* Abandoned Zones search */}
              {mainTab === 'abandonedZones' && (
                <div className="vds-search-group input-group input-group-sm" style={{ width: 220, flexShrink: 1 }}>
                  <span className="input-group-text border-0 bg-transparent pe-1">
                    <i className="bi bi-search text-muted" />
                  </span>
                  <input
                    type="text"
                    className="form-control border-0 ps-0 shadow-none bg-transparent"
                    placeholder={abanByGroup ? 'Search by admin group name' : 'Search by zone name or email'}
                    value={abandonedInput}
                    autoComplete="off"
                    onChange={(e) => {
                      const val = e.target.value;
                      setAbandonedInput(val);
                      if (val === '') {
                        setAbandonedQuery('');
                        myAbandoned.resetPaging();
                        allAbandoned.resetPaging();
                      }
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleAbandonedSearch()}
                  />
                </div>
              )}

              {/* Abandoned Zones: inline filters after search */}
              {mainTab === 'abandonedZones' && (
                <>
                  {/* By Admin Group toggle */}
                  <button
                    className={`btn btn-sm d-flex align-items-center gap-1 vds-btn-flat${abanByGroup ? ' vds-btn-flat--active' : ''}`}
                    onClick={() => { setAbanByGroup((v) => !v); setAbandonedInput(''); }}
                  >
                    <i className="bi bi-people" />
                    <span className="vds-btn-flat__label">By Admin Group</span>
                    {abanByGroup && <span className="vds-filter-chip--accent">On</span>}
                  </button>

                  {/* Status filter dropdown */}
                  <div ref={abanStatusDropdownRef} className="position-relative">
                    <button
                      className="btn btn-sm d-flex align-items-center gap-1 vds-btn-flat"
                      onClick={() => setAbanStatusDropdownOpen((o) => !o)}
                    >
                      <i className="bi bi-funnel" />
                      <span className="vds-btn-flat__label">Status</span>
                      {abanStatusFilter && <span className="vds-filter-chip--accent">{abanStatusFilter}</span>}
                      <i className={`bi bi-chevron-${abanStatusDropdownOpen ? 'up' : 'down'} ms-1`} style={{ fontSize: '0.65rem', color: '#506080' }} />
                    </button>
                    {abanStatusDropdownOpen && abanStatuses.length > 0 && (
                      <ul className="list-group position-absolute shadow" style={{ zIndex: 1050, top: 'calc(100% + 4px)', right: 0, minWidth: '150px', borderRadius: '0.55rem', overflow: 'hidden', border: '1px solid #d4dbe8' }}>
                        {abanStatuses.map((s) => (
                          <li
                            key={s}
                            className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${abanStatusFilter === s ? ' vds-role-item--selected' : ''}`}
                            style={{ cursor: 'pointer', fontSize: '0.85rem' }}
                            onMouseDown={() => { setAbanStatusFilter(abanStatusFilter === s ? null : s); setAbanStatusDropdownOpen(false); }}
                          >
                            <i className={`bi ${s === 'Active' ? 'bi-check-circle-fill text-success' : 'bi-x-circle text-secondary'}`} />
                            {s}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Access filter dropdown */}
                  <div ref={abanAccessDropdownRef} className="position-relative">
                    <button
                      className="btn btn-sm d-flex align-items-center gap-1 vds-btn-flat"
                      onClick={() => setAbanAccessDropdownOpen((o) => !o)}
                    >
                      <i className="bi bi-shield-lock" />
                      <span className="vds-btn-flat__label">Access</span>
                      {abanAccessFilter && <span className="vds-filter-chip--accent">{abanAccessFilter === 'shared' ? 'Shared' : 'Private'}</span>}
                      <i className={`bi bi-chevron-${abanAccessDropdownOpen ? 'up' : 'down'} ms-1`} style={{ fontSize: '0.65rem', color: '#506080' }} />
                    </button>
                    {abanAccessDropdownOpen && (abanHasShared || abanHasPrivate) && (
                      <ul className="list-group position-absolute shadow" style={{ zIndex: 1050, top: 'calc(100% + 4px)', right: 0, minWidth: '140px', borderRadius: '0.55rem', overflow: 'hidden', border: '1px solid #d4dbe8' }}>
                        {abanHasShared && (
                          <li
                            className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${abanAccessFilter === 'shared' ? ' vds-role-item--selected' : ''}`}
                            style={{ cursor: 'pointer', fontSize: '0.85rem' }}
                            onMouseDown={() => { setAbanAccessFilter(abanAccessFilter === 'shared' ? null : 'shared'); setAbanAccessDropdownOpen(false); }}
                          >
                            <i className="bi bi-share-fill" /> Shared
                          </li>
                        )}
                        {abanHasPrivate && (
                          <li
                            className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${abanAccessFilter === 'private' ? ' vds-role-item--selected' : ''}`}
                            style={{ cursor: 'pointer', fontSize: '0.85rem' }}
                            onMouseDown={() => { setAbanAccessFilter(abanAccessFilter === 'private' ? null : 'private'); setAbanAccessDropdownOpen(false); }}
                          >
                            <i className="bi bi-lock-fill text-secondary" /> Private
                          </li>
                        )}
                      </ul>
                    )}
                  </div>

                  {/* Abandoned By filter dropdown */}
                  <div ref={abanByDropdownRef} className="position-relative">
                    <button
                      className="btn btn-sm d-flex align-items-center gap-1 vds-btn-flat"
                      onClick={() => setAbanByDropdownOpen((o) => !o)}
                    >
                      <i className="bi bi-person-x" />
                      <span className="vds-btn-flat__label">Abandoned By</span>
                      {abanByFilter && <span className="vds-filter-chip--accent" style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{abanByFilter}</span>}
                      <i className={`bi bi-chevron-${abanByDropdownOpen ? 'up' : 'down'} ms-1`} style={{ fontSize: '0.65rem', color: '#506080' }} />
                    </button>
                    {abanByDropdownOpen && abanByOptions.length > 0 && (
                      <ul className="list-group position-absolute shadow" style={{ zIndex: 1050, top: 'calc(100% + 4px)', right: 0, minWidth: '200px', maxHeight: '220px', overflowY: 'auto', borderRadius: '0.55rem', border: '1px solid #d4dbe8' }}>
                        {abanByOptions.map((u) => (
                          <li
                            key={u}
                            className={`list-group-item list-group-item-action py-2 px-3 d-flex align-items-center gap-2 vds-suggestion-item${abanByFilter === u ? ' vds-role-item--selected' : ''}`}
                            style={{ cursor: 'pointer', fontSize: '0.85rem' }}
                            onMouseDown={() => { setAbanByFilter(abanByFilter === u ? null : u); setAbanByDropdownOpen(false); }}
                          >
                            <i className="bi bi-person-circle text-muted" style={{ fontSize: '0.75rem' }} />
                            {u}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
              {/* TIME FILTER for My/All Zones */}
              {(mainTab === 'myZones' || mainTab === 'allZones') && (
                <TimeFilterDropdown
                  value={zoneTimeRange}
                  dateFrom={zoneDateFrom}
                  dateTo={zoneDateTo}
                  onChange={setZoneTimeRange}
                  onDateFromChange={setZoneDateFrom}
                  onDateToChange={setZoneDateTo}
                />
              )}
              {/* TIME FILTER for Abandoned Zones */}
              {mainTab === 'abandonedZones' && (
                <TimeFilterDropdown
                  value={abanTimeRange}
                  dateFrom={abanDateFrom}
                  dateTo={abanDateTo}
                  onChange={setAbanTimeRange}
                  onDateFromChange={setAbanDateFrom}
                  onDateToChange={setAbanDateTo}
                />
              )}
              <button
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

      {/* ── Active filter tags — My/All Zones ── */}
      {(mainTab === 'myZones' || mainTab === 'allZones') && (emailFilter || statusFilter || accessFilter || zoneTimeRange !== 'all') && (
        <div className="d-flex justify-content-end gap-2 mb-2 flex-wrap align-items-center px-1">
          {emailFilter && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className={byGroupActive ? 'bi bi-people' : 'bi bi-search'} />
              {byGroupActive ? 'Admin Group' : 'Search'}: {emailFilter}
              <button type="button" className="btn-close ms-1"
                style={{ fontSize: '0.5rem', filter: 'invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)' }}
                onClick={() => {
                  setEmailFilter('');
                  if (mainTab === 'myZones') { setMyZonesInput(''); setMyZonesQuery(''); myZones.resetPaging(); }
                  else { setAllZonesInput(''); setAllZonesQuery(''); allZones.resetPaging(); }
                }}
              />
            </span>
          )}
          {statusFilter && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className="bi bi-funnel" />
              Status: {statusFilterLabel[statusFilter]}
              <button type="button" className="btn-close ms-1"
                style={{ fontSize: '0.5rem', filter: 'invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)' }}
                onClick={() => setStatusFilter(null)}
              />
            </span>
          )}
          {accessFilter && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className="bi bi-shield-lock" />
              Access: {accessFilter === 'shared' ? 'Shared' : 'Private'}
              <button type="button" className="btn-close ms-1"
                style={{ fontSize: '0.5rem', filter: 'invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)' }}
                onClick={() => setAccessFilter(null)}
              />
            </span>
          )}
          {zoneTimeRange !== 'all' && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className="bi bi-calendar3" />
              Last Sync: {zoneTimeRange === '1d' ? 'Today' : zoneTimeRange === '7d' ? 'Last 7 days' : zoneTimeRange === '30d' ? 'Last 30 days' : zoneTimeRange === '90d' ? 'Last 90 days' : `${zoneDateFrom || '…'} – ${zoneDateTo || '…'}`}
              <button type="button" className="btn-close ms-1"
                style={{ fontSize: '0.5rem', filter: 'invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)' }}
                onClick={() => { setZoneTimeRange('all'); setZoneDateFrom(''); setZoneDateTo(''); }}
              />
            </span>
          )}
          <button type="button" className="btn btn-sm vds-btn-flat d-flex align-items-center gap-1"
            style={{ color: '#e53e3e', border: '1px solid rgba(229,62,62,0.3)', fontSize: '0.78rem' }}
            onClick={() => {
              setEmailFilter(''); setStatusFilter(null); setAccessFilter(null);
              setZoneTimeRange('all'); setZoneDateFrom(''); setZoneDateTo('');
              if (mainTab === 'myZones') { setMyZonesInput(''); setMyZonesQuery(''); myZones.resetPaging(); }
              else { setAllZonesInput(''); setAllZonesQuery(''); allZones.resetPaging(); }
            }}>
            <i className="bi bi-x-circle" />Clear All
          </button>
        </div>
      )}

      {/* ── Active filter tags — Abandoned Zones ── */}
      {mainTab === 'abandonedZones' && anyAbandonedFilterActive && (
        <div className="d-flex justify-content-end gap-2 mb-2 flex-wrap align-items-center px-1">
          {abandonedInput && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className={abanByGroup ? 'bi bi-people' : 'bi bi-search'} />
              {abanByGroup ? 'Admin Group' : 'Search'}: {abandonedInput}
              <button type="button" className="btn-close ms-1"
                style={{ fontSize: '0.5rem', filter: 'invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)' }}
                onClick={() => { setAbandonedInput(''); setAbandonedQuery(''); myAbandoned.resetPaging(); allAbandoned.resetPaging(); }}
              />
            </span>
          )}
          {abanByGroup && !abandonedInput && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className="bi bi-people" />By Admin Group
              <button type="button" className="btn-close ms-1"
                style={{ fontSize: '0.5rem', filter: 'invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)' }}
                onClick={() => setAbanByGroup(false)}
              />
            </span>
          )}
          {abanStatusFilter && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className="bi bi-funnel" />
              Status: {abanStatusFilter}
              <button type="button" className="btn-close ms-1"
                style={{ fontSize: '0.5rem', filter: 'invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)' }}
                onClick={() => setAbanStatusFilter(null)}
              />
            </span>
          )}
          {abanAccessFilter && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className="bi bi-shield-lock" />
              Access: {abanAccessFilter === 'shared' ? 'Shared' : 'Private'}
              <button type="button" className="btn-close ms-1"
                style={{ fontSize: '0.5rem', filter: 'invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)' }}
                onClick={() => setAbanAccessFilter(null)}
              />
            </span>
          )}
          {abanByFilter && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className="bi bi-person-x" />
              Abandoned By: {abanByFilter}
              <button type="button" className="btn-close ms-1"
                style={{ fontSize: '0.5rem', filter: 'invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)' }}
                onClick={() => setAbanByFilter(null)}
              />
            </span>
          )}
          {abanTimeRange !== 'all' && (
            <span className="vds-active-filter-tag d-flex align-items-center gap-1">
              <i className="bi bi-calendar3" />
              Abandoned: {abanTimeRange === '1d' ? 'Today' : abanTimeRange === '7d' ? 'Last 7 days' : abanTimeRange === '30d' ? 'Last 30 days' : abanTimeRange === '90d' ? 'Last 90 days' : `${abanDateFrom || '…'} – ${abanDateTo || '…'}`}
              <button type="button" className="btn-close ms-1"
                style={{ fontSize: '0.5rem', filter: 'invert(30%) sepia(80%) saturate(500%) hue-rotate(190deg)' }}
                onClick={() => { setAbanTimeRange('all'); setAbanDateFrom(''); setAbanDateTo(''); }}
              />
            </span>
          )}
          <button type="button" className="btn btn-sm vds-btn-flat d-flex align-items-center gap-1"
            style={{ color: '#e53e3e', border: '1px solid rgba(229,62,62,0.3)', fontSize: '0.78rem' }}
            onClick={() => {
              setAbandonedInput(''); setAbandonedQuery(''); setAbanByGroup(false);
              setAbanStatusFilter(null); setAbanAccessFilter(null); setAbanByFilter(null);
              setAbanTimeRange('all'); setAbanDateFrom(''); setAbanDateTo('');
              myAbandoned.resetPaging(); allAbandoned.resetPaging();
            }}>
            <i className="bi bi-x-circle" />Clear All
          </button>
        </div>
      )}

      {/* ── Insight cards + content (fades on tab switch) ── */}
      <div className={`vds-tab-content${tabFading ? ' vds-tab-content--fading' : ''}`}>

        {/* ── Insight cards ── */}
        {showCards && <div className="row g-2 mb-3 align-items-stretch">

          {/* ── Card 1: Total Zones ── */}
          <div className="col-6 col-md-3 d-flex">
            <div className="rounded-3 px-3 py-1 w-100 d-flex flex-column vds-insight-card vds-insight-card--blue">
              <div className="d-flex align-items-center gap-2 mb-1">
                <div className="rounded-2 vds-insight-icon vds-insight-icon--blue">
                  <i className="bi bi-globe2" />
                </div>
                <span className="vds-insight-label vds-insight-label--blue">
                  Total Zones
                  <span className="vds-card-ctx-chip vds-card-ctx-chip--blue ms-1">
                    {cardContextLabel}{cardFiltered ? ' ·' : ''}
                  </span>
                </span>
                <span className="vds-insight-value vds-insight-value--blue">
                  {cardLoading ? skeletonBlue : cardTotal}
                </span>
              </div>
              {/* In-view / platform ratio bar */}
              {!cardLoading && card1RefCount !== null && card1RefCount > 0 && (
                <div className="vds-insight-progress vds-insight-progress--blue mb-1" style={{ height: 4 }}>
                  <div
                    className="vds-insight-progress__fill vds-insight-progress__fill--blue"
                    style={{ width: `${Math.min(100, Math.round((cardTotal / card1RefCount) * 100))}%` }}
                  />
                </div>
              )}
              <div className="vds-insight-body vds-insight-body--blue">
                <div className="vds-insight-stat-label">{card1ViewLabel}</div>
                <div className="vds-insight-stat-label vds-insight-stat-label--right">{card1RefLabel}</div>
                <div className="vds-insight-stat-value vds-insight-stat-value--blue">
                  {cardLoading ? '…' : cardTotal}
                </div>
                <div className="vds-insight-stat-value vds-insight-stat-value--blue vds-insight-stat-value--right">
                  {card1RefCount ?? '…'}
                </div>
                <div className="vds-insight-footnote">
                  <i className="bi bi-diagram-3 me-1 vds-icon-blue-dim" />
                  {mainTab !== 'abandonedZones'
                    ? <>You own {insightMyCount ?? '…'} of {insightAllCount ?? '…'} platform zones</>
                    : <>{cardTotal} matching · {insightAbandonedCount ?? '…'} total abandoned</>}
                </div>
                {mainTab !== 'abandonedZones' && (
                  <div className="vds-insight-footnote" style={{ marginTop: 2 }}>
                    <i className="bi bi-trash3 me-1" style={{ color: '#e53e3e', opacity: 0.75 }} />
                    Abandoned:{' '}
                    <span style={{ color: '#e53e3e', fontWeight: 700 }}>{insightAbandonedCount ?? '…'}</span>
                    <span className="ms-1" style={{ fontWeight: 400 }}>zone{insightAbandonedCount !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Card 2: Zone Health ── */}
          <div className="col-6 col-md-3 d-flex">
            <div className="rounded-3 px-3 py-1 w-100 d-flex flex-column vds-insight-card vds-insight-card--teal">
              <div className="d-flex align-items-center gap-2 mb-1">
                <div className="rounded-2 vds-insight-icon vds-insight-icon--teal">
                  <i className="bi bi-check-circle-fill" />
                </div>
                <span className="vds-insight-label vds-insight-label--teal">
                  Zone Health
                  <span className="vds-card-ctx-chip vds-card-ctx-chip--teal ms-1">
                    {cardContextLabel}{cardFiltered ? ' ·' : ''}
                  </span>
                </span>
                <span className="vds-insight-value vds-insight-value--teal">
                  {cardLoading ? skeletonTeal : cardActiveCount}
                </span>
              </div>
              {/* Health progress bar */}
              {!cardLoading && cardTotal > 0 ? (
                <>
                  <div className="vds-insight-progress vds-insight-progress--teal" style={{ height: 6, marginBottom: 2 }}>
                    <div
                      className="vds-insight-progress__fill vds-insight-progress__fill--teal"
                      style={{ width: `${Math.round((cardActiveCount / cardTotal) * 100)}%` }}
                    />
                  </div>
                  <div style={{ fontSize: '0.67rem', color: '#0ca678', fontWeight: 700, marginBottom: 3 }}>
                    {Math.round((cardActiveCount / cardTotal) * 100)}%{' '}
                    <span style={{ fontWeight: 400, color: '#8099b8' }}>of {cardFiltered ? 'filtered' : cardContextLabel.toLowerCase()} zones are healthy</span>
                  </div>
                </>
              ) : (
                <div style={{ height: 4 }} />
              )}
              <div className="vds-insight-body vds-insight-body--teal">
                <div className="vds-insight-stat-label">Active</div>
                <div className="vds-insight-stat-label vds-insight-stat-label--right">Syncing</div>
                <div className="vds-insight-stat-value vds-insight-stat-value--teal">
                  {cardLoading ? '…' : cardActiveCount}
                </div>
                <div className="vds-insight-stat-value vds-insight-stat-value--teal vds-insight-stat-value--right">
                  {cardLoading ? '…' : cardSyncingCount}
                </div>
                <div className="vds-insight-footnote">
                  <i className="bi bi-activity me-1 vds-icon-teal-dim" />
                  {!cardLoading && cardIncidentCount > 0
                    ? <span style={{ color: '#e53e3e' }}>{cardIncidentCount} zone{cardIncidentCount === 1 ? '' : 's'} need attention</span>
                    : cardLoading ? 'Loading…' : 'All zones in view are healthy'}
                </div>
              </div>
            </div>
          </div>

          {/* ── Card 3: Shared & Private ── */}
          <div className="col-6 col-md-3 d-flex">
            <div className="rounded-3 px-3 py-1 w-100 d-flex flex-column vds-insight-card vds-insight-card--purple">
              <div className="d-flex align-items-center gap-2 mb-1">
                <div className="rounded-2 vds-insight-icon vds-insight-icon--purple">
                  <i className="bi bi-shield-lock-fill" />
                </div>
                <span className="vds-insight-label vds-insight-label--purple">
                  Access Split
                  <span className="vds-card-ctx-chip vds-card-ctx-chip--purple ms-1">
                    {cardContextLabel}{cardFiltered ? ' ·' : ''}
                  </span>
                </span>
                <span className="vds-insight-value vds-insight-value--purple">
                  {cardLoading ? skeletonPurple : cardTotal}
                </span>
              </div>
              {/* Shared / Private ratio bar */}
              {!cardLoading && cardTotal > 0 && (
                <div className="vds-insight-access-bar mb-1">
                  <div
                    className="vds-insight-access-bar__shared"
                    style={{ width: `${Math.round((cardSharedCount / cardTotal) * 100)}%` }}
                  />
                  <div className="vds-insight-access-bar__private" />
                </div>
              )}
              <div className="vds-insight-body vds-insight-body--purple">
                <div className="vds-insight-stat-label"><i className="bi bi-share-fill me-1" style={{ fontSize: '0.6rem' }} />Shared</div>
                <div className="vds-insight-stat-label vds-insight-stat-label--right"><i className="bi bi-lock-fill me-1" style={{ fontSize: '0.6rem' }} />Private</div>
                <div className="vds-insight-stat-value vds-insight-stat-value--purple">
                  {cardLoading ? '…' : cardSharedCount}
                </div>
                <div className="vds-insight-stat-value vds-insight-stat-value--purple vds-insight-stat-value--right">
                  {cardLoading ? '…' : cardTotal - cardSharedCount}
                </div>
                <div className="vds-insight-footnote">
                  <i className="bi bi-arrow-left-right me-1 vds-icon-purple-dim" />
                  PTR reverse zones: {cardLoading ? '…' : cardPtrCount}
                </div>
              </div>
            </div>
          </div>

          {/* ── Card 4: Zone Lifecycle ── */}
          <div className="col-6 col-md-3 d-flex">
            <div className="rounded-3 px-3 py-1 w-100 d-flex flex-column vds-insight-card vds-insight-card--amber">
              <div className="d-flex align-items-center gap-2 mb-1">
                <div className="rounded-2 vds-insight-icon vds-insight-icon--amber">
                  <i className="bi bi-clock-history" />
                </div>
                <span className="vds-insight-label vds-insight-label--amber">
                  Zone Lifecycle
                  <span className="vds-card-ctx-chip vds-card-ctx-chip--amber ms-1">
                    {cardContextLabel}{cardFiltered ? ' ·' : ''}
                  </span>
                </span>
              </div>
              {/* Summary strip */}
              <div className="vds-lifecycle-newest">
                <span className="vds-lifecycle-newest__age">
                  {cardLoading
                    ? 'Loading…'
                    : cardTotal > 0
                      ? `${cardTotal} zone${cardTotal === 1 ? '' : 's'} · ${cardActiveCount} active`
                      : 'No zones in view'}
                </span>
                <span className="vds-lifecycle-newest__meta">
                  {!cardLoading && cardOldestAgeDays !== null
                    ? `Running for ${fmtAge(cardOldestAgeDays)} · ${cardNewThisMonth} added in last 30d`
                    : cardLoading ? '' : 'No zones yet'}
                </span>
              </div>
              {/* Lifecycle stats grid */}
              <div className="vds-lifecycle-grid">
                <div className="vds-lifecycle-tile">
                  <span
                    className="vds-lifecycle-tile__num"
                    style={!cardLoading && cardNeverSynced > 0 ? { color: '#e53e3e' } : undefined}
                  >
                    {cardLoading ? skeletonAmber : cardNeverSynced}
                  </span>
                  <span className="vds-lifecycle-tile__label">Never synced</span>
                </div>
                <div className="vds-lifecycle-tile">
                  <span className="vds-lifecycle-tile__num" style={{ color: '#0ca678' }}>
                    {cardLoading ? skeletonAmber : cardRecentlySynced}
                  </span>
                  <span className="vds-lifecycle-tile__label">Synced ≤7d</span>
                </div>
                <div className="vds-lifecycle-tile">
                  <span className="vds-lifecycle-tile__num" style={{ color: '#6f42c1' }}>
                    {cardLoading ? skeletonAmber : cardNewThisMonth}
                  </span>
                  <span className="vds-lifecycle-tile__label">New in 30d</span>
                </div>
                <div className="vds-lifecycle-tile">
                  <span className="vds-lifecycle-tile__num">
                    {cardLoading
                      ? skeletonAmber
                      : cardOldestAgeDays !== null ? fmtAge(cardOldestAgeDays) : '—'}
                  </span>
                  <span className="vds-lifecycle-tile__label">Oldest zone</span>
                </div>
              </div>
            </div>
          </div>

        </div>}

        {/* ── My Zones content ── */}
        {mainTab === 'myZones' && (
          isLoadingCurrent ? <LoadingSpinner /> : (
            <>
              {!anyFilterActive && (myZones.nextPageEnabled || myZones.prevPageEnabled) && (
                <div className="mb-2">
                  <Pagination
                    onPrev={myZones.prevPage}
                    onNext={myZones.nextPage}
                    prevEnabled={myZones.prevPageEnabled}
                    nextEnabled={myZones.nextPageEnabled}
                    panelTitle={myZones.getPanelTitle()}
                  />
                </div>
              )}
              <ZonesTable
                zones={renderedZones}
                showAllZones={false}
              />
              {!anyFilterActive && (myZones.nextPageEnabled || myZones.prevPageEnabled) && (
                <div className="mt-2">
                  <Pagination
                    onPrev={myZones.prevPage}
                    onNext={myZones.nextPage}
                    prevEnabled={myZones.prevPageEnabled}
                    nextEnabled={myZones.nextPageEnabled}
                    panelTitle={myZones.getPanelTitle()}
                  />
                </div>
              )}
            </>
          )
        )}

        {/* ── All Zones content ── */}
        {mainTab === 'allZones' && (
          isLoadingCurrent ? <LoadingSpinner /> : (
            <>
              {!anyFilterActive && (allZones.nextPageEnabled || allZones.prevPageEnabled) && (
                <div className="mb-2">
                  <Pagination
                    onPrev={allZones.prevPage}
                    onNext={allZones.nextPage}
                    prevEnabled={allZones.prevPageEnabled}
                    nextEnabled={allZones.nextPageEnabled}
                    panelTitle={allZones.getPanelTitle()}
                  />
                </div>
              )}
              <ZonesTable
                zones={renderedZones}
                showAllZones
              />
              {!anyFilterActive && (allZones.nextPageEnabled || allZones.prevPageEnabled) && (
                <div className="mt-2">
                  <Pagination
                    onPrev={allZones.prevPage}
                    onNext={allZones.nextPage}
                    prevEnabled={allZones.prevPageEnabled}
                    nextEnabled={allZones.nextPageEnabled}
                    panelTitle={allZones.getPanelTitle()}
                  />
                </div>
              )}
            </>
          )
        )}

        {/* ── Abandoned Zones content ── */}
        {mainTab === 'abandonedZones' && (
          <>
            {/* Sub-tab toggle — only for super / support users */}
            {canSeeAllAbandoned && (
              <div className="card mb-2 vds-toolbar-card">
                <div className="card-body py-2 px-3">
                  <div className="vds-pill-toggle">
                    <button
                      type="button"
                      className={`vds-pill-toggle__btn${abandonedSubTab === 'myAbandoned' ? ' vds-pill-toggle__btn--active' : ''}`}
                      onClick={() => handleAbandonedSubTabSwitch('myAbandoned')}
                    >
                      <i className="bi bi-person-check" />My Zones
                    </button>
                    <button
                      type="button"
                      className={`vds-pill-toggle__btn${abandonedSubTab === 'allAbandoned' ? ' vds-pill-toggle__btn--active' : ''}`}
                      onClick={() => handleAbandonedSubTabSwitch('allAbandoned')}
                    >
                      <i className="bi bi-globe" />All Zones
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isLoadingCurrent ? <LoadingSpinner /> : (
              <>
                {!anyAbandonedFilterActive && (activeAbandonedHook.nextPageEnabled || activeAbandonedHook.prevPageEnabled) && (
                  <div className="mb-2">
                    <Pagination
                      onPrev={activeAbandonedHook.prevPage}
                      onNext={activeAbandonedHook.nextPage}
                      prevEnabled={activeAbandonedHook.prevPageEnabled}
                      nextEnabled={activeAbandonedHook.nextPageEnabled}
                      panelTitle={activeAbandonedHook.getPanelTitle()}
                    />
                  </div>
                )}
                <AbandonedZonesTable zones={displayedAbandonedZones} />
                {!anyAbandonedFilterActive && (activeAbandonedHook.nextPageEnabled || activeAbandonedHook.prevPageEnabled) && (
                  <div className="mt-2">
                    <Pagination
                      onPrev={activeAbandonedHook.prevPage}
                      onNext={activeAbandonedHook.nextPage}
                      prevEnabled={activeAbandonedHook.prevPageEnabled}
                      nextEnabled={activeAbandonedHook.nextPageEnabled}
                      panelTitle={activeAbandonedHook.getPanelTitle()}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>{/* end vds-tab-content */}

    </div>
  );
}
