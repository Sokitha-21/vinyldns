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

import React, { useRef, useState, useEffect } from "react";
import {
  useForm,
  useFieldArray,
  useWatch,
  useFormContext,
  FormProvider,
} from "react-hook-form";
import type {
  CreateDnsChangeRequest,
  SingleChange,
} from "../../types/dnsChange";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecordData {
  // A / AAAA / A+PTR / AAAA+PTR
  address?: string;
  // CNAME
  cname?: string;
  // PTR
  ptrdname?: string;
  // TXT
  text?: string;
  // MX
  preference?: number;
  exchange?: string;
  // NS
  nsdname?: string;
  // SRV
  priority?: number;
  weight?: number;
  port?: number;
  target?: string;
  // NAPTR
  order?: number;
  flags?: string;
  service?: string;
  regexp?: string;
  replacement?: string;
}

type ChangeFormItem = Omit<
  SingleChange,
  | "id"
  | "status"
  | "recordName"
  | "zoneName"
  | "zoneId"
  | "recordSetId"
  | "errors"
  | "systemMessage"
> & { record?: RecordData };

interface DnsChangeFormData {
  comments: string;
  ownerGroupId: string;
  scheduledOption: "now" | "later";
  scheduledTime: string;
  changes: ChangeFormItem[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Default batch change limit. Matches VinylDNS server default. */
const BATCH_CHANGE_LIMIT = 1000;

// ── CSV helpers ───────────────────────────────────────────────────────────────

/** Decode a single CSV row using standard CSV quoting rules. */
function decodeCsvRow(row: string): string[] {
  const regex = /(,|\r?\n|\r|^)(?:"([^"]*(?:""[^"]*)*)"|([^,\r\n]*))/gi;
  const matches = [...row.matchAll(regex)];
  return matches.map((m) =>
    m[2] !== undefined ? m[2].replace(/""/g, '"') : (m[3] ?? ""),
  );
}

/** Parse a full CSV text into ChangeFormItem[]. Returns error string on failure. */
function parseCsvToChanges(
  csvText: string,
  limit: number,
): { changes: ChangeFormItem[]; error?: string } {
  const rows = csvText.split("\n");
  const header = rows[0]?.trim();
  if (header !== "Change Type,Record Type,Input Name,TTL,Record Data") {
    return {
      changes: [],
      error:
        "Import failed. CSV header must be: Change Type,Record Type,Input Name,TTL,Record Data",
    };
  }
  const dataRows = rows.slice(1).filter((r) => r.replace(/,+/g, "").trim());
  if (dataRows.length > limit) {
    return {
      changes: [],
      error: `Import failed. Cannot add more than ${limit} records per DNS change.`,
    };
  }
  const changes: ChangeFormItem[] = [];
  for (const row of dataRows) {
    const cols = decodeCsvRow(row);
    const changeTypeRaw = cols[0]?.trim() ?? "";
    const type = (cols[1]?.trim().toUpperCase() ??
      "A+PTR") as ChangeFormItem["type"];
    const inputName = cols[2]?.trim() ?? "";
    const ttlStr = cols[3]?.trim();
    const ttl = ttlStr ? parseInt(ttlStr, 10) : undefined;
    const recordData = cols[4]?.trim() ?? "";
    const changeType: "Add" | "DeleteRecordSet" = /delete/i.test(changeTypeRaw)
      ? "DeleteRecordSet"
      : "Add";

    let record: RecordData = {};
    if (["A", "AAAA", "A+PTR", "AAAA+PTR"].includes(type)) {
      record = { address: recordData };
    } else if (type === "CNAME") {
      record = { cname: recordData };
    } else if (type === "PTR") {
      record = { ptrdname: recordData };
    } else if (type === "TXT") {
      record = { text: recordData };
    } else if (type === "NS") {
      record = { nsdname: recordData };
    } else if (type === "MX") {
      const [pref, exchange] = recordData.split(" ");
      record = { preference: parseInt(pref, 10), exchange };
    } else if (type === "NAPTR") {
      const parts = recordData.split(" ");
      if (parts.length >= 6) {
        record = {
          order: parseInt(parts[0], 10),
          preference: parseInt(parts[1], 10),
          flags: parts[2],
          service: parts[3],
          regexp: parts[4],
          replacement: parts[5],
        };
      } else {
        record = {
          order: parseInt(parts[0], 10),
          preference: parseInt(parts[1], 10),
          flags: parts[2],
          service: parts[3],
          regexp: "",
          replacement: parts[4] ?? "",
        };
      }
    } else if (type === "SRV") {
      const [pri, wt, port, target] = recordData.split(" ");
      record = {
        priority: parseInt(pri, 10),
        weight: parseInt(wt, 10),
        port: parseInt(port, 10),
        target,
      };
    }
    changes.push({
      changeType,
      type,
      inputName,
      ttl,
      record: record as Record<string, unknown> & RecordData,
    });
  }
  return { changes };
}

const NAPTR_FLAGS = ["U", "S", "A", "P"] as const;

function RecordDataFields({
  index,
  recordType,
  isAdd,
}: {
  index: number;
  recordType: string;
  isAdd: boolean;
}) {
  const { register } = useFormContext<DnsChangeFormData>();
  const req = isAdd;

  const helpText = !isAdd && (
    <div className="form-text text-muted fst-italic">
      Record data is optional for delete.
    </div>
  );

  switch (recordType) {
    case "A":
    case "A+PTR":
      return (
        <div>
          <input
            className="form-control form-control-sm"
            placeholder="e.g. 1.1.1.1"
            {...register(`changes.${index}.record.address`, { required: req })}
          />
          {helpText}
        </div>
      );
    case "AAAA":
    case "AAAA+PTR":
      return (
        <div>
          <input
            className="form-control form-control-sm"
            placeholder="e.g. fd69:27cc:fe91::60"
            {...register(`changes.${index}.record.address`, { required: req })}
          />
          {helpText}
        </div>
      );
    case "CNAME":
      return (
        <div>
          <input
            className="form-control form-control-sm"
            placeholder="e.g. target.example.com."
            disabled={!isAdd}
            {...register(`changes.${index}.record.cname`, { required: req })}
          />
        </div>
      );
    case "PTR":
      return (
        <div>
          <input
            className="form-control form-control-sm"
            placeholder="e.g. test.example.com."
            {...register(`changes.${index}.record.ptrdname`, { required: req })}
          />
          {helpText}
        </div>
      );
    case "TXT":
      return (
        <div>
          <textarea
            className="form-control form-control-sm"
            rows={2}
            placeholder="e.g. attr=val"
            {...register(`changes.${index}.record.text`, { required: req })}
          />
          {helpText}
        </div>
      );
    case "MX":
      return (
        <div className="d-flex gap-2 flex-wrap">
          <div style={{ minWidth: 110 }}>
            <label className="form-label small mb-1">Preference</label>
            <input
              type="number"
              className="form-control form-control-sm"
              placeholder="e.g. 1"
              min={0}
              max={65535}
              {...register(`changes.${index}.record.preference`, {
                required: req,
                valueAsNumber: true,
                min: 0,
                max: 65535,
              })}
            />
          </div>
          <div style={{ minWidth: 200 }}>
            <label className="form-label small mb-1">Exchange</label>
            <input
              className="form-control form-control-sm"
              placeholder="e.g. mail.example.com."
              {...register(`changes.${index}.record.exchange`, {
                required: req,
              })}
            />
          </div>
          {helpText && <div className="w-100 mb-0">{helpText}</div>}
        </div>
      );
    case "NS":
      return (
        <div>
          <input
            className="form-control form-control-sm"
            placeholder="e.g. ns1.example.com."
            {...register(`changes.${index}.record.nsdname`, { required: req })}
          />
          {helpText}
        </div>
      );
    case "SRV":
      return (
        <div className="d-flex gap-2 flex-wrap">
          <div style={{ minWidth: 85 }}>
            <label className="form-label small mb-1">Priority</label>
            <input
              type="number"
              className="form-control form-control-sm"
              placeholder="0"
              min={0}
              max={65535}
              {...register(`changes.${index}.record.priority`, {
                required: req,
                valueAsNumber: true,
              })}
            />
          </div>
          <div style={{ minWidth: 85 }}>
            <label className="form-label small mb-1">Weight</label>
            <input
              type="number"
              className="form-control form-control-sm"
              placeholder="0"
              min={0}
              max={65535}
              {...register(`changes.${index}.record.weight`, {
                required: req,
                valueAsNumber: true,
              })}
            />
          </div>
          <div style={{ minWidth: 85 }}>
            <label className="form-label small mb-1">Port</label>
            <input
              type="number"
              className="form-control form-control-sm"
              placeholder="8080"
              min={0}
              max={65535}
              {...register(`changes.${index}.record.port`, {
                required: req,
                valueAsNumber: true,
              })}
            />
          </div>
          <div style={{ minWidth: 180 }}>
            <label className="form-label small mb-1">Target</label>
            <input
              className="form-control form-control-sm"
              placeholder="e.g. target.example.com."
              {...register(`changes.${index}.record.target`, { required: req })}
            />
          </div>
          {helpText && <div className="w-100 mb-0">{helpText}</div>}
        </div>
      );
    case "NAPTR":
      return (
        <div className="d-flex gap-2 flex-wrap">
          <div style={{ minWidth: 85 }}>
            <label className="form-label small mb-1">Order</label>
            <input
              type="number"
              className="form-control form-control-sm"
              placeholder="1"
              min={0}
              max={65535}
              {...register(`changes.${index}.record.order`, {
                required: req,
                valueAsNumber: true,
              })}
            />
          </div>
          <div style={{ minWidth: 85 }}>
            <label className="form-label small mb-1">Preference</label>
            <input
              type="number"
              className="form-control form-control-sm"
              placeholder="1"
              min={0}
              max={65535}
              {...register(`changes.${index}.record.preference`, {
                required: req,
                valueAsNumber: true,
              })}
            />
          </div>
          <div style={{ minWidth: 80 }}>
            <label className="form-label small mb-1">Flags</label>
            <select
              className="form-select form-select-sm"
              {...register(`changes.${index}.record.flags`, { required: req })}
            >
              <option value="">--</option>
              {NAPTR_FLAGS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div style={{ minWidth: 130 }}>
            <label className="form-label small mb-1">Service</label>
            <input
              className="form-control form-control-sm"
              placeholder="e.g. SIP+D2U"
              {...register(`changes.${index}.record.service`, {
                required: req,
              })}
            />
          </div>
          <div style={{ minWidth: 130 }}>
            <label className="form-label small mb-1">Regexp</label>
            <input
              className="form-control form-control-sm"
              placeholder="optional"
              {...register(`changes.${index}.record.regexp`)}
            />
          </div>
          <div style={{ minWidth: 130 }}>
            <label className="form-label small mb-1">Replacement</label>
            <input
              className="form-control form-control-sm"
              placeholder="e.g. ."
              {...register(`changes.${index}.record.replacement`, {
                required: req,
              })}
            />
          </div>
          {helpText && <div className="w-100 mb-0">{helpText}</div>}
        </div>
      );
    default:
      return <span className="text-muted small fst-italic">—</span>;
  }
}

// ── Single change row ─────────────────────────────────────────────────────────

const RECORD_TYPES = [
  "A+PTR",
  "AAAA+PTR",
  "A",
  "AAAA",
  "CNAME",
  "PTR",
  "TXT",
  "MX",
  "NS",
  "SRV",
  "NAPTR",
] as const;

function ChangeRow({
  index,
  remove,
  serverErrors,
}: {
  index: number;
  remove: (i: number) => void;
  serverErrors?: string[];
}) {
  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = useFormContext<DnsChangeFormData>();
  const changeType = useWatch({ control, name: `changes.${index}.changeType` });
  const recordType = useWatch({ control, name: `changes.${index}.type` });
  const [isDark, setIsDark] = useState<boolean>(
    () => document.documentElement.getAttribute("data-vds-theme") === "dark",
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(
        document.documentElement.getAttribute("data-vds-theme") === "dark",
      );
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-vds-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const isAdd = changeType === "Add";
  const isPtr = recordType === "PTR";
  const hasErrors = serverErrors && serverErrors.length > 0;

  const { onChange: onTypeChange, ...restTypeRegister } = register(
    `changes.${index}.type`,
  );

  return (
    <div
      style={{
        background: hasErrors
          ? isDark
            ? "#1e0a0a"
            : "#fff5f5"
          : isDark
            ? "#1e293b"
            : "#fff",
        border: `1px solid ${
          hasErrors
            ? isDark
              ? "#4a1515"
              : "#f5c2c7"
            : isDark
              ? "#2d4163"
              : "#e8ecf0"
        }`,
        borderRadius: "0.6rem",
        marginBottom: "0.75rem",
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,.04)",
      }}
    >
      {/* Row header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.45rem 0.85rem",
          background: hasErrors
            ? isDark
              ? "#2a0a0a"
              : "#fce8e8"
            : isDark
              ? "#162032"
              : "#f4f7fb",
          borderBottom: `1px solid ${
            hasErrors
              ? isDark
                ? "#4a1515"
                : "#f5c2c7"
              : isDark
                ? "#2d4163"
                : "#e8ecf0"
          }`,
        }}
      >
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            color: hasErrors ? "#b02a37" : isDark ? "#94a3b8" : "#5a6a85",
            letterSpacing: "0.03em",
            textTransform: "uppercase",
          }}
        >
          <i
            className={`bi ${hasErrors ? "bi-exclamation-circle" : "bi-list-check"} me-1`}
          />
          Change #{index + 1}
        </span>
        <button
          type="button"
          onClick={() => remove(index)}
          title="Remove row"
          style={{
            background: "transparent",
            border: "none",
            color: "#9aacbe",
            cursor: "pointer",
            padding: "0 4px",
            fontSize: "0.85rem",
            lineHeight: 1,
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#dc3545")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#9aacbe")}
        >
          <i className="bi bi-x-circle-fill" />
        </button>
      </div>

      {/* Fields */}
      <div style={{ padding: "0.85rem" }}>
        <div className="row g-3">
          {/* Change Type */}
          <div className="col-12 col-sm-6 col-md-3">
            <label
              className="form-label"
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: "#4a5568",
                marginBottom: "0.3rem",
              }}
            >
              Change Type
            </label>
            <select
              className="form-select form-select-sm"
              style={{
                borderColor: "#dde3ec",
                boxShadow: "none",
                borderRadius: "0.45rem",
              }}
              {...register(`changes.${index}.changeType`)}
            >
              <option value="Add">Add</option>
              <option value="DeleteRecordSet">Delete Record Set</option>
            </select>
          </div>

          {/* Record Type */}
          <div className="col-12 col-sm-6 col-md-3">
            <label
              className="form-label"
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: "#4a5568",
                marginBottom: "0.3rem",
              }}
            >
              Record Type
            </label>
            <select
              className="form-select form-select-sm"
              style={{
                borderColor: "#dde3ec",
                boxShadow: "none",
                borderRadius: "0.45rem",
              }}
              {...restTypeRegister}
              onChange={(e) => {
                setValue(`changes.${index}.record`, {});
                void onTypeChange(e);
              }}
            >
              {RECORD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Input Name */}
          <div className="col-12 col-sm-8 col-md-4">
            <label
              className="form-label"
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: "#4a5568",
                marginBottom: "0.3rem",
              }}
            >
              {isPtr ? "Input Name (IP Address)" : "Input Name (FQDN)"}
            </label>
            <input
              className="form-control form-control-sm"
              placeholder={
                isPtr ? "e.g. 192.0.2.193" : "e.g. host.example.com."
              }
              style={{
                borderColor: "#dde3ec",
                boxShadow: "none",
                borderRadius: "0.45rem",
              }}
              {...register(`changes.${index}.inputName`, { required: true })}
            />
            {errors?.changes?.[index]?.inputName && (
              <div
                style={{ fontSize: "0.75rem", color: "#b02a37", marginTop: 2 }}
              >
                <i className="bi bi-exclamation-circle me-1" />
                Input name is required!
              </div>
            )}
          </div>

          {/* TTL */}
          <div className="col-12 col-sm-4 col-md-2">
            <label
              className="form-label"
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                color: "#4a5568",
                marginBottom: "0.3rem",
              }}
            >
              TTL{" "}
              {!isAdd && (
                <span
                  style={{
                    fontWeight: 400,
                    color: "#9aacbe",
                    fontSize: "0.72rem",
                  }}
                >
                  (N/A)
                </span>
              )}
            </label>
            <input
              type="number"
              className="form-control form-control-sm"
              placeholder="300"
              disabled={!isAdd}
              min={30}
              max={2147483647}
              style={{
                borderColor: "#dde3ec",
                boxShadow: "none",
                borderRadius: "0.45rem",
                background: !isAdd ? "#f8fafc" : undefined,
              }}
              {...register(`changes.${index}.ttl`, { valueAsNumber: true })}
            />
          </div>
        </div>

        {/* Record Data */}
        <div className="mt-3">
          <label
            className="form-label"
            style={{
              fontSize: "0.78rem",
              fontWeight: 600,
              color: "#4a5568",
              marginBottom: "0.3rem",
            }}
          >
            Record Data
            {!isAdd && (
              <span
                style={{
                  fontWeight: 400,
                  color: "#9aacbe",
                  fontSize: "0.72rem",
                  marginLeft: 4,
                }}
              >
                (optional for delete)
              </span>
            )}
          </label>
          <RecordDataFields
            index={index}
            recordType={recordType}
            isAdd={isAdd}
          />
        </div>

        {/* Per-row server errors */}
        {hasErrors && (
          <div className="mt-2">
            {serverErrors!.map((e, i) => (
              <div
                key={i}
                style={{
                  fontSize: "0.78rem",
                  color: "#b02a37",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <i className="bi bi-exclamation-circle-fill" />
                {e}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

// ── Request Date/Time field ──────────────────────────────────────────────────

function ScheduledTimeField({
  register,
  watch,
}: {
  register: ReturnType<typeof useForm<DnsChangeFormData>>["register"];
  watch: ReturnType<typeof useForm<DnsChangeFormData>>["watch"];
}) {
  const scheduledOption = watch("scheduledOption");
  const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="col-12 col-md-4">
      <label
        className="form-label"
        style={{ fontSize: "0.8rem", fontWeight: 600, color: "#4a5568" }}
      >
        Request Date/Time
      </label>
      <div className="d-flex gap-3 mb-1">
        <div className="form-check">
          <input
            type="radio"
            className="form-check-input"
            id="scheduleNow"
            value="now"
            {...register("scheduledOption")}
          />
          <label className="form-check-label small" htmlFor="scheduleNow">
            Now
          </label>
        </div>
        <div className="form-check">
          <input
            type="radio"
            className="form-check-input"
            id="scheduleLater"
            value="later"
            {...register("scheduledOption")}
          />
          <label className="form-check-label small" htmlFor="scheduleLater">
            Later
          </label>
        </div>
      </div>
      {scheduledOption === "later" && (
        <div className="d-flex align-items-center gap-1">
          <input
            type="datetime-local"
            className="form-control form-control-sm"
            style={{
              borderColor: "#dde3ec",
              boxShadow: "none",
              borderRadius: "0.45rem",
            }}
            {...register("scheduledTime")}
          />
          <span className="text-muted small text-nowrap">{localTz}</span>
        </div>
      )}
    </div>
  );
}

interface DnsChangeFormProps {
  onSubmit: (data: CreateDnsChangeRequest, allowManualReview: boolean) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  /** Per-row server errors returned by a 400 API response */
  serverRowErrors?: string[][];
}

export function DnsChangeForm({
  onSubmit,
  onCancel,
  isSubmitting,
  serverRowErrors,
}: DnsChangeFormProps) {
  const [allowManualReview, setAllowManualReview] = useState(false);
  const [rowErrors, setRowErrors] = useState<string[][]>([]);
  const [csvAlert, setCsvAlert] = useState<{
    type: "success" | "danger";
    message: string;
  } | null>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);
  const [isDark, setIsDark] = useState<boolean>(
    () => document.documentElement.getAttribute("data-vds-theme") === "dark",
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(
        document.documentElement.getAttribute("data-vds-theme") === "dark",
      );
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-vds-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // Merge local + server errors
  const effectiveRowErrors = serverRowErrors ?? rowErrors;

  // Detect owner group error from per-row server errors
  const ownerGroupError = (serverRowErrors ?? [])
    .flat()
    .some((e) => e.includes("owner group ID must be specified for record"));

  const methods = useForm<DnsChangeFormData>({
    defaultValues: {
      comments: "",
      ownerGroupId: "",
      scheduledOption: "now",
      scheduledTime: "",
      changes: [
        {
          changeType: "Add",
          inputName: "",
          type: "A+PTR",
          ttl: undefined,
          record: {},
        },
      ],
    },
  });

  const { register, control, handleSubmit, watch } = methods;
  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: "changes",
  });

  /** Submit form directly after validation */
  const handleFormSubmit = (data: DnsChangeFormData) => {
    setRowErrors([]);

    // Expand A+PTR / AAAA+PTR into paired entries (mirrors portal formatData)
    const expandedChanges: ChangeFormItem[] = [];
    for (const entry of data.changes) {
      if (entry.type === "A+PTR" || entry.type === "AAAA+PTR") {
        const baseType = entry.type === "A+PTR" ? "A" : "AAAA";
        expandedChanges.push({ ...entry, type: baseType });
        expandedChanges.push({
          changeType: entry.changeType,
          type: "PTR",
          ttl: entry.ttl,
          inputName: (entry.record as RecordData)?.address ?? "",
          record: { ptrdname: entry.inputName },
        });
      } else if (entry.type === "NAPTR") {
        const r = entry.record as RecordData;
        expandedChanges.push({
          ...entry,
          record: { ...r, regexp: r?.regexp ?? "" },
        });
      } else {
        expandedChanges.push(entry);
      }
    }

    // For DeleteRecordSet: drop record if all values are empty
    const finalChanges = expandedChanges.map((entry) => {
      if (entry.changeType === "DeleteRecordSet" && entry.record) {
        const allEmpty = Object.values(entry.record).every(
          (v) =>
            v === undefined ||
            v === null ||
            (typeof v === "string" && v.trim() === ""),
        );
        if (allEmpty) {
          const { record: _r, ...rest } = entry;
          return rest as ChangeFormItem;
        }
      }
      return entry;
    });

    onSubmit(
      {
        comments: data.comments || undefined,
        ownerGroupId: data.ownerGroupId || undefined,
        scheduledTime:
          data.scheduledOption === "later" && data.scheduledTime
            ? new Date(data.scheduledTime).toISOString()
            : undefined,
        changes: finalChanges,
      },
      allowManualReview,
    );
  };

  /** Handle CSV file import */
  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // reset input so same file can be re-imported
    if (csvFileRef.current) csvFileRef.current.value = "";
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      setCsvAlert({
        type: "danger",
        message: "Import failed. File should be of '.csv' type.",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const { changes, error } = parseCsvToChanges(text, BATCH_CHANGE_LIMIT);
      if (error) {
        setCsvAlert({ type: "danger", message: error });
      } else {
        replace(changes as Parameters<typeof replace>[0]);
        setCsvAlert({
          type: "success",
          message: `Successfully imported ${changes.length} DNS change${changes.length !== 1 ? "s" : ""}.`,
        });
      }
    };
    reader.readAsText(file);
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(handleFormSubmit)} noValidate>
        {/* ── Section: Metadata ─────────────────────────────────── */}
        <div
          style={{
            background: isDark ? "#162032" : "#f8fafd",
            border: `1px solid ${isDark ? "#2d4163" : "#e8ecf0"}`,
            borderRadius: "0.65rem",
            padding: "1.25rem 1.5rem",
            marginBottom: "1.5rem",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "1rem",
              justifyContent: "space-between",
            }}
            className="w-100"
          >
            <p
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                color: "#8496ad",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: "1rem",
              }}
            >
              <i className="bi bi-info-circle me-1" />
              Batch Details
            </p>
            {/* <div
              className="col-12 col-sm-5 col-md-2 d-flex align-items-end mt-md-0"
              style={{ paddingBottom: "0.15rem" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#fff",
                  border: "1px solid #dde3ec",
                  borderRadius: "0.45rem",
                  padding: "0.45rem 0.75rem",
                  cursor: "pointer",
                  userSelect: "none",
                  width: "100%",
                }}
                onClick={() => setAllowManualReview((v) => !v)}
              >
                <input
                  type="checkbox"
                  id="allowManualReview"
                  className="form-check-input mt-0"
                  checked={allowManualReview}
                  onChange={(e) => setAllowManualReview(e.target.checked)}
                  style={{ cursor: "pointer", flexShrink: 0 }}
                />
                <label
                  htmlFor="allowManualReview"
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    color: "#4a5568",
                    cursor: "pointer",
                    marginBottom: 0,
                  }}
                >
                  Manual Review
                </label>
              </div>
            </div> */}
          </div>

          <div className="row g-3 align-items-start">
            <div className="col-12 col-md-6">
              <label
                className="form-label"
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "#4a5568",
                }}
              >
                Description
                <span
                  style={{ fontWeight: 400, color: "#9aacbe", marginLeft: 4 }}
                >
                  (optional)
                </span>
              </label>
              <textarea
                className="form-control form-control-sm"
                rows={2}
                placeholder="Brief description of this batch change"
                style={{
                  borderColor: "#dde3ec",
                  boxShadow: "none",
                  borderRadius: "0.45rem",
                  resize: "none",
                }}
                {...register("comments")}
              />
            </div>
            <div className="col-12 col-sm-7 col-md-4">
              <label
                className="form-label"
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "#4a5568",
                }}
              >
                Owner Group ID
                <span
                  style={{ fontWeight: 400, color: "#9aacbe", marginLeft: 4 }}
                >
                  (optional)
                </span>
              </label>
              <input
                className={`form-control form-control-sm${ownerGroupError ? " is-invalid" : ""}`}
                placeholder="Required for shared zone records"
                style={{
                  borderColor: ownerGroupError ? "#dc3545" : "#dde3ec",
                  boxShadow: "none",
                  borderRadius: "0.45rem",
                }}
                {...register("ownerGroupId")}
              />
              {ownerGroupError && (
                <div
                  style={{
                    fontSize: "0.78rem",
                    color: "#b02a37",
                    marginTop: 4,
                  }}
                >
                  <i className="bi bi-exclamation-circle me-1" />
                  <strong>
                    Record Owner Group is required for records in shared zones.
                  </strong>
                </div>
              )}
              <div
                style={{ fontSize: "0.76rem", color: "#6b7a90", marginTop: 4 }}
              >
                Or you can{" "}
                <a href="/groups" style={{ color: "#1e5fa8" }}>
                  create a new group from the Groups page
                </a>
                .
              </div>
            </div>
            {/* Request Date/Time */}
            <ScheduledTimeField register={register} watch={watch} />
            {/* <div
              className="col-12 col-sm-5 col-md-2 d-flex align-items-end mt-md-0"
              style={{ paddingBottom: "0.15rem" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#fff",
                  border: "1px solid #dde3ec",
                  borderRadius: "0.45rem",
                  padding: "0.45rem 0.75rem",
                  cursor: "pointer",
                  userSelect: "none",
                  width: "100%",
                }}
                onClick={() => setAllowManualReview((v) => !v)}
              >
                <input
                  type="checkbox"
                  id="allowManualReview"
                  className="form-check-input mt-0"
                  checked={allowManualReview}
                  onChange={(e) => setAllowManualReview(e.target.checked)}
                  style={{ cursor: "pointer", flexShrink: 0 }}
                />
                <label
                  htmlFor="allowManualReview"
                  style={{
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    color: "#4a5568",
                    cursor: "pointer",
                    marginBottom: 0,
                  }}
                >
                  Manual Review
                </label>
              </div>
            </div> */}
          </div>
        </div>

        {/* ── Section: Changes ──────────────────────────────────── */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "0.85rem",
            }}
          >
            <div>
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  color: "#8496ad",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                <i className="bi bi-list-check me-1" />
                DNS Changes
              </span>
              {fields.length > 0 && (
                <span
                  style={{
                    marginLeft: 8,
                    background: "linear-gradient(90deg, #1e5fa8, #0d1b3e)",
                    color: "#fff",
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    borderRadius: "999px",
                    padding: "2px 8px",
                    verticalAlign: "middle",
                  }}
                >
                  {fields.length}
                </span>
              )}
            </div>
            <div className="d-flex align-items-center gap-2">
              {/* Add Change button */}
              <button
                type="button"
                className="btn btn-sm"
                disabled={fields.length >= BATCH_CHANGE_LIMIT}
                onClick={() =>
                  append({
                    changeType: "Add",
                    inputName: "",
                    type: "A+PTR",
                    ttl: undefined,
                    record: {},
                  })
                }
                style={{
                  background:
                    fields.length >= BATCH_CHANGE_LIMIT
                      ? "#c8d4e0"
                      : "linear-gradient(90deg, #1e5fa8, #0d1b3e)",
                  border: "none",
                  color: "#fff",
                  borderRadius: "0.45rem",
                  padding: "0.35rem 0.85rem",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  boxShadow:
                    fields.length >= BATCH_CHANGE_LIMIT
                      ? "none"
                      : "0 2px 8px rgba(30,95,168,.25)",
                  transition: "box-shadow 0.2s",
                  cursor:
                    fields.length >= BATCH_CHANGE_LIMIT
                      ? "not-allowed"
                      : "pointer",
                }}
                onMouseEnter={(e) => {
                  if (fields.length < BATCH_CHANGE_LIMIT)
                    e.currentTarget.style.boxShadow =
                      "0 3px 12px rgba(30,95,168,.35)";
                }}
                onMouseLeave={(e) => {
                  if (fields.length < BATCH_CHANGE_LIMIT)
                    e.currentTarget.style.boxShadow =
                      "0 2px 8px rgba(30,95,168,.25)";
                }}
              >
                <i className="bi bi-plus-lg me-1" />
                Add Change
              </button>

              {/* Import CSV */}
              <label
                htmlFor="batchChangeCsv"
                className="btn btn-sm mb-0"
                style={{
                  background: isDark ? "#1e293b" : "#fff",
                  border: `1px solid ${isDark ? "#2d4163" : "#d4dae3"}`,
                  color: isDark ? "#94a3b8" : "#4a5568",
                  borderRadius: "0.45rem",
                  padding: "0.33rem 0.8rem",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <i className="bi bi-upload me-1" />
                Import CSV
              </label>
              <input
                ref={csvFileRef}
                type="file"
                id="batchChangeCsv"
                accept=".csv"
                style={{ display: "none" }}
                onChange={handleCsvImport}
              />
            </div>
          </div>

          {/* CSV alert */}
          {csvAlert && (
            <div
              className={`alert alert-${csvAlert.type} alert-dismissible d-flex align-items-center gap-2 py-2 px-3`}
              style={{ fontSize: "0.82rem", marginBottom: "0.75rem" }}
            >
              <i
                className={`bi ${csvAlert.type === "success" ? "bi-check-circle" : "bi-exclamation-triangle"}`}
              />
              {csvAlert.message}
              <button
                type="button"
                className="btn-close ms-auto"
                style={{ fontSize: "0.7rem" }}
                onClick={() => setCsvAlert(null)}
              />
            </div>
          )}

          {/* Batch limit warning */}
          {fields.length >= BATCH_CHANGE_LIMIT && (
            <div
              className="alert alert-warning d-flex align-items-center gap-2 py-2 px-3"
              style={{ fontSize: "0.82rem", marginBottom: "0.75rem" }}
            >
              <i className="bi bi-exclamation-triangle-fill" />
              Limit reached. Cannot add more than {BATCH_CHANGE_LIMIT} records
              per DNS change.
            </div>
          )}

          {/* CSV documentation link */}
          <div style={{ marginBottom: "0.75rem" }}>
            <a
              href="https://www.vinyldns.io/portal/dns-changes#dns-change-csv-import"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: "0.78rem", color: "#1e5fa8" }}
            >
              <i className="bi bi-box-arrow-up-right me-1" />
              See documentation for sample CSV format
            </a>
          </div>

          {fields.length === 0 ? (
            <div
              style={{
                border: `2px dashed ${isDark ? "#2d4163" : "#dde3ec"}`,
                borderRadius: "0.65rem",
                padding: "2.5rem 1rem",
                textAlign: "center",
                color: isDark ? "#3d5a7a" : "#9aacbe",
                background: isDark ? "#1e293b" : "transparent",
              }}
            >
              <i
                className="bi bi-plus-circle"
                style={{
                  fontSize: "1.6rem",
                  display: "block",
                  marginBottom: "0.5rem",
                }}
              />
              <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                No changes added yet
              </span>
              <br />
              <span style={{ fontSize: "0.78rem" }}>
                Click <strong>Add Change</strong> to get started
              </span>
            </div>
          ) : (
            fields.map((field, index) => (
              <ChangeRow
                key={field.id}
                index={index}
                remove={remove}
                serverErrors={effectiveRowErrors[index]}
              />
            ))
          )}
        </div>

        {/* ── Footer Actions ────────────────────────────────────── */}
        <div
          style={{
            paddingTop: "1rem",
            borderTop: `1px solid ${isDark ? "#2d4163" : "#e8ecf0"}`,
          }}
        >
          <div className="d-flex align-items-center gap-2">
            <button
              type="submit"
              disabled={fields.length === 0 || isSubmitting}
              style={{
                background:
                  fields.length === 0 || isSubmitting
                    ? "#c8d4e0"
                    : "linear-gradient(90deg, #1e5fa8, #0d1b3e)",
                border: "none",
                color: "#fff",
                borderRadius: "0.45rem",
                padding: "0.45rem 1.4rem",
                fontSize: "0.85rem",
                fontWeight: 600,
                boxShadow:
                  fields.length === 0 || isSubmitting
                    ? "none"
                    : "0 2px 8px rgba(30,95,168,.25)",
                cursor:
                  fields.length === 0 || isSubmitting
                    ? "not-allowed"
                    : "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
              onMouseEnter={(e) => {
                if (fields.length > 0 && !isSubmitting)
                  e.currentTarget.style.boxShadow =
                    "0 3px 12px rgba(30,95,168,.35)";
              }}
              onMouseLeave={(e) => {
                if (fields.length > 0 && !isSubmitting)
                  e.currentTarget.style.boxShadow =
                    "0 2px 8px rgba(30,95,168,.25)";
              }}
            >
              {isSubmitting ? (
                <>
                  <span className="spinner-border spinner-border-sm" />
                  Submitting…
                </>
              ) : (
                <>
                  <i className="bi bi-send-fill" />
                  Submit Batch Change
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              style={{
                background: isDark ? "#1e293b" : "#fff",
                border: `1px solid ${isDark ? "#2d4163" : "#d4dae3"}`,
                color: isDark ? "#94a3b8" : "#5a6a85",
                borderRadius: "0.45rem",
                padding: "0.45rem 1.1rem",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: isSubmitting ? "not-allowed" : "pointer",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.borderColor = "#1e5fa8";
                  e.currentTarget.style.color = "#1e5fa8";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.borderColor = isDark
                    ? "#2d4163"
                    : "#d4dae3";
                  e.currentTarget.style.color = isDark ? "#94a3b8" : "#5a6a85";
                }
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </FormProvider>
  );
}
