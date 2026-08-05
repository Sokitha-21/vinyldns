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
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  TimeFilterDropdown,
  type TimeRange,
} from "../../../components/common/TimeFilterDropdown";

interface Overrides {
  value?: TimeRange;
  dateFrom?: string;
  dateTo?: string;
}

function setup(overrides: Overrides = {}) {
  const onChange = vi.fn();
  const onDateFromChange = vi.fn();
  const onDateToChange = vi.fn();
  render(
    <TimeFilterDropdown
      value={overrides.value ?? "all"}
      dateFrom={overrides.dateFrom ?? ""}
      dateTo={overrides.dateTo ?? ""}
      onChange={onChange}
      onDateFromChange={onDateFromChange}
      onDateToChange={onDateToChange}
    />,
  );
  return { onChange, onDateFromChange, onDateToChange };
}

describe("<TimeFilterDropdown />", () => {
  it("renders the default All Time label with no active chip", () => {
    setup();
    expect(
      screen.getByRole("button", { name: /All Time/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("shows the active chip when a non-default range is selected", () => {
    setup({ value: "7d" });
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders a date-range summary label for a custom range", () => {
    setup({ value: "custom", dateFrom: "2024-01-01", dateTo: "2024-02-01" });
    expect(
      screen.getByRole("button", { name: /2024-01-01 – 2024-02-01/ }),
    ).toBeInTheDocument();
  });

  it("opens the option panel when the trigger is clicked", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /All Time/ }));
    expect(
      screen.getByRole("button", { name: /Last 7 Days/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Last 30 Days/ }),
    ).toBeInTheDocument();
  });

  it("invokes onChange with the chosen range", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: /All Time/ }));
    await userEvent.click(screen.getByRole("button", { name: /Last 7 Days/ }));
    expect(onChange).toHaveBeenCalledWith("7d");
  });

  it("closes the panel after picking a non-custom range", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /All Time/ }));
    await userEvent.click(screen.getByRole("button", { name: /Last 30 Days/ }));
    expect(
      screen.queryByRole("button", { name: /Last 7 Days/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps the panel open when the custom range is chosen", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: /All Time/ }));
    await userEvent.click(screen.getByRole("button", { name: /Custom Range/ }));
    expect(onChange).toHaveBeenCalledWith("custom");
    expect(
      screen.getByRole("button", { name: /Last 7 Days/ }),
    ).toBeInTheDocument();
  });

  it("renders date inputs and forwards their changes for a custom range", async () => {
    const { onDateFromChange, onDateToChange } = setup({ value: "custom" });
    await userEvent.click(screen.getByRole("button", { name: /Custom Range/ }));

    const dateInputs =
      document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    expect(dateInputs).toHaveLength(2);

    await userEvent.type(dateInputs[0], "2024-03-01");
    await userEvent.type(dateInputs[1], "2024-03-15");

    expect(onDateFromChange).toHaveBeenCalled();
    expect(onDateToChange).toHaveBeenCalled();
  });

  it("closes the panel on an outside click", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /All Time/ }));
    expect(
      screen.getByRole("button", { name: /Last 7 Days/ }),
    ).toBeInTheDocument();

    await userEvent.click(document.body);
    expect(
      screen.queryByRole("button", { name: /Last 7 Days/ }),
    ).not.toBeInTheDocument();
  });
});
