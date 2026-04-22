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

import api, { urlBuilder } from "./api";
import type {
  DnsChange,
  DnsChangeListResponse,
  CreateDnsChangeRequest,
} from "../types/dnsChange";

const BASE = "/zones/batchrecordchanges";

export const dnsChangeService = {
  getBatchChange(id: string) {
    return api.get<DnsChange>(`${BASE}/${id}`);
  },

  createBatchChange(data: CreateDnsChangeRequest, allowManualReview?: boolean) {
    const url = urlBuilder(BASE, {
      allowManualReview: allowManualReview,
    });
    return api.post<DnsChange>(url, data);
  },

  getBatchChanges(
    maxItems?: number,
    startFrom?: number,
    ignoreAccess?: boolean,
    approvalStatus?: string,
    userName?: string,
    dateTimeRangeStart?: string,
    dateTimeRangeEnd?: string,
  ) {
    const params = {
      maxItems,
      startFrom,
      ignoreAccess,
      approvalStatus: approvalStatus || undefined,
      userName: userName || undefined,
      dateTimeRangeStart: dateTimeRangeStart || undefined,
      dateTimeRangeEnd: dateTimeRangeEnd || undefined,
    };
    return api.get<DnsChangeListResponse>(urlBuilder(BASE, params));
  },

  cancelBatchChange(id: string) {
    return api.post(`${BASE}/${id}/cancel`, {});
  },

  approveBatchChange(id: string, reviewComment?: string) {
    const data = reviewComment ? { reviewComment } : {};
    return api.post(`${BASE}/${id}/approve`, data);
  },

  rejectBatchChange(id: string, reviewComment?: string) {
    const data = reviewComment ? { reviewComment } : {};
    return api.post(`${BASE}/${id}/reject`, data);
  },

  /** Generate and download a CSV of the batch change's individual changes */
  exportToCsv(change: import("../types/dnsChange").DnsChange): void {
    const headers = [
      "Change Type",
      "Input Name",
      "Recordset Name",
      "Zone Name",
      "Record Type",
      "Record Data",
      "TTL",
      "Status",
      "Additional Info",
    ];

    const rows = change.changes.map((c) => {
      const rec = c.record ?? {};
      let recordData = "";
      switch (c.type) {
        case "A":
        case "AAAA":
        case "A+PTR":
        case "AAAA+PTR":
          recordData = String(rec.address ?? "");
          break;
        case "CNAME":
          recordData = String(rec.cname ?? "");
          break;
        case "PTR":
          recordData = String(rec.ptrdname ?? "");
          break;
        case "TXT":
        case "SPF":
          recordData = String(rec.text ?? "");
          break;
        case "MX":
          recordData = `pref:${rec.preference ?? ""} ex:${rec.exchange ?? ""}`;
          break;
        case "NS":
          recordData = String(rec.nsdname ?? "");
          break;
        case "SRV":
          recordData = `${rec.priority ?? ""} ${rec.weight ?? ""} ${rec.port ?? ""} ${rec.target ?? ""}`;
          break;
        case "NAPTR":
          recordData = `${rec.order ?? ""} ${rec.preference ?? ""} ${rec.flags ?? ""}`;
          break;
        default:
          recordData = JSON.stringify(rec);
      }
      const info = c.systemMessage ?? "";
      return [
        c.changeType,
        c.inputName,
        c.recordName ?? "",
        c.zoneName ?? "",
        c.type,
        recordData,
        c.ttl ?? "",
        c.status,
        info,
      ];
    });

    const csvContent = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dns-change-${change.id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
