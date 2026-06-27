"use strict";
var GeonicDBModule = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/sdk/index.ts
  var index_exports = {};
  __export(index_exports, {
    AuthenticationError: () => AuthenticationError,
    AuthorizationError: () => AuthorizationError,
    ConflictError: () => ConflictError,
    GeonicDB: () => GeonicDB,
    GeonicDBError: () => GeonicDBError,
    NetworkError: () => NetworkError,
    NotFoundError: () => NotFoundError,
    RateLimitError: () => RateLimitError,
    ValidationError: () => ValidationError,
    buildPathWithParams: () => buildPathWithParams,
    default: () => index_default
  });

  // src/sdk/events.ts
  var EventEmitter = class {
    constructor() {
      __publicField(this, "_listeners", /* @__PURE__ */ Object.create(null));
    }
    on(event, callback) {
      if (!this._listeners[event]) {
        this._listeners[event] = [];
      }
      this._listeners[event].push(callback);
      return this;
    }
    off(event, callback) {
      if (!this._listeners[event]) return this;
      if (!callback) {
        delete this._listeners[event];
      } else {
        this._listeners[event] = this._listeners[event].filter(
          (cb) => cb !== callback
        );
      }
      return this;
    }
    emit(event, data) {
      const cbs = this._listeners[event];
      if (!cbs) return;
      const snapshot = cbs.slice();
      for (const cb of snapshot) {
        try {
          cb(data);
        } catch {
        }
      }
    }
  };

  // src/sdk/constants.ts
  var DEFAULT_TOKEN_TTL_SEC = 3600;
  var TOKEN_REFRESH_LEEWAY_MS = 12e4;
  var TOKEN_REFRESH_MIN_MS = 1e4;
  var RECONNECT_MAX_ATTEMPTS = 10;
  var RECONNECT_BASE_MS = 1e3;
  var RECONNECT_MAX_DELAY_MS = 3e4;
  var SUB_PROTOCOL = "access_token";
  var SDK_CACHE_MAX_ENTRIES_DEFAULT = 1e3;
  var SDK_POLL_INTERVAL_MS_DEFAULT = 5e3;
  var DPOP_IDB_NAME = "geonicdb-sdk";
  var DPOP_IDB_STORE = "dpop-sessions";
  var DPOP_IDB_VERSION = 1;

  // src/sdk/dpop.ts
  var dpopSupported = typeof crypto !== "undefined" && !!crypto.subtle && !!crypto.subtle.generateKey;
  var dpopPersistenceSupported = typeof globalThis.indexedDB !== "undefined" && typeof structuredClone !== "undefined";
  function b64url(buf) {
    const arr = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    let str = "";
    for (let i = 0; i < arr.length; i++) {
      str += String.fromCharCode(arr[i]);
    }
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function strToUint8(s) {
    return new TextEncoder().encode(s);
  }
  async function generateDPoPKeyPair() {
    if (!dpopSupported) return null;
    const kp = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
    const pubJwk = await crypto.subtle.exportKey(
      "jwk",
      kp.publicKey
    );
    return {
      privateKey: kp.privateKey,
      publicJwk: {
        kty: pubJwk.kty,
        crv: pubJwk.crv,
        x: pubJwk.x,
        y: pubJwk.y
      }
    };
  }
  async function createDPoPProof(keyPair, htm, htu, accessToken, nonce) {
    if (!keyPair) return null;
    const header = { alg: "ES256", typ: "dpop+jwt", jwk: keyPair.publicJwk };
    const payload = {
      jti: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2),
      htm,
      htu,
      iat: Math.floor(Date.now() / 1e3)
    };
    if (nonce) payload.nonce = nonce;
    if (accessToken) {
      const hash = await crypto.subtle.digest("SHA-256", strToUint8(accessToken));
      payload.ath = b64url(hash);
    }
    const headerB64 = b64url(strToUint8(JSON.stringify(header)));
    const payloadB64 = b64url(strToUint8(JSON.stringify(payload)));
    const signingInput = headerB64 + "." + payloadB64;
    const sigBuf = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      keyPair.privateKey,
      strToUint8(signingInput)
    );
    return signingInput + "." + b64url(new Uint8Array(sigBuf));
  }
  function openSessionDB() {
    return new Promise((resolve, reject) => {
      const req = globalThis.indexedDB.open(DPOP_IDB_NAME, DPOP_IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DPOP_IDB_STORE)) {
          db.createObjectStore(DPOP_IDB_STORE);
        }
      };
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(req.error ?? new Error("IndexedDB open failed"));
      };
    });
  }
  async function saveDPoPSession(session) {
    if (!dpopPersistenceSupported) return false;
    let db = null;
    try {
      db = await openSessionDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DPOP_IDB_STORE, "readwrite");
        tx.objectStore(DPOP_IDB_STORE).put(session, session.tenant);
        tx.oncomplete = () => {
          resolve();
        };
        tx.onerror = () => {
          reject(tx.error ?? new Error("IndexedDB put failed"));
        };
        tx.onabort = () => {
          reject(tx.error ?? new Error("IndexedDB transaction aborted"));
        };
      });
      return true;
    } catch {
      return false;
    } finally {
      db?.close();
    }
  }
  async function loadDPoPSession(tenant) {
    if (!dpopPersistenceSupported) return null;
    let db = null;
    try {
      db = await openSessionDB();
      const data = await new Promise((resolve, reject) => {
        const tx = db.transaction(DPOP_IDB_STORE, "readonly");
        const req = tx.objectStore(DPOP_IDB_STORE).get(tenant);
        req.onsuccess = () => {
          resolve(req.result);
        };
        req.onerror = () => {
          reject(req.error ?? new Error("IndexedDB get failed"));
        };
      });
      return validatePersistedSession(data);
    } catch {
      return null;
    } finally {
      db?.close();
    }
  }
  async function clearDPoPSession(tenant) {
    if (!dpopPersistenceSupported) return;
    let db = null;
    try {
      db = await openSessionDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DPOP_IDB_STORE, "readwrite");
        tx.objectStore(DPOP_IDB_STORE).delete(tenant);
        tx.oncomplete = () => {
          resolve();
        };
        tx.onerror = () => {
          reject(tx.error ?? new Error("IndexedDB delete failed"));
        };
        tx.onabort = () => {
          reject(tx.error ?? new Error("IndexedDB transaction aborted"));
        };
      });
    } catch {
    } finally {
      db?.close();
    }
  }
  function validatePersistedSession(data) {
    if (!data || typeof data !== "object") return null;
    const s = data;
    const kp = s.keyPair;
    if (typeof s.tenant !== "string" || typeof s.accessToken !== "string" || typeof s.refreshToken !== "string" || typeof s.expiresAt !== "number" || !kp || !kp.privateKey || !kp.publicJwk) {
      return null;
    }
    return data;
  }

  // src/sdk/pow.ts
  var BATCH_SIZE = 1e3;
  var MAX_ITERATIONS = 1e6;
  function checkZeros(hash, bits) {
    const fullBytes = Math.floor(bits / 8);
    const remainBits = bits % 8;
    for (let k = 0; k < fullBytes; k++) {
      if (hash[k] !== 0) return false;
    }
    if (remainBits > 0) {
      const mask = 255 << 8 - remainBits;
      if ((hash[fullBytes] & mask) !== 0) return false;
    }
    return true;
  }
  async function solvePoW(challenge, difficulty) {
    if (!Number.isInteger(difficulty) || difficulty < 0 || difficulty > 256) {
      throw new Error("difficulty must be an integer between 0 and 256");
    }
    const encoder = new TextEncoder();
    let i = 0;
    async function tryBatch() {
      const batchEnd = Math.min(i + BATCH_SIZE, MAX_ITERATIONS);
      const promises = [];
      for (; i < batchEnd; i++) {
        const idx = i;
        promises.push(
          crypto.subtle.digest("SHA-256", encoder.encode(challenge + String(idx))).then((buf) => ({ idx, hash: new Uint8Array(buf) }))
        );
      }
      const results = await Promise.all(promises);
      for (const result of results) {
        if (checkZeros(result.hash, difficulty)) {
          return result.idx;
        }
      }
      if (i >= MAX_ITERATIONS) throw new Error("PoW solution not found");
      return tryBatch();
    }
    return tryBatch();
  }

  // src/sdk/errors.ts
  var GeonicDBError = class extends Error {
    constructor(message, statusCode = 0) {
      super(message);
      /** HTTP status code (if applicable) */
      __publicField(this, "statusCode");
      this.name = "GeonicDBError";
      this.statusCode = statusCode;
    }
  };
  var AuthenticationError = class extends GeonicDBError {
    constructor(message = "Authentication failed") {
      super(message, 401);
      this.name = "AuthenticationError";
    }
  };
  var AuthorizationError = class extends GeonicDBError {
    constructor(message = "Access denied") {
      super(message, 403);
      this.name = "AuthorizationError";
    }
  };
  var NotFoundError = class extends GeonicDBError {
    constructor(message = "Not found") {
      super(message, 404);
      this.name = "NotFoundError";
    }
  };
  var ConflictError = class extends GeonicDBError {
    constructor(message = "Conflict") {
      super(message, 409);
      this.name = "ConflictError";
    }
  };
  var ValidationError = class extends GeonicDBError {
    constructor(message = "Validation failed") {
      super(message, 422);
      this.name = "ValidationError";
    }
  };
  var RateLimitError = class extends GeonicDBError {
    constructor(message = "Rate limit exceeded", retryAfter = 1) {
      super(message, 429);
      /** Seconds to wait before retrying (from Retry-After header) */
      __publicField(this, "retryAfter");
      this.name = "RateLimitError";
      this.retryAfter = retryAfter;
    }
  };
  var NetworkError = class extends GeonicDBError {
    constructor(message = "Network error") {
      super(message, 0);
      this.name = "NetworkError";
    }
  };
  function createErrorFromResponse(status, body, fallbackMessage) {
    const message = body.detail || body.description || fallbackMessage;
    switch (status) {
      case 401:
        return new AuthenticationError(message);
      case 403:
        return new AuthorizationError(message);
      case 404:
        return new NotFoundError(message);
      case 409:
        return new ConflictError(message);
      case 422:
        return new ValidationError(message);
      case 429:
        return new RateLimitError(message);
      default:
        return new GeonicDBError(message, status);
    }
  }

  // src/sdk/cache.ts
  var SdkCache = class {
    constructor(maxEntries = SDK_CACHE_MAX_ENTRIES_DEFAULT) {
      __publicField(this, "_store", /* @__PURE__ */ new Map());
      __publicField(this, "_maxEntries");
      if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
        throw new Error(`SdkCache maxEntries must be a positive integer, got ${String(maxEntries)}`);
      }
      this._maxEntries = maxEntries;
    }
    /** Build a stable cache key. Method is upper-cased so casing differences do not produce duplicate entries. */
    static keyFor(method, path) {
      return `${method.toUpperCase()}:${path}`;
    }
    /** Returns the entry and bumps it to most-recent position, or `undefined`. */
    get(key) {
      const entry = this._store.get(key);
      if (!entry) return void 0;
      this._store.delete(key);
      this._store.set(key, entry);
      return entry;
    }
    /** Insert or replace an entry. Evicts the LRU entry when over capacity. */
    set(key, entry) {
      if (this._store.has(key)) {
        this._store.delete(key);
      }
      this._store.set(key, entry);
      while (this._store.size > this._maxEntries) {
        const oldest = this._store.keys().next().value;
        if (oldest === void 0) break;
        this._store.delete(oldest);
      }
    }
    /** Delete a specific entry. Returns whether anything was removed. */
    delete(key) {
      return this._store.delete(key);
    }
    /**
     * Delete every entry whose key matches a predicate. Returns the array of
     * removed keys so callers can emit `cacheInvalidated` events.
     */
    deleteWhere(predicate) {
      const removed = [];
      for (const [key, entry] of this._store) {
        if (predicate(key, entry)) {
          this._store.delete(key);
          removed.push(key);
        }
      }
      return removed;
    }
    /** Drop everything. */
    clear() {
      this._store.clear();
    }
    /** Current entry count. Useful for tests / metrics. */
    size() {
      return this._store.size;
    }
  };
  var HEADERS_TO_PERSIST = [
    "content-type",
    "etag",
    "last-modified",
    "cache-control",
    "vary",
    "link",
    "ngsild-results-count",
    "fiware-total-count",
    "x-total-count",
    "ngsild-next",
    "fiware-next-token"
  ];
  function snapshotHeaders(headers) {
    const out = {};
    for (const name of HEADERS_TO_PERSIST) {
      const value = headers.get(name);
      if (value !== null) out[name] = value;
    }
    return out;
  }
  function isCacheableMethod(method) {
    const upper = method.toUpperCase();
    return upper === "GET" || upper === "HEAD";
  }

  // src/sdk/auth.ts
  var _AuthManager = class _AuthManager {
    constructor(baseUrl, apiKey, tenant, debug = false, anonymous = false) {
      __publicField(this, "_baseUrl");
      __publicField(this, "_apiKey");
      __publicField(this, "_tenant");
      __publicField(this, "_debug");
      /**
       * #1105: anonymous モード。true の場合、トークンを取得せず Authorization
       * ヘッダ無しで送信する。サーバー側 (`optionalAuth`) で role='anonymous' として
       * 通り、XACML が認可判定する。
       *
       * `_initialAnonymous` はコンストラクタで指定された希望モード (immutable)。
       * `_anonymous` は現在のモード状態で、`login()` / `setCredentials()` で false
       * に降り、`logout()` で `_initialAnonymous` の値に戻る。
       *
       * トークン有無 (`_token === null`) からは推論しない。`_token` は refresh
       * 失敗時に null へ落ちるが、ユーザが明示的に `logout()` していない以上、
       * 次のリクエストを勝手に Authorization ヘッダ無しで送ってはならない
       * (#1113 review)。
       */
      __publicField(this, "_initialAnonymous");
      __publicField(this, "_anonymous");
      __publicField(this, "_token", null);
      __publicField(this, "_tokenExpiry", 0);
      __publicField(this, "_tokenType", "Bearer");
      __publicField(this, "_refreshToken", null);
      __publicField(this, "_dpopKeyPair", null);
      __publicField(this, "_dpopReady", null);
      __publicField(this, "_dpopNonce", null);
      /**
       * #1230: when true, every DPoP token mutation (login bind, refresh) is
       * mirrored to IndexedDB so the session survives a page reload. Toggled
       * by `login({ dpopPersist: true })` and `restoreSession()`.
       */
      __publicField(this, "_dpopPersist", false);
      /** Email captured at login, persisted for UI display. */
      __publicField(this, "_email", null);
      __publicField(this, "_tokenPromise", null);
      /** Callback to emit tokenRefresh events. Set by GeonicDB class. */
      __publicField(this, "onTokenRefresh", null);
      /**
       * SDK-level cache (#991 Phase A). When set, cacheable GET requests are
       * served via ETag/304 with automatic If-None-Match negotiation, and
       * concurrent requests to the same path are deduplicated.
       */
      __publicField(this, "_cache", null);
      /** Emitter for cacheHit / cacheMiss / cacheInvalidated events. */
      __publicField(this, "_emitCacheEvent", null);
      /** In-flight request map keyed by `${METHOD}:${path}` for request deduplication. */
      __publicField(this, "_inFlight", /* @__PURE__ */ new Map());
      if (anonymous && apiKey) {
        throw new Error(
          "GeonicDB SDK: `anonymous: true` cannot be combined with `apiKey`. Anonymous mode skips token acquisition entirely."
        );
      }
      this._baseUrl = baseUrl;
      this._apiKey = apiKey;
      this._tenant = tenant;
      this._debug = debug;
      this._initialAnonymous = anonymous;
      this._anonymous = anonymous;
      if (!anonymous && dpopSupported) {
        this._dpopReady = generateDPoPKeyPair().then((kp) => {
          if (!this._dpopKeyPair) this._dpopKeyPair = kp;
        }).catch(() => {
          if (!this._dpopKeyPair) this._dpopKeyPair = null;
        });
      }
    }
    /**
     * True when running unauthenticated.
     *
     * Returns the explicit mode flag, NOT derived from `_token === null`. After
     * a refresh failure clears `_token`, the SDK must NOT silently switch to
     * anonymous; the caller must explicitly `logout()` to revert (#1113 review).
     */
    isAnonymous() {
      return this._anonymous;
    }
    _log(...args) {
      if (this._debug) console.log("[GeonicDB]", ...args);
    }
    /** Wire an SdkCache instance (called by GeonicDB constructor when caching is enabled). */
    setCache(cache) {
      this._cache = cache;
    }
    /** Provide the cache event emitter (forwarded to the GeonicDB EventEmitter). */
    setCacheEventEmitter(emitter) {
      this._emitCacheEvent = emitter;
    }
    /** Expose the cache for invalidation (e.g. WebSocket entity events). */
    getCache() {
      return this._cache;
    }
    /** Emit a cache event if a listener is wired. */
    emitCacheEvent(name, payload) {
      this._emitCacheEvent?.(name, payload);
    }
    /**
     * Login with email and password (Bearer JWT).
     *
     * Pass `{ dpop: true }` to immediately exchange the Bearer session for a
     * DPoP sender-constrained session via `/auth/dpop-bind` (RFC 9449). The
     * returned tokens become unusable without this SDK instance's
     * non-extractable private key, so a token leaked from storage (e.g.
     * localStorage XSS) cannot be replayed from another origin.
     */
    async login(email, password, options) {
      this._log("login", email);
      const wantsDpopPersist = options?.dpopPersist === true;
      if (wantsDpopPersist && !options?.dpop) {
        throw new AuthenticationError(
          "dpopPersist: true requires dpop: true. Persisting Bearer tokens is the caller's responsibility (localStorage / sessionStorage)."
        );
      }
      const headers = {
        "Content-Type": "application/json"
      };
      if (this._tenant) headers["NGSILD-Tenant"] = this._tenant;
      const res = await fetch(this._baseUrl + "/auth/login", {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new AuthenticationError(
          e.detail || e.description || "Login failed: " + res.status
        );
      }
      const data = await res.json();
      this._anonymous = false;
      this._token = data.accessToken;
      this._tokenExpiry = Date.now() + (data.expiresIn - 60) * 1e3;
      this._tokenType = "Bearer";
      this._refreshToken = data.refreshToken;
      this._email = email;
      this._dpopPersist = wantsDpopPersist;
      this._invalidateAuthScopedState();
      if (options?.dpop) {
        const bound = await this._bindDpopSession();
        if (this._dpopPersist) {
          await this._persistDpopSession();
        }
        return bound;
      }
      return data;
    }
    /**
     * Exchange the current Bearer session for a DPoP-bound session via
     * `POST /auth/dpop-bind` (RFC 9449). The server re-issues access and
     * refresh tokens with `cnf.jkt` matching this SDK's DPoP key pair.
     *
     * Assumes `_token` / `_refreshToken` are already populated by a prior
     * `login()` call (callers should not invoke this directly).
     *
     * @internal
     */
    async _bindDpopSession() {
      if (!this._token) {
        throw new AuthenticationError(
          "Cannot bind DPoP session: no Bearer token. login() must succeed first."
        );
      }
      if (this._dpopReady) await this._dpopReady;
      if (!this._dpopKeyPair) {
        throw new AuthenticationError(
          "DPoP binding requires a generated DPoP key pair, but key generation was unavailable or failed. DPoP requires Web Crypto subtle.generateKey."
        );
      }
      const bindUrl = this._baseUrl + "/auth/dpop-bind";
      const accessToken = this._token;
      const data = await this._doDpopBind(bindUrl, accessToken, this._dpopNonce, 0);
      this._token = data.accessToken;
      this._tokenExpiry = Date.now() + (data.expiresIn - 60) * 1e3;
      this._tokenType = "DPoP";
      this._refreshToken = data.refreshToken;
      this._invalidateAuthScopedState();
      return { ...data, tokenType: "DPoP" };
    }
    async _doDpopBind(bindUrl, accessToken, dpopNonce, retryCount) {
      const dpopProof = await createDPoPProof(
        this._dpopKeyPair,
        "POST",
        bindUrl,
        accessToken,
        dpopNonce
      );
      if (!dpopProof) {
        throw new AuthenticationError("DPoP proof generation failed");
      }
      const headers = {
        "Content-Type": "application/json",
        Authorization: "Bearer " + accessToken,
        DPoP: dpopProof
      };
      if (this._tenant) headers["NGSILD-Tenant"] = this._tenant;
      const res = await fetch(bindUrl, { method: "POST", headers });
      const serverNonce = res.headers.get("DPoP-Nonce");
      if (serverNonce) this._dpopNonce = serverNonce;
      if (res.status === 401 && serverNonce && serverNonce !== dpopNonce && retryCount < _AuthManager.MAX_DPOP_RETRIES) {
        return this._doDpopBind(bindUrl, accessToken, serverNonce, retryCount + 1);
      }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new AuthenticationError(
          e.detail || e.description || "DPoP bind failed: " + res.status
        );
      }
      return await res.json();
    }
    /**
     * Set credentials externally (e.g. from a login API response).
     * When tokenType is 'Bearer' and refreshToken is provided, all subsequent
     * API calls and connect() bypass DPoP/PoW entirely.
     */
    setCredentials(opts) {
      if (!opts || !opts.token) throw new Error("token is required");
      if (this._initialAnonymous && opts.tokenType === "DPoP") {
        throw new Error(
          "DPoP credentials cannot be set on an SDK instance constructed with `anonymous: true` (no DPoP key pair is generated for anonymous instances). Use Bearer credentials, or construct the SDK in non-anonymous mode."
        );
      }
      this._anonymous = false;
      this._token = opts.token;
      this._tokenType = opts.tokenType || "Bearer";
      this._tokenExpiry = opts.expiresIn != null ? Date.now() + (opts.expiresIn - 60) * 1e3 : Date.now() + DEFAULT_TOKEN_TTL_SEC * 1e3;
      this._refreshToken = opts.refreshToken || null;
      this._tokenPromise = null;
      this._invalidateAuthScopedState();
    }
    /** Clear all credentials. */
    logout() {
      this._token = null;
      this._tokenExpiry = 0;
      this._refreshToken = null;
      this._tokenPromise = null;
      this._email = null;
      if (this._dpopPersist && this._tenant) {
        void clearDPoPSession(this._tenant);
      }
      this._dpopPersist = false;
      this._anonymous = this._initialAnonymous;
      this._invalidateAuthScopedState();
    }
    /**
     * Restore a DPoP session previously persisted via `login({ dpop: true,
     * dpopPersist: true })`. Returns true if a usable session was found and
     * loaded into the SDK, false otherwise (no entry, IndexedDB unavailable,
     * or the entry was for a different tenant).
     *
     * After a successful restore the SDK behaves as if `login()` had just
     * succeeded: tokens are set, the DPoP key pair is rehydrated as a
     * non-extractable `CryptoKey`, and subsequent requests automatically
     * carry a fresh DPoP proof. Token refresh continues to flow through
     * `/auth/refresh` and emits `tokenRefresh` events as usual.
     *
     * Token expiry is NOT validated here — the next `ensureToken()` call will
     * trigger a refresh if the access token has expired (#1230). An expired
     * refresh token will manifest as an `AuthenticationError` from that
     * refresh attempt; consumers should treat such errors as "session ended,
     * fall back to login()".
     */
    async restoreSession() {
      if (this._initialAnonymous) return false;
      if (!this._tenant) return false;
      const persisted = await loadDPoPSession(this._tenant);
      if (!persisted) return false;
      if (persisted.tenant !== this._tenant) return false;
      this._anonymous = false;
      this._token = persisted.accessToken;
      this._refreshToken = persisted.refreshToken;
      this._tokenExpiry = persisted.expiresAt;
      this._tokenType = "DPoP";
      this._dpopKeyPair = persisted.keyPair;
      this._dpopReady = Promise.resolve();
      this._dpopNonce = null;
      this._dpopPersist = true;
      this._email = persisted.email ?? null;
      this._tokenPromise = null;
      this._invalidateAuthScopedState();
      return true;
    }
    /**
     * Whether this AuthManager currently has DPoP persistence enabled.
     * Exposed for the `GeonicDB` wrapper to advertise behavior; internal
     * consumers should read `_dpopPersist` directly.
     */
    isDpopPersisted() {
      return this._dpopPersist;
    }
    /**
     * Persist the current DPoP session to IndexedDB. Best-effort: a failed
     * write is logged in debug mode but never propagated, since persistence
     * is purely a UX optimization.
     *
     * @internal
     */
    async _persistDpopSession() {
      if (!this._dpopPersist || !this._tenant || !this._dpopKeyPair || !this._token || !this._refreshToken) {
        return;
      }
      const ok = await saveDPoPSession({
        tenant: this._tenant,
        accessToken: this._token,
        refreshToken: this._refreshToken,
        expiresAt: this._tokenExpiry,
        email: this._email ?? void 0,
        keyPair: this._dpopKeyPair
      });
      if (!ok) this._log("DPoP session persistence failed (IndexedDB unavailable?)");
    }
    /**
     * Drop everything that may have been associated with the previous auth
     * context. Called on `login()` (after token assignment), `setCredentials()`,
     * and `logout()`. Without this, a cached body or in-flight Response from
     * user A could be returned to user B after a credentials swap.
     */
    _invalidateAuthScopedState() {
      this._cache?.clear();
      this._inFlight.clear();
    }
    /**
     * Ensure a valid token is available, refreshing or acquiring as needed.
     *
     * #1105: In anonymous mode (no apiKey, no Bearer credentials) this throws
     * `AuthenticationError`. Callers that may run anonymously should branch on
     * `isAnonymous()` first instead of calling `ensureToken()` blindly.
     */
    async ensureToken() {
      if (this._token && Date.now() < this._tokenExpiry) {
        return this._token;
      }
      if (this._tokenPromise) {
        return this._tokenPromise;
      }
      if (this._refreshToken) {
        this._tokenPromise = this._refreshBearerToken();
        return this._tokenPromise;
      }
      if (this._anonymous) {
        throw new AuthenticationError(
          "Anonymous mode: no token available. Call login() or setCredentials() to authenticate."
        );
      }
      if (!this._apiKey) {
        throw new AuthenticationError(
          "No authentication method available. Call login() / setCredentials() to authenticate, or construct the SDK with an apiKey."
        );
      }
      this._tokenPromise = this._acquireTokenViaPow();
      return this._tokenPromise;
    }
    async _refreshBearerToken() {
      this._log("refreshing token (type=%s)", this._tokenType);
      try {
        const isDPoP = this._tokenType === "DPoP";
        const refreshUrl = this._baseUrl + "/auth/refresh";
        const body = JSON.stringify({ refreshToken: this._refreshToken });
        const res = isDPoP ? await this._doDpopRefresh(refreshUrl, body, this._dpopNonce, 0) : await fetch(refreshUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body
        });
        if (!res.ok) {
          this._refreshToken = null;
          this._token = null;
          this._tokenPromise = null;
          throw new AuthenticationError("Token refresh failed: " + res.status);
        }
        const data = await res.json();
        this._token = data.accessToken;
        this._tokenExpiry = Date.now() + (data.expiresIn - 60) * 1e3;
        this._tokenType = data.tokenType ?? (isDPoP ? "DPoP" : "Bearer");
        this._refreshToken = data.refreshToken;
        this._tokenPromise = null;
        this.onTokenRefresh?.({
          token: this._token,
          tokenType: this._tokenType,
          expiresIn: data.expiresIn,
          refreshToken: this._refreshToken
        });
        if (this._dpopPersist) void this._persistDpopSession();
        return this._token;
      } catch (err) {
        this._tokenPromise = null;
        throw err;
      }
    }
    /**
     * Perform a DPoP-bound `/auth/refresh` call with the standard RFC 9449 §8
     * `use_dpop_nonce` retry handshake.
     *
     * @internal
     */
    async _doDpopRefresh(refreshUrl, body, dpopNonce, retryCount) {
      if (this._dpopReady) await this._dpopReady;
      if (!this._dpopKeyPair) {
        throw new AuthenticationError(
          "DPoP-bound refresh requires a DPoP key pair, but key generation was unavailable."
        );
      }
      const proof = await createDPoPProof(
        this._dpopKeyPair,
        "POST",
        refreshUrl,
        null,
        dpopNonce
      );
      if (!proof) {
        throw new AuthenticationError("DPoP proof generation failed");
      }
      const res = await fetch(refreshUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", DPoP: proof },
        body
      });
      const serverNonce = res.headers.get("DPoP-Nonce");
      if (serverNonce) this._dpopNonce = serverNonce;
      if (res.status === 401 && serverNonce && serverNonce !== dpopNonce && retryCount < _AuthManager.MAX_DPOP_RETRIES) {
        return this._doDpopRefresh(refreshUrl, body, serverNonce, retryCount + 1);
      }
      return res;
    }
    /* istanbul ignore next: PoW + DPoP token-exchange flow is exercised by E2E
       against a live server. Unit-mocking each fetch + crypto step would not
       verify the actual nonce/proof exchange. */
    async _acquireTokenViaPow() {
      try {
        if (this._dpopReady) await this._dpopReady;
        const nonceRes = await fetch(this._baseUrl + "/auth/nonce", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: this._apiKey })
        });
        if (!nonceRes.ok)
          throw new AuthenticationError("Nonce request failed: " + nonceRes.status);
        const nonceData = await nonceRes.json();
        if (nonceData.dpop_nonce) this._dpopNonce = nonceData.dpop_nonce;
        const proof = await solvePoW(nonceData.challenge, nonceData.difficulty);
        const tokenUrl = this._baseUrl + "/oauth/token";
        const tokenBody = JSON.stringify({
          grant_type: "api_key",
          api_key: this._apiKey,
          nonce: nonceData.nonce,
          proof: String(proof)
        });
        const res = await this._doTokenExchange(tokenUrl, tokenBody, this._dpopNonce);
        if (!res.ok)
          throw new AuthenticationError("Token request failed: " + res.status);
        const newNonce = res.headers.get("DPoP-Nonce");
        if (newNonce) this._dpopNonce = newNonce;
        const data = await res.json();
        this._token = data.access_token;
        this._tokenExpiry = Date.now() + (data.expires_in - 60) * 1e3;
        this._tokenType = data.token_type || "Bearer";
        this._tokenPromise = null;
        return this._token;
      } catch (err) {
        this._tokenPromise = null;
        throw err;
      }
    }
    /* istanbul ignore next: DPoP nonce-retry handshake (RFC 9449 §8) — requires
       a real server emitting `use_dpop_nonce` 400s. Exercised by E2E. */
    async _doTokenExchange(tokenUrl, tokenBody, dpopNonce, retryCount = 0) {
      const reqHeaders = {
        "Content-Type": "application/json"
      };
      const dpopProof = await createDPoPProof(
        this._dpopKeyPair,
        "POST",
        tokenUrl,
        null,
        dpopNonce
      );
      if (dpopProof) reqHeaders["DPoP"] = dpopProof;
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: reqHeaders,
        body: tokenBody
      });
      if (res.status === 400 && this._dpopKeyPair) {
        const errBody = await res.json().catch(() => ({}));
        if (errBody.error === "use_dpop_nonce") {
          const serverNonce = res.headers.get("DPoP-Nonce");
          if (serverNonce && serverNonce !== dpopNonce && retryCount < _AuthManager.MAX_DPOP_RETRIES) {
            this._dpopNonce = serverNonce;
            return this._doTokenExchange(tokenUrl, tokenBody, serverNonce, retryCount + 1);
          }
        }
        throw new GeonicDBError(
          "Token request failed: " + (errBody.error_description || errBody.error),
          400
        );
      }
      return res;
    }
    /**
     * Make an authenticated HTTP request with automatic token refresh and DPoP.
     *
     * When the SDK cache is enabled and the request is cacheable
     * (GET / HEAD without a body), this method:
     *   - Sends `If-None-Match` / `If-Modified-Since` derived from a previously
     *     cached entry, if any.
     *   - Returns the cached body wrapped in a synthesized `200` Response when
     *     the server replies `304 Not Modified`.
     *   - Persists fresh `200` responses (with their ETag/Last-Modified) into
     *     the cache.
     *   - Deduplicates concurrent in-flight requests to the same path.
     */
    async request(method, path, body) {
      this._log(method, path);
      if (!this._cache || !isCacheableMethod(method) || body !== void 0) {
        const token = this.isAnonymous() ? null : await this.ensureToken();
        const res = await this._doAuthenticatedRequest(method, path, body, token);
        this._log(method, path, "\u2192", res.status);
        return res;
      }
      const key = SdkCache.keyFor(method, path);
      const inFlight = this._inFlight.get(key);
      if (inFlight) {
        return inFlight.then((res) => res.clone());
      }
      const promise = this._cachedRequest(method, path, key);
      this._inFlight.set(key, promise);
      try {
        return await promise;
      } finally {
        this._inFlight.delete(key);
      }
    }
    async _cachedRequest(method, path, key) {
      const cache = this._cache;
      if (!cache) {
        const token2 = this.isAnonymous() ? null : await this.ensureToken();
        return this._doAuthenticatedRequest(method, path, void 0, token2);
      }
      const cached = cache.get(key);
      const conditional = {};
      if (cached?.etag) conditional["If-None-Match"] = cached.etag;
      if (cached?.lastModified) conditional["If-Modified-Since"] = cached.lastModified;
      const token = this.isAnonymous() ? null : await this.ensureToken();
      const res = await this._doAuthenticatedRequest(method, path, void 0, token, 0, conditional);
      this._log(method, path, "\u2192", res.status);
      if (res.status === 304 && cached) {
        const refreshedHeaders = { ...cached.headers, ...snapshotHeaders(res.headers) };
        const refreshedEtag = res.headers.get("etag") ?? cached.etag;
        const refreshedLastModified = res.headers.get("last-modified") ?? cached.lastModified;
        cache.set(key, {
          ...cached,
          etag: refreshedEtag,
          lastModified: refreshedLastModified,
          headers: refreshedHeaders,
          cachedAt: Date.now()
        });
        this.emitCacheEvent("cacheHit", { key, path });
        const body = typeof cached.data === "string" ? cached.data : JSON.stringify(cached.data);
        return new Response(body, { status: 200, headers: refreshedHeaders });
      }
      if (res.status === 200) {
        const etag = res.headers.get("etag") ?? void 0;
        const lastModified = res.headers.get("last-modified") ?? void 0;
        if (etag || lastModified) {
          const text = await res.clone().text();
          let data = text;
          try {
            data = JSON.parse(text);
          } catch {
          }
          cache.set(key, {
            etag,
            lastModified,
            data,
            headers: snapshotHeaders(res.headers),
            cachedAt: Date.now()
          });
          this.emitCacheEvent("cacheMiss", { key, path });
        }
      }
      return res;
    }
    async _doAuthenticatedRequest(method, path, body, token, retryCount = 0, extraHeaders = {}) {
      if (this._tokenType === "DPoP" && token !== null) {
        if (this._dpopReady) await this._dpopReady;
        if (!this._dpopKeyPair) {
          throw new AuthenticationError(
            "DPoP credentials require a generated DPoP key pair, but key generation was unavailable or failed."
          );
        }
      }
      const url = this._baseUrl + path;
      const isDPoP = this._tokenType === "DPoP" && !!this._dpopKeyPair && token !== null;
      const bodyStr = body !== void 0 ? JSON.stringify(body) : void 0;
      const doRequest = async (reqToken, dpopNonce) => {
        const reqIsDPoP = this._tokenType === "DPoP" && !!this._dpopKeyPair && reqToken !== null;
        const dpopProof = reqIsDPoP ? await createDPoPProof(
          this._dpopKeyPair,
          method,
          url,
          reqToken,
          dpopNonce
        ) : null;
        const headers = {
          "Content-Type": "application/ld+json",
          Accept: "application/ld+json",
          ...extraHeaders
        };
        if (reqToken !== null) {
          headers["Authorization"] = (reqIsDPoP ? "DPoP " : "Bearer ") + reqToken;
        }
        if (dpopProof) headers["DPoP"] = dpopProof;
        if (this._tenant) headers["Fiware-Service"] = this._tenant;
        return fetch(url, { method, headers, body: bodyStr });
      };
      let currentToken = token;
      let res = await doRequest(currentToken, this._dpopNonce);
      const previousNonce = this._dpopNonce;
      const newNonce = res.headers.get("DPoP-Nonce");
      if (newNonce) this._dpopNonce = newNonce;
      const canRetry401 = currentToken !== null;
      if (res.status === 401 && isDPoP && newNonce && newNonce !== previousNonce) {
        res = await doRequest(currentToken, newNonce);
        const rn = res.headers.get("DPoP-Nonce");
        if (rn) this._dpopNonce = rn;
        if (res.status === 401 && canRetry401) {
          this._token = null;
          this._tokenPromise = null;
          currentToken = await this.ensureToken();
          res = await doRequest(currentToken, this._dpopNonce);
          const fn = res.headers.get("DPoP-Nonce");
          if (fn) this._dpopNonce = fn;
        }
      } else if (res.status === 401 && canRetry401) {
        this._token = null;
        this._tokenPromise = null;
        currentToken = await this.ensureToken();
        res = await doRequest(currentToken, this._dpopNonce);
        const rn = res.headers.get("DPoP-Nonce");
        if (rn) this._dpopNonce = rn;
      }
      if (res.status === 429 && retryCount < _AuthManager.MAX_REQUEST_RETRIES) {
        const retryNonce = res.headers.get("DPoP-Nonce");
        if (retryNonce) this._dpopNonce = retryNonce;
        const delay = parseInt(res.headers.get("Retry-After") || "1", 10) * 1e3;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this._doAuthenticatedRequest(method, path, body, currentToken, retryCount + 1, extraHeaders);
      }
      return res;
    }
  };
  __publicField(_AuthManager, "MAX_DPOP_RETRIES", 3);
  __publicField(_AuthManager, "MAX_REQUEST_RETRIES", 3);
  var AuthManager = _AuthManager;

  // src/sdk/websocket.ts
  var WebSocketManager = class {
    constructor(auth, baseUrl, tenant, emit, wsEndpointOverride) {
      __publicField(this, "_auth");
      __publicField(this, "_tenant");
      __publicField(this, "_wsEndpointOverride");
      __publicField(this, "_baseUrl");
      __publicField(this, "_emit");
      __publicField(this, "_ws", null);
      __publicField(this, "_wsEndpoint", null);
      __publicField(this, "_wsIntentionalClose", false);
      __publicField(this, "_reconnectAttempts", 0);
      __publicField(this, "_tokenRefreshTimer", null);
      __publicField(this, "_reconnectTimer", null);
      __publicField(this, "_subscription", null);
      __publicField(this, "_pendingSubscription", false);
      this._auth = auth;
      this._baseUrl = baseUrl;
      this._tenant = tenant;
      this._emit = emit;
      this._wsEndpointOverride = wsEndpointOverride || null;
    }
    _log(...args) {
      if (this._auth._debug) console.log("[GeonicDB:WS]", ...args);
    }
    /** Establish WebSocket connection (authentication is automatic). */
    async connect() {
      if (this._auth.isAnonymous()) {
        const err = new Error(
          "WebSocket connect() is not supported in anonymous mode. Authenticate via login() or setCredentials() before connect()."
        );
        this._emit("error", err);
        throw err;
      }
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }
      if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
        return;
      }
      this._wsIntentionalClose = false;
      this._reconnectAttempts = 0;
      try {
        const token = await this._auth.ensureToken();
        await this._openWebSocket(token);
      } catch (err) {
        this._emit("error", err);
      }
    }
    /** Force-reconnect (closes existing connection, preserves subscriptions). */
    async reconnect() {
      this._wsIntentionalClose = true;
      this._clearTimers();
      if (this._ws) {
        this._ws.close(1e3, "Client reconnect");
        this._ws = null;
      }
      return this.connect();
    }
    /** Disconnect WebSocket (does not fire 'disconnected' event). */
    disconnect() {
      this._wsIntentionalClose = true;
      this._clearTimers();
      this._subscription = null;
      this._pendingSubscription = false;
      if (this._ws) {
        this._ws.close(1e3, "Client disconnect");
        this._ws = null;
      }
    }
    /** Check if WebSocket is currently open. */
    isConnected() {
      return !!(this._ws && this._ws.readyState === WebSocket.OPEN);
    }
    /** Subscribe to entity events (can be called before or after connect). */
    subscribe(options) {
      const msg = { action: "subscribe" };
      if (options) {
        if (options.entityTypes) msg.entityTypes = options.entityTypes;
        if (options.idPattern) msg.idPattern = options.idPattern;
        if (options.scopeQ) msg.scopeQ = options.scopeQ;
      }
      this._subscription = msg;
      if (this._pendingSubscription) return;
      if (this._ws && this._ws.readyState === WebSocket.OPEN) {
        this._ws.send(JSON.stringify(msg));
      }
    }
    async _discoverWsEndpoint() {
      if (this._wsEndpointOverride) return this._wsEndpointOverride;
      if (this._wsEndpoint) return this._wsEndpoint;
      try {
        const res = await fetch(this._baseUrl + "/sdk/v1/streaming");
        if (res.ok) {
          const info = await res.json();
          if (info.enabled && info.endpoint) {
            this._wsEndpoint = info.endpoint;
            return this._wsEndpoint;
          }
        }
      } catch {
      }
      this._wsEndpoint = this._baseUrl.replace(/^http/, "ws");
      return this._wsEndpoint;
    }
    async _openWebSocket(token) {
      const endpoint = await this._discoverWsEndpoint();
      return new Promise((resolve, reject) => {
        const wsUrl = endpoint + (endpoint.indexOf("?") === -1 ? "?" : "&") + "tenant=" + encodeURIComponent(this._tenant);
        this._log("connecting", wsUrl);
        const ws = new WebSocket(wsUrl, [SUB_PROTOCOL, token]);
        this._ws = ws;
        ws.onopen = () => {
          if (this._ws !== ws) return;
          this._log("connected");
          this._reconnectAttempts = 0;
          const isDPoP = this._auth._tokenType === "DPoP" && !!this._auth._dpopKeyPair;
          const bindPromise = isDPoP ? createDPoPProof(this._auth._dpopKeyPair, "GET", wsUrl, null).then(
            (proof) => {
              if (proof && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ action: "dpop_bind", proof }));
              }
            }
          ) : Promise.resolve();
          bindPromise.then(() => {
            this._scheduleTokenRefresh();
            if (isDPoP) {
              this._pendingSubscription = true;
            } else if (this._subscription) {
              ws.send(JSON.stringify(this._subscription));
            }
            this._emit("open");
            this._emit("connected");
            resolve();
          }).catch((err) => {
            this._emit("error", err);
            resolve();
          });
        };
        ws.onmessage = (event) => {
          if (this._ws !== ws) return;
          let msg;
          try {
            msg = JSON.parse(event.data);
          } catch {
            return;
          }
          if (msg.type === "pong") return;
          if (msg.type === "dpop_verified") {
            this._pendingSubscription = false;
            if (this._subscription) {
              ws.send(JSON.stringify(this._subscription));
            }
            return;
          }
          if (msg.type === "error") {
            this._emit("error", new Error(msg.message));
            return;
          }
          this._log("event", msg.type, msg.entityId || "");
          if (msg.entityId && msg.data && typeof msg.data === "object") {
            msg.entity = {
              id: msg.entityId,
              type: msg.entityType,
              ...msg.data
            };
          }
          this._emit(msg.type, msg);
          this._emit("message", msg);
        };
        ws.onclose = (event) => {
          if (this._ws !== ws) return;
          this._clearTimers();
          if (this._wsIntentionalClose) {
            this._emit("close", event);
            return;
          }
          this._emit("close", event);
          this._emit("disconnected");
          this._autoReconnect();
        };
        ws.onerror = (err) => {
          if (this._ws !== ws) return;
          this._emit("error", err);
          if (ws.readyState !== WebSocket.OPEN) {
            reject(new Error("WebSocket connection failed"));
          }
        };
      });
    }
    _scheduleTokenRefresh() {
      if (this._tokenRefreshTimer) clearTimeout(this._tokenRefreshTimer);
      const remaining = this._auth._tokenExpiry - Date.now();
      const refreshIn = Math.max(
        remaining - TOKEN_REFRESH_LEEWAY_MS,
        TOKEN_REFRESH_MIN_MS
      );
      this._tokenRefreshTimer = setTimeout(() => {
        const oldWs = this._ws;
        this._auth._token = null;
        this._auth.ensureToken().then((newToken) => {
          if (!oldWs || oldWs.readyState !== WebSocket.OPEN) return;
          this._wsIntentionalClose = true;
          oldWs.close(1e3, "Token refresh");
          this._wsIntentionalClose = false;
          return this._openWebSocket(newToken);
        }).catch((err) => {
          this._emit("error", err);
          this._autoReconnect();
        });
      }, refreshIn);
    }
    _autoReconnect() {
      if (this._wsIntentionalClose) return;
      if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
        return;
      }
      if (this._reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
        this._emit("error", new Error("Max reconnection attempts reached"));
        return;
      }
      const delay = Math.min(
        RECONNECT_BASE_MS * Math.pow(2, this._reconnectAttempts),
        RECONNECT_MAX_DELAY_MS
      );
      this._reconnectAttempts++;
      this._emit("reconnecting", {
        attempt: this._reconnectAttempts,
        delay
      });
      this._reconnectTimer = setTimeout(() => {
        this._auth._token = null;
        this._auth.ensureToken().then((token) => this._openWebSocket(token)).catch(() => this._autoReconnect());
      }, delay);
    }
    _clearTimers() {
      if (this._tokenRefreshTimer) {
        clearTimeout(this._tokenRefreshTimer);
        this._tokenRefreshTimer = null;
      }
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }
    }
  };

  // src/sdk/index.ts
  var GeonicDB = class extends EventEmitter {
    constructor(options) {
      super();
      __publicField(this, "_auth");
      __publicField(this, "_ws");
      /**
       * Legacy callback for token refresh events.
       * Prefer `db.on('tokenRefresh', callback)` for new code.
       * @deprecated Use `db.on('tokenRefresh', callback)` instead.
       */
      __publicField(this, "onTokenRefresh", null);
      const opts = options || {};
      let apiKey = opts.apiKey || "";
      let tenant = opts.tenant || "";
      let baseUrl = opts.baseUrl || "";
      if (typeof document !== "undefined" && document.currentScript) {
        const script = document.currentScript;
        if (!apiKey) apiKey = script?.getAttribute?.("data-api-key") || "";
        if (!tenant) tenant = script?.getAttribute?.("data-tenant") || "";
        if (!baseUrl) baseUrl = script?.getAttribute?.("data-base-url") || "";
      }
      this._auth = new AuthManager(baseUrl, apiKey, tenant, opts.debug, opts.anonymous);
      this._auth.onTokenRefresh = (creds) => {
        this.onTokenRefresh?.(creds);
        this.emit("tokenRefresh", creds);
      };
      if (opts.cache !== false) {
        const cache = new SdkCache(opts.cacheMaxEntries ?? SDK_CACHE_MAX_ENTRIES_DEFAULT);
        this._auth.setCache(cache);
        this._auth.setCacheEventEmitter((name, payload) => this.emit(name, payload));
      }
      this._ws = new WebSocketManager(
        this._auth,
        baseUrl,
        tenant,
        (event, data) => {
          this.emit(event, data);
        },
        opts.wsEndpoint
      );
    }
    /**
     * Drop every cached response. Useful in tests and on manual auth changes.
     *
     * Emits a `cacheInvalidated` event for each removed entry so listeners can
     * track explicit flushes (the WebSocket-driven auto-invalidation was removed
     * in #1060 to preserve the ETag/304 revalidation path; `clearCache()` is now
     * the only path that emits this event).
     */
    clearCache() {
      const cache = this._auth.getCache();
      if (!cache) return;
      const removed = cache.deleteWhere(() => true);
      for (const key of removed) {
        this._auth.emitCacheEvent("cacheInvalidated", { key, path: key.split(":").slice(1).join(":") });
      }
    }
    // --- Authentication ---
    /**
     * Login with email and password (Bearer JWT).
     *
     * Pass `{ dpop: true }` to immediately upgrade the session to a DPoP
     * sender-constrained token (RFC 9449). Recommended for browser apps that
     * persist tokens in storage exposed to XSS (localStorage / sessionStorage),
     * since DPoP-bound tokens are unusable without this SDK instance's
     * non-extractable private key.
     *
     * @example
     * ```ts
     * // Bearer (default, backward compatible)
     * await db.login('user@example.com', 'password');
     *
     * // DPoP-bound (recommended for SPAs)
     * await db.login('user@example.com', 'password', { dpop: true });
     *
     * // DPoP-bound + persisted across reloads (browser SPA UX)
     * await db.login('user@example.com', 'password', {
     *   dpop: true,
     *   dpopPersist: true,
     * });
     * ```
     */
    async login(email, password, options) {
      return this._auth.login(email, password, options);
    }
    /**
     * Rehydrate a DPoP session previously persisted via
     * `login({ dpop: true, dpopPersist: true })`.
     *
     * Returns true if a session for this tenant was found and loaded; false
     * if there was no entry, IndexedDB is unavailable, or the persisted
     * session was malformed. Call this at app startup before deciding
     * whether to render the login form.
     *
     * @example
     * ```ts
     * const db = new GeonicDB({ baseUrl, tenant });
     * if (await db.restoreSession()) {
     *   // Tokens + DPoP private key recovered from IndexedDB — boot the app.
     * } else {
     *   // No session; show the login form.
     * }
     * ```
     */
    async restoreSession() {
      return this._auth.restoreSession();
    }
    /**
     * Whether the SDK is currently operating in anonymous mode (no token held).
     * Returns true only when `anonymous: true` was passed to the constructor
     * AND no credentials have been set via `login()` / `setCredentials()`.
     */
    isAnonymous() {
      return this._auth.isAnonymous();
    }
    /**
     * Set credentials externally (e.g. from a login API response).
     * When tokenType is 'Bearer' with a refreshToken, DPoP/PoW is bypassed entirely.
     */
    setCredentials(opts) {
      this._auth.setCredentials(opts);
      return this;
    }
    /** Clear all credentials and disconnect. */
    logout() {
      this._ws.disconnect();
      this._auth.logout();
    }
    // --- Entity CRUD (NGSI-LD) ---
    /** Create a new entity. */
    async createEntity(entity) {
      const res = await this._auth.request("POST", "/ngsi-ld/v1/entities", entity);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw createErrorFromResponse(res.status, e, "Create failed");
      }
      return { created: true };
    }
    /** Get a single entity by ID. */
    async getEntity(entityId) {
      const res = await this._auth.request(
        "GET",
        "/ngsi-ld/v1/entities/" + encodeURIComponent(entityId)
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw createErrorFromResponse(res.status, e, "Not found");
      }
      return await res.json();
    }
    /** Query entities with optional filters. */
    async getEntities(params) {
      const res = await this._auth.request("GET", buildEntitiesPath(params));
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw createErrorFromResponse(res.status, e, "Query failed");
      }
      return await res.json();
    }
    /**
     * Poll for entity list changes using ETag-based revalidation (#991 Phase A).
     *
     * The handle's `stop()` ends the loop. Each tick performs a normal
     * `getEntities()` call; the SDK's cache layer issues `If-None-Match`
     * automatically. The poll detects "no change" by comparing the previous
     * ETag with the response's ETag (the cache exposes the cached ETag on 304
     * replays as well, so the comparison stays valid in both 200 and 304
     * paths).
     *
     * @example
     * ```typescript
     * const handle = db.poll({ type: 'Room' }, {
     *   interval: 5000,
     *   onData: (rooms) => render(rooms),
     *   onNoChange: () => {},
     * });
     * // ...later
     * handle.stop();
     * ```
     */
    poll(params, options) {
      const interval = options.interval ?? SDK_POLL_INTERVAL_MS_DEFAULT;
      if (!Number.isFinite(interval) || interval <= 0) {
        throw new Error(`poll interval must be a positive number (got ${String(interval)})`);
      }
      let stopped = false;
      let timer = null;
      let prevEtag;
      let prevPath;
      const buildPath = () => buildEntitiesPath(params);
      const tick = async () => {
        if (stopped) return;
        try {
          const path = prevPath ?? (prevPath = buildPath());
          const res = await this._auth.request("GET", path);
          if (stopped) return;
          const etag = res.headers.get("etag") ?? void 0;
          if (prevEtag !== void 0 && etag !== void 0 && prevEtag === etag) {
            options.onNoChange?.();
          } else {
            if (!res.ok) {
              throw createErrorFromResponse(res.status, {}, "Poll request failed");
            }
            const data = await res.json();
            prevEtag = etag;
            options.onData?.(data);
          }
        } catch (err) {
          options.onError?.(err);
        } finally {
          if (!stopped) {
            timer = setTimeout(() => {
              void tick();
            }, interval);
          }
        }
      };
      void tick();
      return {
        stop() {
          stopped = true;
          if (timer !== null) {
            clearTimeout(timer);
            timer = null;
          }
        }
      };
    }
    /** Count entities matching the given filters. */
    async count(params) {
      const path = buildPathWithParams("/ngsi-ld/v1/entities", {
        count: true,
        limit: 0,
        type: params?.type,
        q: params?.q,
        scopeQ: params?.scopeQ
      });
      const res = await this._auth.request("GET", path);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw createErrorFromResponse(res.status, e, "Count failed");
      }
      const countHeader = res.headers.get("NGSILD-Results-Count");
      return countHeader ? parseInt(countHeader, 10) : 0;
    }
    /** Update entity attributes (partial). */
    async updateEntity(entityId, attrs) {
      const res = await this._auth.request(
        "PATCH",
        "/ngsi-ld/v1/entities/" + encodeURIComponent(entityId) + "/attrs",
        attrs
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw createErrorFromResponse(res.status, e, "Update failed");
      }
      return { updated: true };
    }
    /** Delete an entity. */
    async deleteEntity(entityId) {
      const res = await this._auth.request(
        "DELETE",
        "/ngsi-ld/v1/entities/" + encodeURIComponent(entityId)
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw createErrorFromResponse(res.status, e, "Delete failed");
      }
      return { deleted: true };
    }
    // --- Types / Attributes Discovery ---
    /** List all entity types. */
    async getTypes() {
      return this._jsonGet("/ngsi-ld/v1/types", "Types query failed");
    }
    /** Get details for a specific entity type. */
    async getType(typeName) {
      return this._jsonGet(
        "/ngsi-ld/v1/types/" + encodeURIComponent(typeName),
        "Type not found"
      );
    }
    /** List all attributes. */
    async getAttributes() {
      return this._jsonGet("/ngsi-ld/v1/attributes", "Attributes query failed");
    }
    /** Get details for a specific attribute. */
    async getAttribute(attrName) {
      return this._jsonGet(
        "/ngsi-ld/v1/attributes/" + encodeURIComponent(attrName),
        "Attribute not found"
      );
    }
    // --- Temporal API ---
    /** Query temporal entities. */
    async getTemporalEntities(params) {
      return this._jsonGet(
        buildPathWithParams(
          "/ngsi-ld/v1/temporal/entities",
          params
        ),
        "Temporal query failed"
      );
    }
    /** Get temporal representation of a single entity. */
    async getTemporalEntity(entityId) {
      return this._jsonGet(
        "/ngsi-ld/v1/temporal/entities/" + encodeURIComponent(entityId),
        "Temporal entity not found"
      );
    }
    // --- Batch Operations ---
    /** Create multiple entities in a single request. */
    async batchCreate(entities) {
      return this._jsonPost(
        "/ngsi-ld/v1/entityOperations/create",
        entities,
        "Batch create failed"
      );
    }
    /** Upsert multiple entities in a single request. */
    async batchUpsert(entities) {
      return this._jsonPost(
        "/ngsi-ld/v1/entityOperations/upsert",
        entities,
        "Batch upsert failed"
      );
    }
    /** Update multiple entities in a single request. */
    async batchUpdate(entities) {
      return this._jsonPost(
        "/ngsi-ld/v1/entityOperations/update",
        entities,
        "Batch update failed"
      );
    }
    /** Delete multiple entities by ID. */
    async batchDelete(entityIds) {
      return this._jsonPost(
        "/ngsi-ld/v1/entityOperations/delete",
        entityIds,
        "Batch delete failed"
      );
    }
    // --- Internal helpers ---
    /** GET request that returns parsed JSON or throws. */
    async _jsonGet(path, fallbackError) {
      const res = await this._auth.request("GET", path);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw createErrorFromResponse(res.status, e, fallbackError);
      }
      return await res.json();
    }
    /** POST request that returns parsed JSON or throws. */
    async _jsonPost(path, body, fallbackError) {
      const res = await this._auth.request("POST", path, body);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw createErrorFromResponse(res.status, e, fallbackError);
      }
      if (res.status === 204) return {};
      return await res.json();
    }
    // --- Generic Request ---
    /**
     * Make an authenticated API request.
     * Automatically checks response status, parses JSON, and throws on error.
     *
     * Empty bodies (`Content-Length: 0` 含む) は Content-Type に関係なく `null`
     * を返す (#1145)。NGSI-LD の POST / DELETE / PATCH 系は仕様上ボディが
     * 空だが、サーバ実装が `Content-Type: application/ld+json` を付けて返す
     * ケースがあり、そこで `res.json()` が SyntaxError を投げて止まっていた。
     */
    async request(method, path, body) {
      const res = await this._auth.request(method, path, body);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw createErrorFromResponse(res.status, e, "Request failed: " + res.status);
      }
      if (res.status === 204) return null;
      if (res.headers.get("Content-Length") === "0") return null;
      const ct = res.headers.get("Content-Type") || "";
      if (!ct) return null;
      if (ct.indexOf("json") !== -1) {
        const text = await res.text();
        if (!text) return null;
        return JSON.parse(text);
      }
      return res.text();
    }
    /**
     * Make an authenticated API request and return the raw Response object.
     * Use this when you need access to response headers (e.g. NGSILD-Results-Count).
     */
    async requestRaw(method, path, body) {
      return this._auth.request(method, path, body);
    }
    // --- WebSocket ---
    /** Establish WebSocket connection (authentication is automatic). */
    async connect() {
      return this._ws.connect();
    }
    /** Force-reconnect (closes existing connection, preserves subscriptions). */
    async reconnect() {
      return this._ws.reconnect();
    }
    /** Disconnect WebSocket (does not fire 'disconnected' event). */
    disconnect() {
      this._ws.disconnect();
    }
    /** Check if WebSocket is currently open. */
    isConnected() {
      return this._ws.isConnected();
    }
    /** Subscribe to entity events (can be called before or after connect). */
    subscribe(options) {
      this._ws.subscribe(options);
    }
  };
  var index_default = GeonicDB;
  if (typeof window !== "undefined") {
    window.GeonicDB = GeonicDB;
  }
  function buildEntitiesPath(params) {
    return buildPathWithParams(
      "/ngsi-ld/v1/entities",
      params
    );
  }
  function buildPathWithParams(path, params) {
    if (!params) return path;
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === void 0 || value === null) continue;
      if (typeof value === "boolean") {
        sp.append(key, value ? "true" : "false");
      } else if (typeof value === "number") {
        sp.append(key, String(value));
      } else if (typeof value === "string") {
        if (value === "") continue;
        sp.append(key, value);
      } else {
        continue;
      }
    }
    const qs = sp.toString();
    return qs ? `${path}?${qs}` : path;
  }
  return __toCommonJS(index_exports);
})();
if(typeof window!=="undefined"){window.GeonicDB=GeonicDBModule.GeonicDB||GeonicDBModule.default}
//# sourceMappingURL=geonicdb.iife.js.map
