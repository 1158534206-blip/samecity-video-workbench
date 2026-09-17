import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { migration, database } from "../src/db.js";
import { createApp, configuration } from "../src/server.js";
import { hash, random } from "../src/auth.js";
let db,
  server,
  url,
  cookie,
  csrf,
  customer,
  task,
  client,
  code,
  verifier,
  access,
  refresh;
const config = {
  baseUrl: "http://localhost:3000",
  password: "test-password-only",
  sessionSecret: "test-session-secret-at-least-32-characters",
  redirectUris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
};
async function request(path, { body, method, headers = {} } = {}) {
  const r = await fetch(url + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      Origin: config.baseUrl,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "manual",
  });
  return {
    status: r.status,
    headers: r.headers,
    data: await r.json().catch(() => null),
  };
}
before(async () => {
  db = process.env.TEST_DATABASE_URL
    ? database(process.env.TEST_DATABASE_URL)
    : new PGlite();
  if (db.exec) await db.exec(migration);
  else await db.query(migration);
  server = createApp(db, config).listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  url = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  await new Promise((r) => server.close(r));
  if (db.close) await db.close();
  else await db.end();
});
test("配置拒绝弱密码和非 HTTPS 远程地址", () => {
  assert.throws(() => configuration({ APP_URL: "http://example.com" }));
  assert.throws(() =>
    configuration({ ADMIN_PASSWORD: "short", SESSION_SECRET: "x".repeat(32) }),
  );
});
test("数据库健康检查与匿名访问隔离", async () => {
  assert.equal((await request("/healthz")).status, 200);
  assert.equal((await request("/api/dashboard")).status, 401);
  assert.equal((await request("/mcp", { body: {} })).status, 401);
});
test("登录、来源校验、CSRF 和安全会话", async () => {
  assert.equal(
    (
      await request("/api/login", {
        body: { password: config.password },
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/api/login", { body: { password: "wrong" } })).status,
    401,
  );
  const r = await request("/api/login", {
    body: { password: config.password },
  });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("set-cookie"), /HttpOnly/);
  cookie = r.headers.get("set-cookie").split(";")[0];
  csrf = (await request("/api/session")).data.csrf;
  assert.equal(
    (
      await request("/api/records/customers", {
        body: { title: "测试" },
        headers: { "X-CSRF-Token": "bad" },
      })
    ).status,
    403,
  );
});
test("客户创建、字段校验和客户关联保护", async () => {
  let r = await request("/api/records/customers", {
    body: {
      title: "杭州 · 青禾咖啡",
      data: { city: "杭州", industry: "餐饮" },
    },
  });
  assert.equal(r.status, 201);
  customer = r.data;
  assert.equal(
    (
      await request("/api/records/videos", {
        body: { title: "错误视频", data: { views: -1 } },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/records/videos", {
        body: { title: "错误链接", data: { url: "javascript:alert(1)" } },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/records/tasks", {
        body: { title: "错误日期", data: { due_date: "2026-02-30" } },
      })
    ).status,
    400,
  );
  r = await request("/api/records/tasks", {
    body: {
      title: "拍摄门店探店",
      customer_id: customer.id,
      data: { due_date: "2026-09-20", owner: "小林" },
    },
  });
  assert.equal(r.status, 201);
  task = r.data;
  assert.equal(
    (
      await request("/api/records/tasks", {
        body: { title: "错误关联", customer_id: task.id },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/record/" + customer.id, {
        method: "DELETE",
        body: { version: 1 },
      })
    ).status,
    409,
  );
});
test("更新冲突、检索与审计", async () => {
  const body = {
    title: "拍摄门店探店",
    customer_id: customer.id,
    status: "进行中",
    data: task.data,
    version: 1,
  };
  assert.equal(
    (await request("/api/records/tasks/" + task.id, { method: "PUT", body }))
      .status,
    200,
  );
  assert.equal(
    (await request("/api/records/tasks/" + task.id, { method: "PUT", body }))
      .status,
    409,
  );
  const r = await request(
    "/api/records/tasks?q=门店&customer_id=" + customer.id,
  );
  assert.equal(r.data.total, 1);
  assert.equal(r.data.items[0].customer_name, customer.title);
  assert.equal(
    (await request("/api/record/" + task.id + "/audit")).data.length,
    2,
  );
  assert.equal(
    (await request("/api/records/tasks?q=%27%20OR%201=1--")).data.total,
    0,
  );
});
test("七个模块完整存储及视频汇总", async () => {
  for (const kind of [
    "communications",
    "scripts",
    "assignments",
    "videos",
    "reviews",
  ]) {
    const data = kind === "videos" ? { views: 1000, leads: 10, deals: 2 } : {};
    assert.equal(
      (
        await request("/api/records/" + kind, {
          body: { title: kind + "测试", customer_id: customer.id, data },
        })
      ).status,
      201,
    );
  }
  const r = await request("/api/dashboard");
  assert.equal(r.data.views, "1000");
  assert.equal(r.data.leads, "10");
  assert.equal(r.data.deals, "2");
  assert.equal(Object.keys(r.data.counts).length, 7);
  assert.equal(r.data.upcoming.length, 1);
});
test("内容中心：客户内容必须选客户，生成并保存新字段", async () => {
  assert.equal(
    (
      await request("/api/generate", {
        body: {
          ownership: "客户内容",
          content_type: "同城流量",
          content_goal: "曝光",
          format: "口播",
        },
      })
    ).status,
    400,
  );
  let r = await request("/api/generate", {
    body: {
      ownership: "我的内容",
      content_type: "专业知识",
      content_goal: "建立信任",
      format: "实拍",
      audience: "同城商家",
      need_shots: true,
      need_cta: true,
      batch_size: 3,
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.items.length, 3);
  assert.ok(r.data.items[0].hook);
  assert.ok(r.data.items[0].shots);
  assert.ok(r.data.items[0].call_to_action);
  assert.equal(r.data.items[0].ownership, "我的内容");
  r = await request("/api/generate", {
    body: {
      ownership: "客户内容",
      customer_id: customer.id,
      content_type: "产品",
      content_goal: "成交",
      format: "现场讲解",
      audience: "同城顾客",
      need_shots: false,
      need_cta: true,
      batch_size: 2,
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.items.length, 2);
  assert.equal(r.data.items[0].shots, "");
  assert.ok(r.data.items[0].call_to_action);
  const item = r.data.items[0];
  const saved = await request("/api/records/scripts", {
    body: {
      title: item.title,
      status: "选题中",
      customer_id: customer.id,
      data: {
        platform: item.platform,
        hook: item.hook,
        body: item.body,
        shots: item.shots,
        call_to_action: item.call_to_action,
        publish_date: "",
        ownership: item.ownership,
        content_type: item.content_type,
        content_goal: item.content_goal,
        format: item.format,
        audience: item.audience,
        need_shots: item.need_shots,
        need_cta: item.need_cta,
        batch_size: item.batch_size,
      },
    },
  });
  assert.equal(saved.status, 201);
  assert.equal(saved.data.data.ownership, "客户内容");
  assert.equal(saved.data.data.content_type, "产品");
  assert.equal(saved.data.data.batch_size, 2);
});
test("内容归属不能通过直接保存绕过", async () => {
  for (const body of [
    { title: "无客户", data: { ownership: "客户内容" } },
    {
      title: "内部误关联",
      customer_id: customer.id,
      data: { ownership: "我的内容" },
    },
  ])
    assert.equal((await request("/api/records/scripts", { body })).status, 400);
});

test("OAuth 元数据、回调白名单和 DCR", async () => {
  const m = await request("/.well-known/oauth-authorization-server");
  assert.deepEqual(m.data.code_challenge_methods_supported, ["S256"]);
  const p = await request("/.well-known/oauth-protected-resource/mcp");
  assert.equal(p.data.resource, config.baseUrl + "/mcp");
  assert.equal(
    (
      await request("/oauth/register", {
        body: { redirect_uris: ["https://evil.example/callback"] },
      })
    ).status,
    400,
  );
  client = (
    await request("/oauth/register", {
      body: {
        redirect_uris: config.redirectUris,
        client_name: "ChatGPT 测试",
        token_endpoint_auth_method: "none",
      },
    })
  ).data;
  assert.ok(client.client_id);
});
async function authorize(scope) {
  verifier = random();
  const params = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: config.redirectUris[0],
    response_type: "code",
    code_challenge_method: "S256",
    code_challenge: hash(verifier),
    scope,
    resource: config.baseUrl + "/mcp",
    state: "state-test",
  });
  const r = await request("/oauth/authorize?" + params);
  assert.equal(r.status, 302);
  const id = new URL(
    r.headers.get("location"),
    config.baseUrl,
  ).searchParams.get("authorize");
  const c = await request("/api/oauth/consent", { body: { id, allow: true } });
  const redirect = new URL(c.data.redirect);
  assert.equal(redirect.searchParams.get("iss"), config.baseUrl);
  assert.equal(redirect.searchParams.get("state"), "state-test");
  return redirect.searchParams.get("code");
}
test("OAuth 授权码、PKCE、一次性交换和刷新轮换", async () => {
  code = await authorize("workbench:read workbench:write");
  const body = {
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    client_id: client.client_id,
    redirect_uri: config.redirectUris[0],
    resource: config.baseUrl + "/mcp",
  };
  const r = await request("/oauth/token", { body });
  assert.equal(r.status, 200);
  access = r.data.access_token;
  refresh = r.data.refresh_token;
  assert.equal((await request("/oauth/token", { body })).status, 400);
  const rb = {
    grant_type: "refresh_token",
    refresh_token: refresh,
    client_id: client.client_id,
    resource: config.baseUrl + "/mcp",
  };
  const refreshed = await request("/oauth/token", { body: rb });
  assert.equal(refreshed.status, 200);
  assert.equal((await request("/oauth/token", { body: rb })).status, 400);
  access = refreshed.data.access_token;
});
async function mcp(method, params, token = access) {
  return request("/mcp", {
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/json, text/event-stream",
    },
    body: { jsonrpc: "2.0", id: 1, method, params },
  });
}
test("OAuth 拒绝错误 PKCE 和资源绑定", async () => {
  const wrongCode = await authorize("workbench:read");
  let r = await request("/oauth/token", {
    body: {
      grant_type: "authorization_code",
      code: wrongCode,
      code_verifier: random(),
      client_id: client.client_id,
      redirect_uri: config.redirectUris[0],
      resource: config.baseUrl + "/mcp",
    },
  });
  assert.equal(r.status, 400);
  const wrongResourceCode = await authorize("workbench:read");
  r = await request("/oauth/token", {
    body: {
      grant_type: "authorization_code",
      code: wrongResourceCode,
      code_verifier: verifier,
      client_id: client.client_id,
      redirect_uri: config.redirectUris[0],
      resource: "https://evil.example/mcp",
    },
  });
  assert.equal(r.status, 400);
});
test("MCP 实际协议握手、工具列表及业务读写", async () => {
  let r = await mcp("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  });
  assert.equal(r.status, 200);
  assert.ok(r.data.result.serverInfo);
  r = await mcp("tools/list", {});
  assert.equal(r.data.result.tools.length, 17);
  r = await mcp("tools/call", {
    name: "create_tasks",
    arguments: {
      title: "由 ChatGPT 创建",
      customer_id: customer.id,
      data: { owner: "培训导师" },
    },
  });
  assert.equal(r.status, 200);
  assert.ok(!r.data.result.isError);
  const record = JSON.parse(r.data.result.content[0].text);
  assert.equal(record.title, "由 ChatGPT 创建");
  r = await mcp("tools/call", { name: "get_dashboard", arguments: {} });
  assert.equal(JSON.parse(r.data.result.content[0].text).counts.tasks, 2);
});
test("MCP 只读权限拒绝写入且令牌可撤销", async () => {
  code = await authorize("workbench:read");
  const r = await request("/oauth/token", {
    body: {
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      client_id: client.client_id,
      redirect_uri: config.redirectUris[0],
      resource: config.baseUrl + "/mcp",
    },
  });
  const token = r.data.access_token;
  const result = await mcp(
    "tools/call",
    { name: "create_tasks", arguments: { title: "禁止写入" } },
    token,
  );
  assert.equal(result.data.result.isError, true);
  await request("/oauth/revoke", { body: { token } });
  assert.equal((await mcp("tools/list", {}, token)).status, 401);
});
test("删除需要版本匹配，退出后会话失效", async () => {
  assert.equal(
    (
      await request("/api/record/" + task.id, {
        method: "DELETE",
        body: { version: 1 },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/api/record/" + task.id, {
        method: "DELETE",
        body: { version: 2 },
      })
    ).status,
    200,
  );
  await request("/api/logout", { body: {} });
  assert.equal((await request("/api/dashboard")).status, 401);
});
