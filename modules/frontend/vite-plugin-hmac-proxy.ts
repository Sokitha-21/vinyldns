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

/**
 * vite-plugin-hmac-proxy.ts
 *
 * A Vite dev-server plugin that replaces the Play/Scala portal's signing layer.
 * It:
 *  1. Handles POST /login  – authenticates via LDAP (username + password),
 *     then looks up the user's accessKey + secretKey from MySQL, and stores
 *     them in a server-side session.  Mirrors what processLogin() does in
 *     VinylDNS.scala / LdapAuthenticator.scala.
 *  2. Handles POST /logout – clears the session.
 *  3. Intercepts every other API path and:
 *       a. Reads the session cookie to get credentials.
 *       b. Signs the request using AWS Signature V4
 *          (service = "VinylDNS", region = "us-east-1").
 *       c. Proxies the signed request to http://localhost:9000.
 *
 * Configuration is read from `application.conf` in the `modules/frontend`
 * directory (the same file used for LDAP and MySQL settings).
 * Keys used:
 *
 *   LDAP.context.providerUrl
 *   LDAP.user  /  LDAP.password  /  LDAP.userNameAttribute
 *   LDAP.searchBase[].domainName
 *   mysql.endpoint  /  mysql.settings.{name,user,password}
 *   api.port
 */

import type { Plugin } from 'vite';
import crypto from 'crypto';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import ldapjs from 'ldapjs';
import mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';

// ── application.conf reader ───────────────────────────────────────────────────

interface AppConfig {
  ldap: {
    providerUrl: string;
    adminDn: string;
    adminPassword: string;
    userAttr: string;
    searchBases: string[];
  };
  mysql: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl: boolean;
  };
  api: {
    url: string;      // full api URL e.g. https://sample.net:9443
    protocol: string; // "http" or "https"
    hostname: string;
    port: number;
  };
  portal: {
    port: number;
    dist: string;
  };
  oidc: {
    enabled: boolean;
    /** OIDC discovery URL or authorization endpoint */
    authorizationEndpoint: string;
    tokenEndpoint: string;
    logoutEndpoint: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scope: string;
    jwtUsernameField: string;
    jwtFirstnameField: string;
    jwtLastnameField: string;
    jwtEmailField: string;
  };
  crypto: {
    type: string;
    secret: string;
    obfV1Pw: string;
    obfV1Iv: string;
    obfV1Iterations: number;
    obfV1KeyLength: number;
  };
}

/**
 * Reads application.conf (HOCON) and extracts the keys needed by the proxy.
 * Strategy:
 *  - Walk lines, track nested block path with a stack.
 *  - Only capture lines of the form   key = "literal"   (skips ${?VAR} overrides).
 *  - Parse `LDAP.searchBase` array separately with a dedicated regex.
 */
function readAppConfig(): AppConfig {
  const confPath = path.resolve(process.cwd(), 'application.conf');
  const content = fs.readFileSync(confPath, 'utf8');

  const flat: Record<string, string> = {};
  const stack: string[] = [];

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // Block open: "word {" or "word-word {"
    const openMatch = line.match(/^([\w-]+)\s*\{$/);
    if (openMatch) { stack.push(openMatch[1]); continue; }

    // Block close
    if (line === '}' || line === '},') { stack.pop(); continue; }

    // Skip substitution-only lines like:  key = ${?VAR}
    if (/=\s*\$\{/.test(line)) continue;

    // key = "plain quoted string"  (no interpolation)
    const quoted = line.match(/^([\w.-]+)\s*=\s*"([^"]*)"(?:\s*#.*)?$/);
    if (quoted) {
      flat[[...stack, quoted[1]].join('.')] = quoted[2];
      continue;
    }

    // key = unquoted token  (numbers, booleans, bare words)
    const unquoted = line.match(/^([\w.-]+)\s*=\s*([^\s"$#{}\[\],][^\s#]*)(?:\s*#.*)?$/);
    if (unquoted) {
      flat[[...stack, unquoted[1]].join('.')] = unquoted[2];
    }
  }

  // searchBase is an array block – extract domainName values with a targeted regex
  const sbMatch = content.match(/searchBase\s*=\s*\[([\s\S]*?)\]/);
  const searchBases: string[] = [];
  if (sbMatch) {
    const re = /domainName\s*=\s*"([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sbMatch[1])) !== null) {
      if (m[1]) searchBases.push(m[1]);
    }
  }

  // mysql.endpoint (plain "host:port") OR mysql.settings.url (JDBC URL)
  // jdbc:mariadb://host:port/database?useSSL=true&...
  const endpoint = flat['mysql.endpoint'] ?? flat['mysql.settings.url'] ?? 'localhost:3306';
  let mysqlHost: string;
  let mysqlPort: number;
  let mysqlSsl = false;

  if (endpoint.startsWith('jdbc:')) {
    // jdbc:protocol://host:port/database?params
    const jdbcMatch = endpoint.match(/\/\/([^/:?]+)(?::(\d+))?(?:\/|\?|$)/);
    mysqlHost = jdbcMatch?.[1] ?? 'localhost';
    mysqlPort = jdbcMatch?.[2] ? parseInt(jdbcMatch[2], 10) : 3306;
    mysqlSsl  = /useSSL=true/i.test(endpoint);
  } else {
    const colonIdx = endpoint.lastIndexOf(':');
    mysqlHost = colonIdx !== -1 ? endpoint.slice(0, colonIdx) : endpoint;
    mysqlPort = colonIdx !== -1 ? parseInt(endpoint.slice(colonIdx + 1), 10) : 19002;
  }

  return {
    ldap: {
      providerUrl:   flat['LDAP.context.providerUrl'] ?? 'ldap://localhost:19004',
      adminDn:       flat['LDAP.user']                ?? 'cn=admin,dc=planetexpress,dc=com',
      adminPassword: flat['LDAP.password']            ?? 'GoodNewsEveryone',
      userAttr:      flat['LDAP.userNameAttribute']   ?? 'uid',
      searchBases:   searchBases.length ? searchBases : ['ou=people,dc=planetexpress,dc=com'],
    },
    mysql: {
      host:     mysqlHost,
      port:     isNaN(mysqlPort) ? 3306 : mysqlPort,
      database: flat['mysql.settings.name']     ?? 'vinyldns',
      user:     flat['mysql.settings.user']     ?? 'root',
      password: flat['mysql.settings.password'] ?? 'pass',
      ssl:      mysqlSsl,
    },
    api: (() => {
      // Prefer the full backend URL (Scala Play config key) over bare port
      const rawUrl =
        flat['api.url'] ??
        `http://localhost:${flat['api.port'] ?? '9000'}`;
      let parsed: URL;
      try { parsed = new URL(rawUrl); } catch { parsed = new URL('http://localhost:9000'); }
      const protocol = parsed.protocol.replace(':', '');
      const defaultPort = protocol === 'https' ? 443 : 80;
      const port = parsed.port ? parseInt(parsed.port, 10) : defaultPort;
      // Normalise to no trailing slash
      const url = `${protocol}://${parsed.hostname}${ port !== defaultPort ? ':' + port : '' }`;
      return { url, protocol, hostname: parsed.hostname, port };
    })(),
    portal: {
      port: parseInt(flat["portal.port"] ?? "9001", 10),
      dist: flat["portal.dist"] ?? "",
    },
    oidc: {
      enabled:               flat['oidc.enabled'] === 'true',
      authorizationEndpoint: flat['oidc.authorization-endpoint']  ?? flat['oidc.authorization_endpoint'] ?? '',
      tokenEndpoint:         flat['oidc.token-endpoint']          ?? flat['oidc.tokenEndpoint']          ?? '',
      logoutEndpoint:        flat['oidc.logout-endpoint']         ?? flat['oidc.logoutEndpoint']         ?? '',
      clientId:              flat['oidc.client-id']               ?? flat['oidc.clientId']               ?? '',
      clientSecret:          flat['oidc.secret']                  ?? '',
      redirectUri:           flat['oidc.redirect-uri']            ?? flat['oidc.redirectUri']            ?? '',
      scope:                 flat['oidc.scope']                   ?? 'openid profile email',
      jwtUsernameField:      flat['oidc.jwt-username-field']      ?? 'preferred_username',
      jwtFirstnameField:     flat['oidc.jwt-firstname-field']     ?? 'given_name',
      jwtLastnameField:      flat['oidc.jwt-lastname-field']      ?? 'family_name',
      jwtEmailField:         flat['oidc.jwt-email-field']         ?? 'email',
    },
    crypto: {
      type:            flat['crypto.type']                          ?? '',
      secret:          flat['crypto.secret']                        ?? '',
      obfV1Pw:         flat['crypto.obfuscator.v1.pw']             ?? '',
      obfV1Iv:         flat['crypto.obfuscator.v1.iv']             ?? '',
      obfV1Iterations: parseInt(flat['crypto.obfuscator.v1.iterations']  ?? '4096', 10),
      obfV1KeyLength:  parseInt(flat['crypto.obfuscator.v1.key-length']  ?? '128',  10),
    },
  };
}

let _config: AppConfig | undefined;
function getConfig(): AppConfig {
  if (!_config) {
    _config = readAppConfig();
    if (_config.oidc.enabled) {
      console.log(
        `[hmac-proxy] OIDC mode (Azure AD) — auth handled natively by Node.js.\n` +
        `              Token endpoint : ${_config.oidc.tokenEndpoint}\n` +
        `              Redirect URI   : ${_config.oidc.redirectUri || `http://localhost:${_config.portal.port}`}\n` +
        `              API backend    : ${_config.api.url}\n` +
        `              NOTE: redirect-uri in application.conf must match the Azure AD app registration.`
      );
    }
  }
  return _config;
}

// ── Credential decryption (pluggable) ───────────────────────────────────────
/** Function that decrypts an encrypted credential value from MySQL. */
export type CredentialDecryptor =
  (value: string, cryptoConfig: AppConfig['crypto']) => string;

/** Options accepted by hmacProxyPlugin() and createBackend(). */
export interface ProxyOptions {
  /**
   * Optional credential decryptor.  When omitted (the default) credential
   * values are passed through unchanged — correct for NoOpCrypto or plaintext
   * key storage.
   */
  credentialDecryptor?: CredentialDecryptor;
}

/** Module-level decryptor set once at startup. */
let _credentialDecryptor: CredentialDecryptor = (v) => v; // default: no-op

function decryptVinylDnsCredential(value: string): string {
  return _credentialDecryptor(value, getConfig().crypto);
}

/**
 * Initialises the credential decryptor before the server handles any requests.
 *
 * If `override` is supplied it is used directly.  Otherwise the proxy
 * attempts to load an optional local module `./credential-decryptor.js`
 * (compiled from the gitignored `credential-decryptor.ts` when present).
 * If the file does not exist the default no-op passthrough is kept.
 *
 * The import path is held in a variable so TypeScript and Vite do not try to
 * statically resolve or bundle the optional module.
 */
export async function initDecryptor(override?: CredentialDecryptor): Promise<void> {
  if (override) {
    _credentialDecryptor = override;
    return;
  }
  // Variable path prevents static analysis — module is optional and gitignored.
  const modulePath = './credential-decryptor.js';
  const mod = await import(/* @vite-ignore */ modulePath).catch(() => null);
  if (mod && typeof mod.decryptCredential === 'function') {
    _credentialDecryptor = mod.decryptCredential;
    console.log('[hmac-proxy] credential decryptor loaded from credential-decryptor.js');
  }
}

const SERVICE = 'VinylDNS';
const REGION  = 'us-east-1';

/** API paths intercepted, signed, and proxied to the VinylDNS API. */
const API_PREFIXES = [
  '/groups',
  '/zones',
  '/recordsets',
  '/batchrecordsets',
  '/dnschanges',
  '/users',
  '/regenerate-creds', //not needed
  '/download-creds-file',//not needed
];

// ── session store ─────────────────────────────────────────────────────────────

interface Session {
  username: string;
  accessKey: string;
  secretKey: string;
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  isSuper: boolean;
  isSupport: boolean;
  lockStatus: string;
}

const sessions = new Map<string, Session>();

function randomToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function getSession(cookieHeader: string | undefined): Session | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(/(?:^|;\s*)vinyldns_session=([^;]+)/);
  if (!match) return undefined;
  return sessions.get(match[1]);
}

// ── Protobuf encode/decode for VinylDNS User message ────────────────────────
// Message definition matches VinylDNSProto.proto:
//   field 1 string userName, 2 string accessKey, 3 string secretKey,
//   4 int64 created, 5 string id, 6 bool isSuper, 7 string lockStatus,
//   8 string firstName, 9 string lastName, 10 string email,
//   11 bool isSupport, 12 bool isTest

interface UserProto {
  userName: string;
  accessKey: string;
  secretKey: string;
  created: bigint;
  id: string;
  isSuper: boolean;
  lockStatus: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  isSupport?: boolean;
  isTest?: boolean;
}

function encodeVarint(value: bigint): Buffer {
  const bytes: number[] = [];
  while (value >= 128n) {
    bytes.push(Number((value & 0x7fn) | 0x80n));
    value >>= 7n;
  }
  bytes.push(Number(value));
  return Buffer.from(bytes);
}

function pbString(fieldNum: number, value: string): Buffer {
  const tag = Buffer.from([(fieldNum << 3) | 2]);
  const encoded = Buffer.from(value, 'utf8');
  const lenBuf = encodeVarint(BigInt(encoded.length));
  return Buffer.concat([tag, lenBuf, encoded]);
}

function pbBool(fieldNum: number, value: boolean): Buffer {
  return Buffer.from([(fieldNum << 3) | 0, value ? 1 : 0]);
}

function pbInt64(fieldNum: number, value: bigint): Buffer {
  return Buffer.concat([Buffer.from([(fieldNum << 3) | 0]), encodeVarint(value)]);
}

/** Encode a UserProto to the protobuf binary format stored in MySQL `data` column. */
function encodeUserProto(u: UserProto): Buffer {
  const parts: Buffer[] = [
    pbString(1, u.userName),
    pbString(2, u.accessKey),
    pbString(3, u.secretKey),
    pbInt64(4, u.created),
    pbString(5, u.id),
    pbBool(6, u.isSuper),
    pbString(7, u.lockStatus),
  ];
  if (u.firstName) parts.push(pbString(8, u.firstName));
  if (u.lastName)  parts.push(pbString(9, u.lastName));
  if (u.email)     parts.push(pbString(10, u.email));
  if (u.isSupport) parts.push(pbBool(11, u.isSupport));
  if (u.isTest)    parts.push(pbBool(12, u.isTest));
  return Buffer.concat(parts);
}

/** Decode only the fields needed from the `data` protobuf blob. */
function decodeUserProto(buf: Buffer): Partial<UserProto> {
  let pos = 0;
  const r: Partial<UserProto> = {};
  while (pos < buf.length) {
    const tagByte = buf[pos++];
    const fieldNum = tagByte >> 3;
    const wireType = tagByte & 0x7;
    if (wireType === 2) {
      let len = 0, shift = 0;
      while (pos < buf.length) {
        const b = buf[pos++]; len |= (b & 0x7f) << shift; shift += 7;
        if (!(b & 0x80)) break;
      }
      const val = buf.slice(pos, pos + len).toString('utf8');
      pos += len;
      if (fieldNum === 1) r.userName  = val;
      if (fieldNum === 2) r.accessKey = val;
      if (fieldNum === 3) r.secretKey = val;
      if (fieldNum === 5) r.id        = val;
      if (fieldNum === 7) r.lockStatus = val;
      if (fieldNum === 8) r.firstName = val;
      if (fieldNum === 9) r.lastName  = val;
      if (fieldNum === 10) r.email    = val;
    } else if (wireType === 0) {
      let val = 0n, shift = 0n;
      while (pos < buf.length) {
        const b = buf[pos++]; val |= BigInt(b & 0x7f) << shift; shift += 7n;
        if (!(b & 0x80)) break;
      }
      if (fieldNum === 4)  r.created   = val;
      if (fieldNum === 6)  r.isSuper   = val !== 0n;
      if (fieldNum === 11) r.isSupport = val !== 0n;
      if (fieldNum === 12) r.isTest    = val !== 0n;
    } else {
      // Unknown wire type – stop to avoid infinite loop
      break;
    }
  }
  return r;
}

// ── LDAP authentication ───────────────────────────────────────────────────────

interface LdapUserDetails {
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Replicates LdapAuthenticator.authenticate():
 *  1. Bind as the admin service account.
 *  2. Search each configured base DN for the user entry,
 *     collecting mail / givenName / sn attributes (mirrors LdapUserDetails.apply).
 *  3. Re-bind using the user's full DN + password to verify credentials.
 */
/**
 * LDAP search-only lookup (no password verification).
 * Mirrors authenticator.lookup(username) in VinylDNS.scala / LdapAuthenticator.scala.
 * Used by the /users/lookupuser/:username handler so we can find users who
 * exist in LDAP but haven't logged into the new portal yet.
 */
function ldapLookupUser(username: string): Promise<LdapUserDetails | null> {
  const cfg = getConfig().ldap;
  const safeUsername = username.replace(/[*\\()\x00]/g, '\\$&');
  const filter = `(${cfg.userAttr}=${safeUsername})`;

  return new Promise((resolve) => {
    const adminClient = ldapjs.createClient({ url: cfg.providerUrl });
    adminClient.on('error', () => resolve(null));

    adminClient.bind(cfg.adminDn, cfg.adminPassword, (bindErr) => {
      if (bindErr) { adminClient.destroy(); return resolve(null); }

      const trySearch = (baseDNs: string[]) => {
        if (baseDNs.length === 0) { adminClient.destroy(); return resolve(null); }

        const [baseDN, ...rest] = baseDNs;
        adminClient.search(baseDN, {
          scope: 'sub', filter,
          attributes: ['dn', cfg.userAttr, 'mail', 'givenName', 'sn'],
        }, (searchErr, searchRes) => {
          if (searchErr) return trySearch(rest);

          let found = false;
          let email: string | undefined;
          let firstName: string | undefined;
          let lastName: string | undefined;

          searchRes.on('searchEntry', (entry) => {
            if (!found) {
              found = true;
              for (const attr of entry.attributes) {
                const name = attr.type.toLowerCase();
                const val  = attr.values[0];
                if (name === 'mail')      email     = val;
                if (name === 'givenname') firstName = val;
                if (name === 'sn')        lastName  = val;
              }
            }
          });
          searchRes.on('error', () => trySearch(rest));
          searchRes.on('end', () => {
            adminClient.destroy();
            if (found) resolve({ username, email, firstName, lastName });
            else trySearch(rest);
          });
        });
      };
      trySearch(cfg.searchBases);
    });
  });
}

function ldapAuthenticate(username: string, password: string): Promise<LdapUserDetails> {
  const cfg = getConfig().ldap;
  const safeUsername = username.replace(/[*\\()\x00]/g, '\\$&');
  const filter = `(${cfg.userAttr}=${safeUsername})`;

  return new Promise((resolve, reject) => {
    const adminClient = ldapjs.createClient({ url: cfg.providerUrl });

    adminClient.on('error', (err: Error) => {
      reject(new Error(`LDAP connection error: ${err.message}`));
    });

    // Step 1 – bind as admin
    adminClient.bind(cfg.adminDn, cfg.adminPassword, (bindErr) => {
      if (bindErr) {
        adminClient.destroy();
        return reject(new Error(`LDAP admin bind failed: ${bindErr.message}`));
      }

      // Step 2 – search for the user, fetching profile attributes too
      const trySearch = (baseDNs: string[]) => {
        if (baseDNs.length === 0) {
          adminClient.destroy();
          return reject(new Error(`User '${username}' not found in LDAP`));
        }

        const [baseDN, ...rest] = baseDNs;
        adminClient.search(
          baseDN,
          {
            scope: 'sub',
            filter,
            // fetch uid + profile fields, mirrors LdapUserDetails.apply
            attributes: ['dn', cfg.userAttr, 'mail', 'givenName', 'sn'],
          },
          (searchErr, searchRes) => {
            if (searchErr) {
              return trySearch(rest);
            }

            let userDN = '';
            let email: string | undefined;
            let firstName: string | undefined;
            let lastName: string | undefined;

            searchRes.on('searchEntry', (entry) => {
              if (!userDN) {
                userDN = entry.dn.toString();
                // Retrieve optional profile attributes
                const attrs = entry.attributes;
                for (const attr of attrs) {
                  const name = attr.type.toLowerCase();
                  const val  = attr.values[0];
                  if (name === 'mail')       email     = val;
                  if (name === 'givenname')  firstName = val;
                  if (name === 'sn')          lastName  = val;
                }
              }
            });
            searchRes.on('error', () => trySearch(rest));
            searchRes.on('end', () => {
              if (!userDN) {
                return trySearch(rest);
              }

              // Step 3 – re-bind as user to verify password
              const userClient = ldapjs.createClient({ url: cfg.providerUrl });
              userClient.on('error', (e: Error) => {
                adminClient.destroy();
                reject(new Error(`LDAP user bind error: ${e.message}`));
              });
              userClient.bind(userDN, password, (userBindErr) => {
                userClient.destroy();
                adminClient.destroy();
                if (userBindErr) {
                  reject(new Error('Invalid credentials'));
                } else {
                  resolve({ username, email, firstName, lastName });
                }
              });
            });
          },
        );
      };

      trySearch(cfg.searchBases);
    });
  });
}

// ── MySQL credential lookup ───────────────────────────────────────────────────

interface VinylUser {
  userName: string;
  accessKey: string;
  secretKey: string;
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  isSuper: boolean;
  isSupport: boolean;
  lockStatus: string;
}

/** Open a pooled MySQL connection using app config. */
function openMysqlConnection() {
  const cfg = getConfig().mysql;
  return mysql.createConnection({
    host: cfg.host, port: cfg.port, database: cfg.database,
    user: cfg.user, password: cfg.password,
    ...(cfg.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}

/**
 * Replicates userAccountAccessor.get(username).
 * The MySQL table is `user` with columns id, user_name, access_key, data.
 * `data` is a protobuf-encoded User message (VinylDNSProto.User).
 * NoOpCrypto stores secretKey unencrypted so no decryption needed.
 */
async function getUserCredentials(username: string): Promise<VinylUser | null> {
  const conn = await openMysqlConnection();
  try {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT access_key, data FROM `user` WHERE user_name = ? LIMIT 1',
      [username],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    const dataBlob: Buffer = row.data as Buffer;
    const proto = decodeUserProto(dataBlob);
    const rawSecret = proto.secretKey ?? '';
    const secretKey = decryptVinylDnsCredential(rawSecret);
    console.log(
      `[hmac-proxy] getUserCredentials(${username}): accessKey="${proto.accessKey ?? row.access_key}" ` +
      `secretKey len=${secretKey.length} (first 6: "${secretKey.substring(0, 6)}")`
    );
    return {
      userName:   username,
      accessKey:  proto.accessKey  ?? (row.access_key as string),
      secretKey,
      id:         proto.id          ?? '',
      firstName:  proto.firstName,
      lastName:   proto.lastName,
      email:      proto.email,
      isSuper:    proto.isSuper    ?? false,
      isSupport:  proto.isSupport  ?? false,
      lockStatus: proto.lockStatus ?? 'Unlocked',
    };
  } finally {
    await conn.end();
  }
}

/** Generates a 20-character random alphanumeric key (mirrors User.generateKey in Scala). */
function generateKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  const bytes = crypto.randomBytes(20);
  for (const b of bytes) key += chars[b % chars.length];
  return key;
}

/**
 * Replicates createNewUser() in VinylDNS.scala.
 * Generates accessKey + secretKey, inserts a protobuf-encoded User record
 * into MySQL, and returns the new credentials.
 */
async function createUser(ldapDetails: LdapUserDetails): Promise<VinylUser> {
  const accessKey = generateKey();
  const secretKey = generateKey();
  const id        = uuidv4();
  const created   = BigInt(Date.now());

  const proto: UserProto = {
    userName:   ldapDetails.username,
    accessKey,
    secretKey,
    created,
    id,
    isSuper:    false,
    lockStatus: 'Unlocked',
    firstName:  ldapDetails.firstName,
    lastName:   ldapDetails.lastName,
    email:      ldapDetails.email,
    isSupport:  false,
    isTest:     false,
  };

  const data = encodeUserProto(proto);
  const conn = await openMysqlConnection();
  try {
    await conn.execute(
      'REPLACE INTO `user` (id, user_name, access_key, data) VALUES (?, ?, ?, ?)',
      [id, ldapDetails.username, accessKey, data],
    );
    console.log(`[hmac-proxy] Created new VinylDNS user: ${ldapDetails.username}`);
  } finally {
    await conn.end();
  }

  return {
    userName:   ldapDetails.username,
    accessKey,
    secretKey,
    id,
    firstName:  ldapDetails.firstName,
    lastName:   ldapDetails.lastName,
    email:      ldapDetails.email,
    isSuper:    false,
    isSupport:  false,
    lockStatus: 'Unlocked',
  };
}

/**
 * Regenerates accessKey and secretKey for a user in MySQL and returns the new values.
 * Mirrors User.regenerateCredentials() in Scala.
 */
async function updateUserCredentials(username: string): Promise<{ accessKey: string; secretKey: string }> {
  const newAccessKey = generateKey();
  const newSecretKey = generateKey();
  const conn = await openMysqlConnection();
  try {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      'SELECT data FROM `user` WHERE user_name = ? LIMIT 1',
      [username],
    );
    if (rows.length === 0) throw new Error(`User ${username} not found`);
    const proto = decodeUserProto(rows[0].data as Buffer);
    const updatedProto: UserProto = {
      userName:   proto.userName   ?? username,
      accessKey:  newAccessKey,
      secretKey:  newSecretKey,
      created:    proto.created    ?? BigInt(Date.now()),
      id:         proto.id         ?? '',
      isSuper:    proto.isSuper    ?? false,
      lockStatus: proto.lockStatus ?? 'Unlocked',
      firstName:  proto.firstName,
      lastName:   proto.lastName,
      email:      proto.email,
      isSupport:  proto.isSupport  ?? false,
      isTest:     proto.isTest     ?? false,
    };
    await conn.execute(
      'UPDATE `user` SET access_key = ?, data = ? WHERE user_name = ?',
      [newAccessKey, encodeUserProto(updatedProto), username],
    );
    console.log(`[hmac-proxy] Regenerated credentials for ${username}`);
  } finally {
    await conn.end();
  }
  return { accessKey: newAccessKey, secretKey: newSecretKey };
}

// ── AWS Signature V4 ─────────────────────────────────────────────────────────

function hmacSha256(key: Buffer | string, data: string): Buffer {
  const k = Buffer.isBuffer(key) ? key : Buffer.from(key, 'utf8');
  return crypto.createHmac('sha256', k).update(data, 'utf8').digest();
}

function sha256Hex(data: string | Buffer): string {
  const h = crypto.createHash('sha256');
  if (Buffer.isBuffer(data)) h.update(data);
  else h.update(data, 'utf8');
  return h.digest('hex');
}

function awsEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/\+/g, '%20')
    .replace(/%7E/g, '~')
    .replace(/\*/g, '%2A');
}

/** Produces `key=value&key=value` sorted by key then value, AWS-encoded. */
function canonicalQueryString(rawQuery: string): string {
  if (!rawQuery) return '';
  const pairs: [string, string][] = rawQuery.split('&').map((p) => {
    const eq = p.indexOf('=');
    if (eq === -1) return [decodeURIComponent(p), ''];
    return [decodeURIComponent(p.slice(0, eq)), decodeURIComponent(p.slice(eq + 1))];
  });
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1));
  return pairs.map(([k, v]) => `${awsEncode(k)}=${awsEncode(v)}`).join('&');
}

function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  const kDate    = hmacSha256(Buffer.from('AWS4' + secretKey, 'utf8'), dateStamp);
  const kRegion  = hmacSha256(kDate,    region);
  const kService = hmacSha256(kRegion,  service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  return kSigning;
}

/**
 * Signs `method path?query` using AWS V4 and returns the Authorization header
 * plus the X-Amz-Date header that must be forwarded verbatim.
 */
function buildAuthHeaders(
  method: string,
  rawPath: string,
  rawQuery: string,
  bodyBuf: Buffer,
  accessKey: string,
  secretKey: string,
): Record<string, string> {
  const apiCfg = getConfig().api;
  const now = new Date();
  // yyyyMMddTHHmmssZ  (ISO-8601 compact, UTC, no milliseconds)
  const dateTime =
    now.getUTCFullYear().toString() +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0') +
    'T' +
    String(now.getUTCHours()).padStart(2, '0') +
    String(now.getUTCMinutes()).padStart(2, '0') +
    String(now.getUTCSeconds()).padStart(2, '0') +
    'Z';
  const dateStamp = dateTime.slice(0, 8);

  // Use hostname only (no port) for the HMAC host header.
  // The VinylDNS API is typically behind a reverse proxy/load balancer that
  // terminates TLS and strips the port from the Host header before forwarding.
  // If we sign with "hostname:port" but the API sees "hostname", the signatures
  // will not match.  Using just the hostname matches the Scala Play portal's
  // behaviour (Java's URI.getHost() returns hostname without port).
  const hostHeader = apiCfg.hostname;
  const bodyHash   = sha256Hex(bodyBuf);

  // Headers to sign (sorted alphabetically by key).
  // VinylDNS uses standard AWS Sig V4 for non-S3: sign only host + x-amz-date.
  // x-amz-content-sha256 is intentionally NOT a signed header (matching boto3 /
  // botocore SigV4Auth behaviour for non-S3 services and the functional test
  // client in aws_request_signer.py).  Including it causes a mismatch when a
  // reverse proxy strips the header before the API verifies the signature.
  const signMap: Record<string, string> = {
    host:         hostHeader,
    'x-amz-date': dateTime,
  };

  const sortedNames   = Object.keys(signMap).sort();
  const signedHeaders = sortedNames.join(';');

  // Canonical headers: "key:value" elements then empty string, as per Scala code
  const canonHeaders = sortedNames.map((k) => `${k}:${signMap[k]}`);

  // Normalise path (remove /./ and /../)
  let normalPath: string;
  try {
    const u = new URL('http://x' + (rawPath || '/'));
    normalPath = u.pathname;
  } catch {
    normalPath = rawPath || '/';
  }

  const canonRequest = [
    method.toUpperCase(),
    normalPath,
    canonicalQueryString(rawQuery),
    ...canonHeaders,
    '',
    signedHeaders,
    bodyHash,
  ].join('\n');

  const scope        = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', dateTime, scope, sha256Hex(canonRequest)].join('\n');
  const signingKey   = getSigningKey(secretKey, dateStamp, REGION, SERVICE);
  const signature    = hmacSha256(signingKey, stringToSign).toString('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, ` +
    `Signature=${signature}`;

  return {
    authorization,
    'x-amz-date':            dateTime,
    'x-amz-content-sha256':  bodyHash,
    host:                    hostHeader,
  };
}

// ── HTTP proxy helper ───────────────────────────────────────────────────────── not needed

/** Forwards a request to the VinylDNS API and pipes the response back. */
function proxyToApi(
  method: string,
  path: string,
  query: string,
  reqHeaders: Record<string, string>,
  bodyBuf: Buffer,
  serverRes: http.ServerResponse,
): void {
  const apiCfg = getConfig().api;
  const target  = query ? `${path}?${query}` : path;
  const transport = apiCfg.protocol === 'https' ? https : http;

  const options: http.RequestOptions = {
    hostname: apiCfg.hostname,
    port:     apiCfg.port,
    method:   method.toUpperCase(),
    path:     target,
    headers:  reqHeaders,
  };

  const proxyReq = transport.request(options, (proxyRes) => {
    // Pass through status + headers
    serverRes.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers as Record<string, string>);
    proxyRes.pipe(serverRes, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[hmac-proxy] upstream error:', err.message);
    if (!serverRes.headersSent) serverRes.writeHead(502);
    serverRes.end(JSON.stringify({ error: 'Upstream API unavailable', detail: err.message }));
  });

  if (bodyBuf.length > 0) proxyReq.write(bodyBuf);
  proxyReq.end();
}

/** Reads the full request body as a Buffer. */
function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end',  () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Like proxyToApi but logs the upstream response status. */
function proxyToApiWithLog(
  method: string,
  path: string,
  query: string,
  reqHeaders: Record<string, string>,
  bodyBuf: Buffer,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  serverRes: http.ServerResponse,
): void {
  const apiCfg2  = getConfig().api;
  const target   = query ? `${path}?${query}` : path;
  const transport2 = apiCfg2.protocol === 'https' ? https : http;

  const options: http.RequestOptions = {
    hostname: apiCfg2.hostname,
    port:     apiCfg2.port,
    method:   method.toUpperCase(),
    path:     target,
    headers:  reqHeaders,
  };

  const proxyReq = transport2.request(options, (proxyRes) => {
    const status = proxyRes.statusCode ?? 502;
    const qs = query ? `?${query}` : '';
    console.log(`[hmac-proxy] ← ${method} ${path}${qs} → HTTP ${status}`);
    serverRes.writeHead(status, proxyRes.headers as Record<string, string>);
    proxyRes.pipe(serverRes, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[hmac-proxy] upstream error:', err.message);
    if (!serverRes.headersSent) serverRes.writeHead(502);
    serverRes.end(JSON.stringify({ error: 'Upstream API unavailable', detail: err.message }));
  });

  if (bodyBuf.length > 0) proxyReq.write(bodyBuf);
  proxyReq.end();
}

// ── OIDC pass-through helpers ─────────────────────────────────────────────────

/**
 * In OIDC mode the Scala Play portal (localhost:{api.port}) handles all auth
 * and signs API calls.  This function forwards a request to it transparently,
 * preserving the Play session cookie so the browser stays authenticated.
 *
 * Path mapping:
 *   /users/*, /groups/*, /zones/*, /recordsets/*, /dnschanges/*
 *     → /api{path}   (Scala Play routes carry the /api/ prefix)
 *   Everything else (callbacks, logout, creds endpoints)
 *     → same path
 */
function proxyToScalaPortal(
  method: string,
  targetPath: string,
  query: string,
  req: http.IncomingMessage,
  bodyBuf: Buffer,
  serverRes: http.ServerResponse,
): void {
  const port = getConfig().api.port;
  const urlTarget = query ? `${targetPath}?${query}` : targetPath;

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers[k] = v;
    else if (Array.isArray(v)) headers[k] = v.join(', ');
  }
  headers['host'] = `localhost:${port}`;
  if (bodyBuf.length > 0) headers['content-length'] = String(bodyBuf.length);

  const options: http.RequestOptions = {
    hostname: 'localhost',
    port,
    method:   method.toUpperCase(),
    path:     urlTarget,
    headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    console.log(`[hmac-proxy] OIDC proxy → ${method} ${urlTarget} HTTP ${proxyRes.statusCode}`);
    serverRes.writeHead(
      proxyRes.statusCode ?? 502,
      proxyRes.headers as Record<string, string | string[]>,
    );
    proxyRes.pipe(serverRes, { end: true });
  });

  proxyReq.on('error', (err: NodeJS.ErrnoException) => {
    const detail = err.code
      ? `${err.code}: ${err.message}`
      : (err.message || String(err));
    console.error(`[hmac-proxy] Scala Play proxy error (${method} ${urlTarget}): ${detail}`);
    if (!serverRes.headersSent) serverRes.writeHead(502);
    serverRes.end(JSON.stringify({ error: 'Backend unavailable', detail }));
  });

  if (bodyBuf.length > 0) proxyReq.write(bodyBuf);
  proxyReq.end();
}

/** API prefixes that need /api/ prepended when forwarding to Scala Play. */
const SCALA_API_PREFIXES = [
  '/users', '/groups', '/zones', '/recordsets', '/dnschanges', '/batchrecordsets',
];

// SCALA_PASS_THROUGH / SCALA_API_PREFIXES are kept for reference but no longer used.
// OIDC auth is now handled natively by Node.js (see /callback handler below).

/**
 * Decodes the payload of a JWT without verifying the signature.
 * The token arrived over TLS directly from the Azure AD token endpoint so we
 * trust it at this point; full JWK verification can be added later.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2) return {};
  try {
    // base64url → base64 standard → Buffer → JSON
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Exchanges an authorization code for tokens at the Azure AD token endpoint.
 * Uses client_secret authentication (the "secret" field in the OIDC config).
 */
function exchangeOidcCode(
  code: string,
  redirectUri: string,
): Promise<{ idToken: string; accessToken: string }> {
  const cfg = getConfig().oidc;
  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
    client_id:     cfg.clientId,
    client_secret: cfg.clientSecret,
  }).toString();

  return new Promise((resolve, reject) => {
    const u = new URL(cfg.tokenEndpoint);
    const opts: https.RequestOptions = {
      hostname: u.hostname,
      port:     u.port || '443',
      path:     u.pathname + u.search,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, (tokenRes) => {
      let raw = '';
      tokenRes.on('data', (chunk: string) => { raw += chunk; });
      tokenRes.on('end', () => {
        try {
          const parsed = JSON.parse(raw) as Record<string, string>;
          if (parsed['error']) {
            reject(new Error(`OIDC token error: ${parsed['error']} – ${parsed['error_description'] ?? ''}`));
          } else {
            resolve({ idToken: parsed['id_token'] ?? '', accessToken: parsed['access_token'] ?? '' });
          }
        } catch (e) {
          reject(new Error(`Failed to parse OIDC token response: ${raw}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Cached OIDC discovery document.  Fetched once on the first /api/authmode
 * request when authorization-endpoint looks like a discovery URL.
 */
let _oidcDiscovery: Record<string, string> | undefined;

/**
 * Returns the real OIDC authorization_endpoint.
 * If the configured value is a .well-known/openid-configuration discovery URL
 * we fetch it and extract the real endpoint (result is cached).
 */
async function resolveAuthEndpoint(): Promise<string> {
  const cfg = getConfig().oidc;
  const configured = cfg.authorizationEndpoint;

  if (!configured) return '';
  if (!configured.includes('.well-known/openid-configuration')) return configured;

  if (_oidcDiscovery) return _oidcDiscovery['authorization_endpoint'] ?? '';

  console.log(`[hmac-proxy] Fetching OIDC discovery document: ${configured}`);
  return new Promise((resolve) => {
    const u = new URL(configured);
    const opts: http.RequestOptions = {
      hostname: u.hostname,
      port:     u.port || (u.protocol === 'https:' ? 443 : 80),
      path:     u.pathname + u.search,
      method:   'GET',
    };
    // Use https if needed
    const transport = u.protocol === 'https:' ? require('https') as typeof http : http;
    transport.get(opts as never, (res: http.IncomingMessage) => {
      let raw = '';
      res.on('data', (c: string) => { raw += c; });
      res.on('end', () => {
        try {
          _oidcDiscovery = JSON.parse(raw) as Record<string, string>;
          const ep = _oidcDiscovery['authorization_endpoint'] ?? '';
          console.log(`[hmac-proxy] OIDC discovered authorization_endpoint: ${ep}`);
          resolve(ep);
        } catch { resolve(''); }
      });
    }).on('error', () => resolve(''));
  });
}

// ── Vite plugin / Express backend ────────────────────────────────────────────

import type { Express } from "express";

/**
 * Reads `portal.port` and `portal.dist` from application.conf synchronously.
 * Handles both block form  ( portal { port = N } )  and flat form  ( portal.port = N ).
 */
export function readServerPort(): number {
  const content = fs.readFileSync(
    path.resolve(process.cwd(), "application.conf"),
    "utf8"
  );

  // portal {
  //   port = 9001
  // }
  const blockMatch = content.match(/\bportal\s*\{([^}]*)\}/s);
  if (blockMatch) {
    const m = blockMatch[1].match(/\bport\s*=\s*(\d+)/);
    if (m) {
      return Number(m[1]);
    }
  }

  // portal.port = 9001
  const flatMatch = content.match(/\bportal\.port\s*=\s*(\d+)/);
  if (flatMatch) {
    return Number(flatMatch[1]);
  }

  throw new Error("portal.port is not configured in application.conf");
}

// Handles both block form  ( portal { dist = N } )  and flat form  ( portal.dist = N ).

export function readDistPath(): string {
  const content = fs.readFileSync(
    path.resolve(process.cwd(), "application.conf"),
    "utf8"
  );

  // portal {
  //   dist = "/opt/vinyldns-react/dist"
  // }
  const blockMatch = content.match(/\bportal\s*\{([^}]*)\}/s);
  if (blockMatch) {
    const m = blockMatch[1].match(/\bdist\s*=\s*"([^"]+)"/);
    if (m) {
      return m[1];
    }
  }

  // portal.dist = "/opt/vinyldns-react/dist"
  const flatMatch = content.match(/\bportal\.dist\s*=\s*"([^"]+)"/);
  if (flatMatch) {
    return flatMatch[1];
  }

  throw new Error("portal.dist is not configured in application.conf");
}

/**
 * Reads old portal URL from application.conf.
 * Supports both block form ( old-portal { url = "..." } ) and
 * flat form ( old-portal.url = "..." ).
 */
export function readOldPortalUrl(): string {
  const content = fs.readFileSync(
    path.resolve(process.cwd(), "application.conf"),
    "utf8"
  );

  const blockMatch = content.match(/\bold-portal\s*\{([^}]*)\}/s);
  if (blockMatch) {
    // Filter out comment lines (starting with #) then match url
    const blockContent = blockMatch[1]
      .split('\n')
      .filter(line => !line.trim().startsWith('#'))
      .join('\n');
    const m = blockContent.match(/\burl\s*=\s*"([^"]+)"/);
    if (m) {
      return m[1];
    }
  }

  const flatMatch = content.match(/\bold-portal\.url\s*=\s*"([^"]+)"/);
  if (flatMatch) {
    return flatMatch[1];
  }

  return "http://localhost:9001";
}

/**
 * Vite dev-server plugin — registers the same HMAC-proxy middleware on
 * Vite's Connect server so `npm run dev` also gets auth + signing.
 */
export function hmacProxyPlugin(opts?: ProxyOptions): Plugin {
  return {
    name: 'vinyldns-hmac-proxy',
    configureServer(server) {
      // Return an async post-hook so Vite awaits decryptor init before
      // the dev server starts accepting requests.
      return async () => {
        await createBackend(server.middlewares as unknown as Express, opts);
      };
    },
  };
}

export async function createBackend(app: Express, opts?: ProxyOptions): Promise<void> {
  await initDecryptor(opts?.credentialDecryptor);
    app.use(async (req, res, next) => {
        const url   = req.url ?? '/';
        const qIdx  = url.indexOf('?');
        const path  = qIdx === -1 ? url  : url.slice(0, qIdx);
        const query = qIdx === -1 ? ''   : url.slice(qIdx + 1);
        const method = (req.method ?? 'GET').toUpperCase();

        // ── GET /api/authmode ──────────────────────────────────────────────
        // Tells the frontend which auth mode is active.
        // In OIDC mode also returns the one-time authorization URL so the
        // React login page can redirect the browser directly to Azure AD.
        if (path === '/api/authmode' && method === 'GET') {
          const oidcCfg = getConfig().oidc;
          if (oidcCfg.enabled) {
            try {
              const authEndpoint = await resolveAuthEndpoint();
              const loginId    = uuidv4();
              const redirectUri = oidcCfg.redirectUri
                ? `${oidcCfg.redirectUri}/callback/${loginId}`
                : `http://localhost:${readServerPort()}/callback/${loginId}`;
              const params = new URLSearchParams({
                client_id:     oidcCfg.clientId,
                response_type: 'code',
                redirect_uri:  redirectUri,
                scope:         oidcCfg.scope,
                nonce:         crypto.randomBytes(16).toString('hex'),
                state:         loginId,
              });
              const loginUrl = `${authEndpoint}?${params.toString()}`;
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ mode: 'oidc', loginUrl }));
            } catch {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Failed to resolve OIDC authorization endpoint' }));
            }
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ mode: 'ldap' }));
          }
          return;
        }

        // ── GET /login (OIDC mode) ─────────────────────────────────────────
        // Redirect directly to Azure AD.  React normally uses /api/authmode
        // to get the loginUrl, but a direct browser navigation here also works.
        if (path === '/login' && method === 'GET' && getConfig().oidc.enabled) {
          try {
            const oidcCfg  = getConfig().oidc;
            const authEndpoint = await resolveAuthEndpoint();
            const loginId  = uuidv4();
            const redirectUri = oidcCfg.redirectUri
              ? `${oidcCfg.redirectUri}/callback/${loginId}`
              : `http://localhost:${readServerPort()}/callback/${loginId}`;
            const params = new URLSearchParams({
              client_id:     oidcCfg.clientId,
              response_type: 'code',
              redirect_uri:  redirectUri,
              scope:         oidcCfg.scope,
              nonce:         crypto.randomBytes(16).toString('hex'),
              state:         loginId,
            });
            res.writeHead(302, { 'Location': `${authEndpoint}?${params.toString()}` });
            res.end();
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to build OIDC login URL' }));
          }
          return;
        }

        // ── GET /callback/:loginId (OIDC mode) ────────────────────────────
        // Azure AD redirects here after the user authenticates.
        // Exchange the authorization code for an id_token, decode the JWT,
        // look up (or auto-create) the VinylDNS user in MySQL, then create
        // a session exactly like the LDAP POST /login handler does.
        const callbackMatch = path.match(/^\/callback\/([^/?]+)$/);
        if (callbackMatch && method === 'GET' && getConfig().oidc.enabled) {
          const loginId = callbackMatch[1];
          const params  = new URLSearchParams(query);
          const code    = params.get('code');
          const errorParam = params.get('error');

          if (errorParam) {
            const desc = params.get('error_description') ?? errorParam;
            console.error(`[hmac-proxy] OIDC callback error: ${desc}`);
            res.writeHead(302, { 'Location': `/login?error=${encodeURIComponent(desc)}` });
            res.end();
            return;
          }
          if (!code) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing authorization code in callback' }));
            return;
          }

          try {
            const oidcCfg = getConfig().oidc;
            const redirectUri = oidcCfg.redirectUri
              ? `${oidcCfg.redirectUri}/callback/${loginId}`
              : `http://localhost:${readServerPort()}/callback/${loginId}`;

            console.log(`[hmac-proxy] OIDC callback: exchanging code for token`);
            const { idToken } = await exchangeOidcCode(code, redirectUri);

            const claims  = decodeJwtPayload(idToken);
            const username = String(claims[oidcCfg.jwtUsernameField] ?? '').trim();
            if (!username) {
              console.error(`[hmac-proxy] OIDC JWT missing claim '${oidcCfg.jwtUsernameField}'. Claims:`, Object.keys(claims));
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `OIDC JWT does not contain '${oidcCfg.jwtUsernameField}' claim` }));
              return;
            }

            const firstName = String(claims[oidcCfg.jwtFirstnameField] ?? '');
            const lastName  = String(claims[oidcCfg.jwtLastnameField]  ?? '');
            const email     = String(claims[oidcCfg.jwtEmailField]     ?? '');

            console.log(`[hmac-proxy] OIDC login for user: ${username}`);

            let user = await getUserCredentials(username);
            if (!user) {
              console.log(`[hmac-proxy] First OIDC login for '${username}' — creating VinylDNS account.`);
              user = await createUser({ username, firstName, lastName, email });
            }

            if (user.lockStatus === 'Locked') {
              console.log(`[hmac-proxy] OIDC login rejected — account '${username}' is locked.`);
              res.writeHead(302, { 'Location': '/login?error=Account+is+locked' });
              res.end();
              return;
            }

            const sessionId = randomToken();
            sessions.set(sessionId, {
              username:   user.userName,
              accessKey:  user.accessKey,
              secretKey:  user.secretKey,
              userId:     user.id,
              firstName:  firstName || user.firstName,
              lastName:   lastName  || user.lastName,
              email:      email     || user.email,
              isSuper:    user.isSuper,
              isSupport:  user.isSupport,
              lockStatus: user.lockStatus,
            });

            res.writeHead(302, {
              'Location':   '/',
              'Set-Cookie': `vinyldns_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax`,
            });
            res.end();
          } catch (err) {
            console.error('[hmac-proxy] OIDC callback failed:', (err as Error).message);
            res.writeHead(302, { 'Location': `/login?error=${encodeURIComponent((err as Error).message)}` });
            res.end();
          }
          return;
        }

        // ── POST /login ────────────────────────────────────────────────────
        if (path === '/login' && method === 'POST') {
          try {
            const bodyBuf = await readBody(req);
            const bodyStr = bodyBuf.toString('utf8');

            // Accept both JSON and form-encoded bodies
            let username = '';
            let password = '';

            const ct = (req.headers['content-type'] ?? '').toLowerCase();
            if (ct.includes('application/json')) {
              const parsed = JSON.parse(bodyStr) as Record<string, string>;
              username = parsed.username ?? '';
              password = parsed.password ?? '';
            } else {
              // x-www-form-urlencoded
              const params = new URLSearchParams(bodyStr);
              username = params.get('username') ?? '';
              password = params.get('password') ?? '';
            }

            if (!username || !password) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'username and password are required' }));
              return;
            }

            // Step 1 – authenticate via LDAP (mirrors LdapAuthenticator.authenticate)
            let ldapDetails: LdapUserDetails;
            try {
              ldapDetails = await ldapAuthenticate(username, password);
            } catch (ldapErr) {
              console.error('[hmac-proxy] LDAP auth failed:', (ldapErr as Error).message);
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Authentication failed, please try again' }));
              return;
            }

            // Step 2 – fetch or create user record in MySQL
            // Mirrors processLoginWithDetails(): get existing OR createNewUser()
            let user = await getUserCredentials(username);
            if (!user) {
              console.log(`[hmac-proxy] First login for '${username}' – creating VinylDNS account.`);
              user = await createUser(ldapDetails);
            }

            // Mirrors VinylDnsAction.invokeBlock: reject locked accounts at login.
            // Message format mirrors the old portal's lockedUserResult().
            if (user.lockStatus === 'Locked') {
              console.log(`[hmac-proxy] Login rejected – account '${username}' is locked.`);
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                error: `Authentication Failed: Account with username ${username} is locked`,
              }));
              return;
            }

            // Step 3 – create session
            const sessionId = randomToken();
            sessions.set(sessionId, {
              username:   user.userName,
              accessKey:  user.accessKey,
              secretKey:  user.secretKey,
              userId:     user.id,
              firstName:  user.firstName,
              lastName:   user.lastName,
              email:      user.email,
              isSuper:    user.isSuper,
              isSupport:  user.isSupport,
              lockStatus: user.lockStatus,
            });

            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Set-Cookie': `vinyldns_session=${sessionId}; Path=/; HttpOnly; SameSite=Strict`,
            });
            res.end(JSON.stringify({ ok: true, username: user.userName }));
          } catch (err) {
            console.error('[hmac-proxy] /login error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Login failed' }));
          }
          return;
        }

        // ── POST/GET /logout ───────────────────────────────────────────────
        if (path === '/logout' && (method === 'POST' || method === 'GET')) {
          const cookieHeader = req.headers['cookie'];
          const match = cookieHeader?.match(/(?:^|;\s*)vinyldns_session=([^;]+)/);
          if (match) sessions.delete(match[1]);

          const clearCookie = 'vinyldns_session=; Path=/; HttpOnly; Max-Age=0';
          const oidcLogout = getConfig().oidc.logoutEndpoint;

          if (getConfig().oidc.enabled && oidcLogout) {
            // Redirect to Azure AD logout, which will redirect back to our login page
            res.writeHead(302, {
              'Set-Cookie': clearCookie,
              'Location':   oidcLogout,
            });
            res.end();
          } else {
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Set-Cookie': clearCookie,
            });
            res.end(JSON.stringify({ ok: true }));
          }
          return;
        }

        // ── POST /regenerate-creds ─────────────────────────────────────────
        if (path === '/regenerate-creds' && method === 'POST') {
          const session = getSession(req.headers['cookie']);
          if (!session) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not authenticated' }));
            return;
          }
          try {
            const { accessKey, secretKey } = await updateUserCredentials(session.username);
            session.accessKey = accessKey;
            session.secretKey = secretKey;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch (err) {
            console.error('[hmac-proxy] regenerate-creds error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to regenerate credentials' }));
          }
          return;
        }

        // ── GET /download-creds-file/:filename ─────────────────────────────
        if (method === 'GET' && path.startsWith('/download-creds-file/')) {
          const session = getSession(req.headers['cookie']);
          if (!session) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not authenticated' }));
            return;
          }
          const fileName = path.slice('/download-creds-file/'.length);
          const apiUrl = `http://localhost:${getConfig().api.port}`;
          const csv = `NT ID, access key, secret key,api url\n${session.username},${session.accessKey},${session.secretKey},${apiUrl}`;
          res.writeHead(200, {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${fileName}"`,
          });
          res.end(csv);
          return;
        }

        // ── GET /users/currentuser ─────────────────────────────────────────
        // This is a portal-only endpoint (not in the VinylDNS API).
        // Return the signed-in user's profile from the session.
        if (path === '/users/currentuser' && method === 'GET') {
          const session = getSession(req.headers['cookie']);
          if (!session) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not authenticated' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            id:          session.userId,
            userName:    session.username,
            firstName:   session.firstName  ?? null,
            lastName:    session.lastName   ?? null,
            email:       session.email      ?? null,
            isSuper:     session.isSuper,
            isSupport:   session.isSupport,
            lockStatus:  session.lockStatus,
          }));
          return;
        }


        // Only intercept genuine API calls, not browser page navigations.
        // Browser navigations have Accept: text/html,...  (user typed /groups in URL bar)
        // Axios / fetch API calls have Accept: application/json,...
        const accept = (req.headers['accept'] ?? '').toLowerCase();
        const isBrowserNavigation = accept.startsWith('text/html');
        const isApiPath = API_PREFIXES.some((prefix) => path.startsWith(prefix));

        if (!isApiPath || isBrowserNavigation) {
          next();
          return;
        }

        const session = getSession(req.headers['cookie']);
        if (!session) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not authenticated' }));
          return;
        }

        try {
          const bodyBuf = await readBody(req);

          // ── /users/lookupuser/:username  (portal-only, mirrors old VinylDNS.scala) ──
          // Strategy (same as old portal's getUserDataByUsername):
          //   1. Try MySQL   – user already exists (has logged in before)
          //   2. Try LDAP    – user exists in directory but hasn't logged in yet → create in MySQL
          //   3. Return 404  – truly unknown user
          const lookupMatch = path.match(/^\/users\/lookupuser\/(.+)$/);
          if (lookupMatch && method === 'GET') {
            const username = decodeURIComponent(lookupMatch[1]);
            let user = await getUserCredentials(username);
            if (!user) {
              console.log(`[hmac-proxy] lookupuser: '${username}' not in MySQL, trying LDAP…`);
              const ldapDetails = await ldapLookupUser(username);
              if (ldapDetails) {
                user = await createUser(ldapDetails);
                console.log(`[hmac-proxy] lookupuser: created VinylDNS account for '${username}'`);
              }
            }
            if (!user) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `User ${username} was not found` }));
              return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              id:         user.id,
              userName:   user.userName,
              firstName:  user.firstName  ?? null,
              lastName:   user.lastName   ?? null,
              email:      user.email      ?? null,
              isSuper:    user.isSuper,
              isSupport:  user.isSupport,
              lockStatus: user.lockStatus,
            }));
            return;
          }

          // Rewrite portal-specific paths to core-API equivalents (none remaining after above).
          const apiPath = path;

          const authHdrs  = buildAuthHeaders(method, apiPath, query, bodyBuf, session.accessKey, session.secretKey);

          // Check lock status from session (set at login time).
          // Mirrors VinylDnsAction.invokeBlock: locked users are rejected mid-session.
          if (session.lockStatus === 'Locked') {
            console.log(`[hmac-proxy] API request blocked – account '${session.username}' is locked.`);
            res.writeHead(403, { 'Content-Type': 'application/json' });
            (res as unknown as http.ServerResponse).end(JSON.stringify({
              error: `Authentication Failed: Account with username ${session.username} is locked`,
            }));
            return;
          }

          const forwardHeaders: Record<string, string> = {
            ...authHdrs,
            'content-type':   (req.headers['content-type'] as string) ?? 'application/json',
            'content-length': String(bodyBuf.length),
            'accept':         (req.headers['accept'] as string) ?? 'application/json',
          };

          const qs = query ? `?${query}` : '';
          console.log(`[hmac-proxy] → ${method} ${apiPath}${qs} (body: ${bodyBuf.length} bytes, user: ${session.username})`);

          proxyToApiWithLog(method, apiPath, query, forwardHeaders, bodyBuf, res as unknown as http.ServerResponse);
        } catch (err) {
          console.error('[hmac-proxy] proxy error:', err);
          if (!res.headersSent) res.writeHead(500);
          (res as unknown as http.ServerResponse).end(JSON.stringify({ error: 'Proxy error' }));
        }
      });
}