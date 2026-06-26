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

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordForm } from "../../../components/records/RecordForm";
import { buildGroup, buildRecordSet } from "../../fixtures/testData";

function setup(overrides: Partial<Parameters<typeof RecordForm>[0]> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <RecordForm
      zoneId="zone-id-1"
      zoneName="example.com."
      onSubmit={onSubmit}
      onCancel={onCancel}
      mode="create"
      {...overrides}
    />,
  );
  return { onSubmit, onCancel };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("<RecordForm />", () => {
  it("renders name, type, ttl fields and the create action", () => {
    setup();
    expect(screen.getByPlaceholderText("e.g. www")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("300")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add Record/ }),
    ).toBeInTheDocument();
  });

  it("shows a validation error when the name is empty", async () => {
    const { onSubmit } = setup();
    await userEvent.click(screen.getByRole("button", { name: /Add Record/ }));
    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a valid A record", async () => {
    const { onSubmit } = setup();
    await userEvent.type(screen.getByPlaceholderText("e.g. www"), "www");
    await userEvent.type(
      screen.getByPlaceholderText("192.168.1.1"),
      "10.0.0.1",
    );
    await userEvent.click(screen.getByRole("button", { name: /Add Record/ }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      zoneId: "zone-id-1",
      name: "www",
      type: "A",
      ttl: 300,
      records: [{ address: "10.0.0.1" }],
    });
  });

  it("disables name and type fields in edit mode", () => {
    setup({
      mode: "edit",
      initialData: buildRecordSet({ name: "test", type: "A", ttl: 600 }),
    });
    expect(screen.getByDisplayValue("test")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Save Changes/ }),
    ).toBeInTheDocument();
  });

  it("renders MX-specific fields after switching type", async () => {
    setup();
    await userEvent.selectOptions(screen.getByRole("combobox"), "MX");
    expect(
      screen.getByPlaceholderText("mail.example.com."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add Another/ }),
    ).toBeInTheDocument();
  });

  it("renders a textarea for PTR records", async () => {
    setup({ isReverseZone: true });
    expect(screen.getByText("FQDN (one per line)")).toBeInTheDocument();
  });

  it("renders a textarea for NS records", async () => {
    setup();
    await userEvent.selectOptions(screen.getByRole("combobox"), "NS");
    expect(
      screen.getByText("NS Target FQDNs (one per line)"),
    ).toBeInTheDocument();
  });

  it("requires an owner group for shared zones", async () => {
    const { onSubmit } = setup({
      isSharedZone: true,
      allGroups: [buildGroup({ id: "g-1", name: "hobbits" })],
    });
    await userEvent.type(screen.getByPlaceholderText("e.g. www"), "www");
    await userEvent.type(
      screen.getByPlaceholderText("192.168.1.1"),
      "10.0.0.1",
    );
    await userEvent.click(screen.getByRole("button", { name: /Add Record/ }));

    expect(
      await screen.findByText("Owner Group is required for shared zones"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("invokes onCancel when Cancel is clicked", async () => {
    const { onCancel } = setup();
    await userEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("hides the Clear button in edit mode", () => {
    setup({
      mode: "edit",
      initialData: buildRecordSet({ name: "test", type: "A" }),
    });
    expect(
      screen.queryByRole("button", { name: /^Clear$/ }),
    ).not.toBeInTheDocument();
  });

  it("shows a loading label and disables submit while loading", () => {
    setup({ isLoading: true });
    const submit = screen.getByRole("button", { name: /Adding…/ });
    expect(submit).toBeDisabled();
  });

  describe("record-type data fields", () => {
    it("renders an IP Address field for AAAA records", async () => {
      setup();
      await userEvent.selectOptions(screen.getByRole("combobox"), "AAAA");
      expect(screen.getByText("IP Address")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("2001:db8::1")).toBeInTheDocument();
    });

    it("renders a CNAME Target field for CNAME records", async () => {
      setup();
      await userEvent.selectOptions(screen.getByRole("combobox"), "CNAME");
      expect(screen.getByText("CNAME Target FQDN")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("target.example.com."),
      ).toBeInTheDocument();
    });

    it("renders a Text field for TXT records", async () => {
      setup();
      await userEvent.selectOptions(screen.getByRole("combobox"), "TXT");
      expect(screen.getByText("Text")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("v=spf1 include:example.com ~all"),
      ).toBeInTheDocument();
    });

    it("renders priority, weight, port and target fields for SRV records", async () => {
      setup();
      await userEvent.selectOptions(screen.getByRole("combobox"), "SRV");
      expect(screen.getByText("Priority")).toBeInTheDocument();
      expect(screen.getByText("Weight")).toBeInTheDocument();
      expect(screen.getByText("Port")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("service.example.com."),
      ).toBeInTheDocument();
    });

    it("renders SOA fields for SOA records", () => {
      setup({
        mode: "edit",
        initialData: buildRecordSet({ name: "@", type: "SOA" }),
      });
      expect(screen.getByText("Primary NS (mname)")).toBeInTheDocument();
      expect(screen.getByText("Responsible (rname)")).toBeInTheDocument();
      expect(screen.getByText("Minimum TTL")).toBeInTheDocument();
    });

    it("renders flags, tag and value fields for CAA records", () => {
      setup({
        mode: "edit",
        initialData: buildRecordSet({ name: "@", type: "CAA" }),
      });
      expect(screen.getByText("Flags")).toBeInTheDocument();
      expect(screen.getByText("Tag")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("ca.example.com")).toBeInTheDocument();
    });

    it("renders algorithm, type and fingerprint fields for SSHFP records", async () => {
      setup();
      await userEvent.selectOptions(screen.getByRole("combobox"), "SSHFP");
      expect(screen.getByText("Algorithm")).toBeInTheDocument();
      expect(screen.getByText("FP Type")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("abc123...")).toBeInTheDocument();
    });

    it("renders key tag, algorithm, digest type and digest fields for DS records", async () => {
      setup();
      await userEvent.selectOptions(screen.getByRole("combobox"), "DS");
      expect(screen.getByText("Key Tag")).toBeInTheDocument();
      expect(screen.getByText("Digest Type")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("hex digest")).toBeInTheDocument();
    });

    it("renders order, preference and service fields for NAPTR records", async () => {
      setup();
      await userEvent.selectOptions(screen.getByRole("combobox"), "NAPTR");
      expect(screen.getByText("Order")).toBeInTheDocument();
      expect(screen.getByText("Preference")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("E2U+sip")).toBeInTheDocument();
    });
  });
});
