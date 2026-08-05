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
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LoadingSpinner } from "../../../components/common/LoadingSpinner";

describe("<LoadingSpinner />", () => {
  it("renders the loader without a message by default", () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector(".vds-loader-ring")).toBeInTheDocument();
    expect(container.querySelector(".vds-loader-msg")).not.toBeInTheDocument();
  });

  it("renders the supplied message", () => {
    render(<LoadingSpinner message="Loading zones…" />);
    expect(screen.getByText("Loading zones…")).toBeInTheDocument();
  });

  it("omits the message element for an empty string", () => {
    const { container } = render(<LoadingSpinner message="" />);
    expect(container.querySelector(".vds-loader-msg")).not.toBeInTheDocument();
  });
});
