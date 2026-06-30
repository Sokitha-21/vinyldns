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

import axios from 'axios';

/** Axios instance pre-configured for the VinylDNS backend */
const api = axios.create({
  baseURL: '/',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Redirect to login only when the session-check endpoint returns 401
 * (i.e. the session has expired or was never created).
 * Regular API calls (zones, groups, etc.) that return 401 due to a
 * transient HMAC error should NOT force a full logout — let the calling
 * component handle the error instead.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string = error?.config?.url ?? '';
    const isSessionCheck =
      url.includes('/users/currentuser') ||
      url.includes('/api/authmode');
    if (error?.response?.status === 401 && isSessionCheck) {
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/** Convert an ISO-8601 date string to a short display format */
export function formatDateTime(timeStamp: string): string {
  return new Date(timeStamp).toLocaleString('en-us', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/** Build a query string URL from a base url and an object of params */
export function urlBuilder(
  url: string,
  params: Record<string, string | number | boolean | undefined | null>
): string {
  const result: string[] = [];
  for (const property of Object.keys(params)) {
    const val = params[property];
    if (val !== undefined && val !== null) {
      result.push(
        `${encodeURIComponent(property)}=${encodeURIComponent(String(val))}`
      );
    }
  }
  const qs = result.join('&');
  return qs ? `${url}?${qs}` : url;
}

export default api;
