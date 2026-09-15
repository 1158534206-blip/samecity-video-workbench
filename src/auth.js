import {
  randomBytes,
  createHash,
  timingSafeEqual,
  scryptSync,
} from "node:crypto";
import { rateLimit } from "express-rate-limit";
export const random = () => randomBytes(32).toString("base64url");
export const hash = (v) => createHash("sha256").update(v).digest("base64url");
export function authState(db) {
  return {
    async put(key, value, seconds) {
      await db.query(
        "INSERT INTO auth_state(key,value,expires_at) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value=$2,expires_at=$3",
        [key, value, new Date(Date.now() + seconds * 1000)],
      );
    },
    async get(key) {
      return (
        await db.query(
          "SELECT value FROM auth_state WHERE key=$1 AND expires_at>NOW()",
          [key],
        )
      ).rows[0]?.value;
    },
    async take(key) {
      return (
        await db.query(
          "DELETE FROM auth_state WHERE key=$1 AND expires_at>NOW() RETURNING value",
          [key],
        )
      ).rows[0]?.value;
    },
    async remove(key) {
      await db.query("DELETE FROM auth_state WHERE key=$1", [key]);
    },
  };
}
export function installAuth(app, db, config) {
  const state = authState(db),
    base = config.baseUrl,
    resource = base + "/mcp",
    secure = base.startsWith("https:");
  const passwordHash = scryptSync(config.password, config.sessionSecret, 32);
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const cookie = (req) =>
    req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("sid="))
      ?.slice(4) || "";
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 3600 * 1000,
  };
  const requireOrigin = (req, res, next) => {
    if (req.headers.origin !== base)
      return res.status(403).json({ error: "请求来源不匹配" });
    next();
  };
  const session = async (req, res, next) => {
    const s = await state.get("session:" + hash(cookie(req)));
    if (!s) return res.status(401).json({ error: "请先登录" });
    req.session = s;
    next();
  };
  const csrf = (req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (req.headers.origin !== base ||
        req.headers["x-csrf-token"] !== req.session.csrf)
    )
      return res.status(403).json({ error: "请求校验失败，请刷新页面" });
    next();
  };
  app.post("/api/login", limiter, requireOrigin, async (req, res) => {
    const p = typeof req.body.password === "string" ? req.body.password : "";
    if (
      p.length > 500 ||
      !timingSafeEqual(scryptSync(p, config.sessionSecret, 32), passwordHash)
    )
      return res.status(401).json({ error: "密码不正确" });
    const old = cookie(req);
    if (old) await state.remove("session:" + hash(old));
    const token = random();
    await state.put("session:" + hash(token), { csrf: random() }, 43200);
    res.cookie("sid", token, cookieOptions).json({ ok: true });
  });
  app.use("/api", session, csrf);
  app.get("/api/session", (req, res) => res.json({ csrf: req.session.csrf }));
  app.post("/api/logout", async (req, res) => {
    await state.remove("session:" + hash(cookie(req)));
    res.clearCookie("sid", cookieOptions).json({ ok: true });
  });
  app.get(
    [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp",
    ],
    (req, res) =>
      res.json({
        resource,
        authorization_servers: [base],
        scopes_supported: ["workbench:read", "workbench:write"],
        bearer_methods_supported: ["header"],
      }),
  );
  app.get("/.well-known/oauth-authorization-server", (req, res) =>
    res.json({
      issuer: base,
      authorization_endpoint: base + "/oauth/authorize",
      token_endpoint: base + "/oauth/token",
      registration_endpoint: base + "/oauth/register",
      revocation_endpoint: base + "/oauth/revoke",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["workbench:read", "workbench:write"],
      authorization_response_iss_parameter_supported: true,
    }),
  );
  app.post("/oauth/register", limiter, async (req, res) => {
    const b = req.body;
    const redirects = b.redirect_uris;
    if (
      !Array.isArray(redirects) ||
      !redirects.length ||
      redirects.length > 5 ||
      redirects.some((u) => !config.redirectUris.includes(u)) ||
      !["none", undefined].includes(b.token_endpoint_auth_method)
    )
      return res
        .status(400)
        .json({
          error: "invalid_client_metadata",
          error_description: "回调地址必须位于 OAUTH_REDIRECT_URIS 白名单中",
        });
    const client = {
      client_id: random(),
      client_name: String(b.client_name || "MCP 客户端").slice(0, 100),
      redirect_uris: redirects,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    };
    await state.put("client:" + client.client_id, client, 3650 * 86400);
    res.status(201).json(client);
  });
  app.get("/oauth/authorize", limiter, async (req, res) => {
    const q = req.query,
      c =
        typeof q.client_id === "string" &&
        (await state.get("client:" + q.client_id));
    if (!c || !c.redirect_uris.includes(q.redirect_uri))
      return res.status(400).send("无效客户端或回调地址");
    const scopes =
      typeof q.scope === "string"
        ? q.scope.split(" ").filter(Boolean)
        : ["workbench:read"];
    if (
      q.response_type !== "code" ||
      q.code_challenge_method !== "S256" ||
      typeof q.code_challenge !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge) ||
      q.resource !== resource ||
      !scopes.length ||
      scopes.some((s) => !["workbench:read", "workbench:write"].includes(s)) ||
      (q.state !== undefined &&
        (typeof q.state !== "string" || q.state.length > 2048))
    )
      return res
        .status(400)
        .send("无效授权参数：需要 S256 PKCE 和正确的 resource");
    const id = random();
    await state.put(
      "pending:" + id,
      {
        client_id: c.client_id,
        client_name: c.client_name,
        redirect_uri: q.redirect_uri,
        challenge: q.code_challenge,
        scope: scopes.join(" "),
        resource,
        state: q.state || "",
      },
      600,
    );
    res.redirect("/?authorize=" + id);
  });
  app.get("/api/oauth/consent", async (req, res) => {
    const p = await state.get("pending:" + String(req.query.id));
    if (!p) return res.status(400).json({ error: "授权请求已过期" });
    res.json({ client_name: p.client_name, scope: p.scope });
  });
  app.post("/api/oauth/consent", async (req, res) => {
    const p = await state.take("pending:" + String(req.body.id));
    if (!p) return res.status(400).json({ error: "授权请求已过期" });
    const url = new URL(p.redirect_uri);
    url.searchParams.set("state", p.state);
    url.searchParams.set("iss", base);
    if (req.body.allow === true) {
      const code = random();
      await state.put("code:" + hash(code), p, 120);
      url.searchParams.set("code", code);
    } else url.searchParams.set("error", "access_denied");
    res.json({ redirect: url.href });
  });
  async function tokens(p) {
    const access = random(),
      refresh = random();
    const value = {
      client_id: p.client_id,
      scope: p.scope,
      resource: p.resource,
    };
    await state.put("access:" + hash(access), value, 3600);
    await state.put("refresh:" + hash(refresh), value, 30 * 86400);
    return {
      access_token: access,
      refresh_token: refresh,
      expires_in: 3600,
      token_type: "Bearer",
      scope: p.scope,
    };
  }
  app.post("/oauth/token", limiter, async (req, res) => {
    res.set("Cache-Control", "no-store");
    const b = req.body;
    let p;
    if (b.grant_type === "authorization_code") {
      if (
        typeof b.code !== "string" ||
        typeof b.code_verifier !== "string" ||
        !/^[A-Za-z0-9._~-]{43,128}$/.test(b.code_verifier)
      )
        return res.status(400).json({ error: "invalid_grant" });
      p = await state.take("code:" + hash(b.code));
      if (
        !p ||
        p.challenge !== hash(b.code_verifier) ||
        p.redirect_uri !== b.redirect_uri ||
        p.client_id !== b.client_id ||
        p.resource !== b.resource
      )
        return res.status(400).json({ error: "invalid_grant" });
    } else if (b.grant_type === "refresh_token") {
      if (typeof b.refresh_token !== "string")
        return res.status(400).json({ error: "invalid_grant" });
      p = await state.take("refresh:" + hash(b.refresh_token));
      if (!p || p.client_id !== b.client_id || p.resource !== b.resource)
        return res.status(400).json({ error: "invalid_grant" });
    } else return res.status(400).json({ error: "unsupported_grant_type" });
    res.json(await tokens(p));
  });
  app.post("/oauth/revoke", limiter, async (req, res) => {
    if (typeof req.body.token === "string")
      for (const prefix of ["access:", "refresh:"])
        await state.remove(prefix + hash(req.body.token));
    res.json({});
  });
  const bearer = async (req, res, next) => {
    const token = req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
    const p = token && (await state.get("access:" + hash(token)));
    if (!p || p.resource !== resource) {
      res.set(
        "WWW-Authenticate",
        `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`,
      );
      return res.status(401).json({ error: "invalid_token" });
    }
    req.auth = p;
    next();
  };
  return { bearer, state };
}
