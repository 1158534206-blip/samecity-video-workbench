const $ = (s) => document.querySelector(s),
  el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
const modules = {
  dashboard: ["运营总览", "◫", "OVERVIEW"],
  customers: ["客户管理", "◈", "CUSTOMERS"],
  tasks: ["任务协作", "☷", "TASKS"],
  communications: ["沟通记录", "◌", "COMMUNICATIONS"],
  scripts: ["选题脚本", "▤", "CONTENT STUDIO"],
  assignments: ["培训作业", "▧", "TRAINING"],
  videos: ["视频数据", "▥", "VIDEO ANALYTICS"],
  reviews: ["运营复盘", "↗", "REVIEWS"],
  mcp: ["ChatGPT 接入", "⌘", "MCP CONNECTION"],
};
const definitions = {
  customers: [
    ["city", "所在城市"],
    ["industry", "所属行业"],
    ["contact", "联系人"],
    ["phone", "联系电话"],
    ["account", "账号名称"],
    ["goal", "合作目标", "textarea"],
  ],
  tasks: [
    ["owner", "负责人"],
    ["due_date", "截止日期", "date"],
    ["priority", "优先级", "priority"],
    ["description", "任务说明", "textarea"],
  ],
  communications: [
    ["contact", "沟通对象"],
    ["channel", "沟通渠道"],
    ["date", "沟通日期", "date"],
    ["summary", "沟通内容", "textarea"],
    ["next_step", "下一步行动", "textarea"],
  ],
  scripts: [
    ["platform", "发布平台"],
    ["publish_date", "计划发布日期", "date"],
    ["hook", "开场钩子", "textarea"],
    ["body", "口播正文", "textarea"],
    ["shots", "分镜与拍摄说明", "textarea"],
    ["call_to_action", "转化引导", "textarea"],
  ],
  assignments: [
    ["student", "学员"],
    ["lesson", "课程"],
    ["due_date", "截止日期", "date"],
    ["score", "评分（0–100）", "score"],
    ["requirements", "作业要求", "textarea"],
    ["submission", "作品链接", "url"],
    ["feedback", "导师反馈", "textarea"],
  ],
  videos: [
    ["platform", "发布平台"],
    ["url", "视频链接", "url"],
    ["publish_date", "发布日期", "date"],
    ["views", "播放量", "number"],
    ["likes", "点赞数", "number"],
    ["comments", "评论数", "number"],
    ["shares", "分享数", "number"],
    ["leads", "获客线索", "number"],
    ["deals", "成交数", "number"],
    ["cost", "投放费用（元）", "money"],
  ],
  reviews: [
    ["period", "复盘周期"],
    ["owner", "行动负责人"],
    ["due_date", "行动截止日期", "date"],
    ["highlights", "有效做法", "textarea"],
    ["problems", "问题与原因", "textarea"],
    ["actions", "下一轮行动", "textarea"],
  ],
};
const descriptions = {
  customers: "沉淀客户需求，让每一次合作都有清晰目标。",
  tasks: "明确负责人和截止时间，推动每一项交付落地。",
  communications: "记录关键共识，持续推进下一步行动。",
  scripts: "从同城选题到转化引导，把好内容变成可执行脚本。",
  assignments: "布置实战任务，提交作品，记录导师反馈。",
  videos: "记录发布表现，追踪从播放到成交的效果。",
  reviews: "总结有效做法，把经验沉淀为下一轮行动。",
};
let csrf = "",
  statuses = {},
  current = "dashboard",
  page = 1,
  filters = { q: "", status: "", customer_id: "" },
  editing = null,
  customers = [],
  viewSequence = 0;
async function api(path, options = {}) {
  const r = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf,
      ...options.headers,
    },
  });
  const data = await r.json();
  if (!r.ok) {
    if (r.status === 401 && path != "/api/login") {
      $("#workspace").hidden = true;
      $("#login").hidden = false;
    }
    throw Error(data.error || "请求失败");
  }
  return data;
}
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  setTimeout(() => ($("#toast").hidden = true), 3500);
}
function button(text, fn, cls = "") {
  const b = el("button", cls, text);
  b.type = "button";
  b.onclick = fn;
  return b;
}
function format(n) {
  return new Intl.NumberFormat("zh-CN").format(n || 0);
}
function dateText(v) {
  return v ? new Date(v).toLocaleDateString("zh-CN") : "—";
}
function localDate() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(
    new Date(),
  );
}
$("#today").textContent = new Date().toLocaleDateString("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
});
for (const [key, [name, icon]] of Object.entries(modules)) {
  const b = button("", () => navigate(key));
  b.dataset.key = key;
  b.append(el("span", "nav-icon", icon), el("span", "", name));
  $("#nav").append(b);
}
$("#login-form").onsubmit = async (e) => {
  e.preventDefault();
  const b = e.submitter;
  b.disabled = true;
  $("#login-error").textContent = "";
  try {
    await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        password: new FormData(e.target).get("password"),
      }),
    });
    e.target.reset();
    await boot();
  } catch (err) {
    $("#login-error").textContent = err.message;
  } finally {
    b.disabled = false;
  }
};
$("#logout").onclick = async () => {
  try {
    await api("/api/logout", { method: "POST", body: "{}" });
    location.href = "/";
  } catch (e) {
    toast(e.message);
  }
};
async function boot() {
  csrf = (await api("/api/session")).csrf;
  statuses = (await api("/api/meta")).statuses;
  $("#login").hidden = true;
  $("#workspace").hidden = false;
  await navigate("dashboard");
  await consent();
}
async function navigate(key, reset = true) {
  current = key;
  if (reset) {
    page = 1;
    filters = { q: "", status: "", customer_id: "" };
  }
  document
    .querySelectorAll("nav button")
    .forEach((b) => b.classList.toggle("active", b.dataset.key === key));
  $("#breadcrumb").textContent = modules[key][0];
  const seq = ++viewSequence;
  const content = $("#content");
  content.replaceChildren(el("p", "muted", "正在加载…"));
  try {
    if (key === "dashboard") {
      const data = await api("/api/dashboard");
      if (seq !== viewSequence) return;
      renderDashboard(data);
    } else if (key === "mcp") {
      renderMcp();
    } else {
      const params = new URLSearchParams({
        page,
        limit: 20,
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      });
      const data = await api("/api/records/" + key + "?" + params);
      const clients = await allCustomers();
      if (seq !== viewSequence) return;
      customers = clients;
      renderRecords(key, data);
    }
  } catch (e) {
    if (seq !== viewSequence) return;
    content.replaceChildren(
      el("p", "", e.message),
      button("重新加载", () => navigate(key, false)),
    );
  }
}
function heading(title, sub, eyebrow, action) {
  const row = el("div", "page-heading"),
    left = el("div");
  left.append(
    el("span", "eyebrow", eyebrow),
    el("h1", "", title),
    el("p", "", sub),
  );
  row.append(left);
  if (action) row.append(action);
  return row;
}
function renderDashboard(d) {
  const c = $("#content");
  c.replaceChildren(
    heading(
      "运营总览",
      "把今天的内容、交付与成长，放在一张工作台上。",
      "YOUR DAILY WORKSPACE",
      button("＋ 新建任务", () => openEditor("tasks"), "primary"),
    ),
  );
  const hero = el("div", "hero"),
    copy = el("div");
  copy.append(
    el("h2", "", "内容有节奏，增长有方向。"),
    el("p", "", "从选题到复盘，让每一次执行都留下积累。"),
  );
  hero.append(copy, el("span", "hero-number", "同城"));
  c.append(hero);
  const stats = el("div", "stats");
  for (const [label, value, note] of [
    ["客户档案", d.counts.customers, "团队累计客户"],
    ["执行任务", d.counts.tasks, "全部任务记录"],
    ["累计播放", d.views, "已录入视频的播放量"],
    ["获客线索", d.leads, "成交 " + format(d.deals) + " 笔"],
  ]) {
    const s = el("div", "stat");
    s.append(
      el("span", "label", label),
      el("strong", "", format(value)),
      el("small", "", note),
    );
    stats.append(s);
  }
  c.append(stats);
  const grid = el("div", "dashboard-grid"),
    due = panel("交付日程", "按截止时间排序"),
    quick = panel("工作模块", "快速进入");
  if (!d.upcoming.length) {
    const empty = el("div", "empty");
    empty.append(
      el("strong", "", "今天，从一个小目标开始"),
      el("p", "", "新建任务或培训作业，安排下一次交付。"),
    );
    due.append(empty);
  }
  for (const r of d.upcoming) {
    const row = el("div", "due-item");
    const isLate = r.due_date < localDate();
    row.append(
      el("span", "date-block", r.due_date),
      el("strong", "", r.title),
      el(
        "span",
        "pill" + (isLate ? " late" : ""),
        isLate ? "已逾期" : r.status,
      ),
    );
    row.tabIndex = 0;
    row.role = "button";
    row.onclick = () => openEditor(r.kind, r.id);
    row.onkeydown = (e) => {
      if (e.key === "Enter") row.click();
    };
    due.append(row);
  }
  for (const key of [
    "customers",
    "scripts",
    "assignments",
    "videos",
    "reviews",
  ]) {
    const b = button("", () => navigate(key), "shortcut");
    b.append(
      el("span", "", modules[key][0]),
      el("span", "", format(d.counts[key]) + " 条  ↗"),
    );
    quick.append(b);
  }
  grid.append(due, quick);
  c.append(grid);
}
function panel(title, note) {
  const p = el("section", "panel"),
    h = el("div", "panel-heading");
  h.append(el("h3", "", title), el("span", "", note));
  p.append(h);
  return p;
}
async function allCustomers() {
  const all = [];
  let p = 1;
  for (;;) {
    const r = await api("/api/records/customers?limit=100&page=" + p++);
    all.push(...r.items);
    if (all.length >= r.total) return all;
  }
}
function option(value, label) {
  const o = el("option", "", label);
  o.value = value;
  return o;
}
function renderRecords(kind, data) {
  const c = $("#content");
  c.replaceChildren(
    heading(
      modules[kind][0],
      descriptions[kind],
      modules[kind][2],
      button("＋ 新建记录", () => openEditor(kind), "primary"),
    ),
  );
  const filter = el("form", "filters"),
    search = el("input");
  search.placeholder = "搜索标题或内容…";
  search.setAttribute("aria-label", "搜索");
  search.value = filters.q;
  const status = el("select");
  status.setAttribute("aria-label", "状态筛选");
  status.append(
    option("", "全部状态"),
    ...statuses[kind].map((s) => option(s, s)),
  );
  status.value = filters.status;
  const customer = el("select");
  customer.setAttribute("aria-label", "客户筛选");
  customer.append(
    option("", "全部客户"),
    ...customers.map((c) => option(c.id, c.title)),
  );
  customer.value = filters.customer_id;
  filter.append(search, status);
  if (kind !== "customers") filter.append(customer);
  const submit = el("button", "", "筛选");
  submit.type = "submit";
  filter.append(
    submit,
    button("导出 CSV", () => exportRecords(kind)),
  );
  filter.onsubmit = (e) => {
    e.preventDefault();
    filters = {
      q: search.value,
      status: status.value,
      customer_id: kind === "customers" ? "" : customer.value,
    };
    page = 1;
    navigate(kind, false);
  };
  c.append(filter);
  const p = el("div", "panel");
  if (!data.items.length) {
    const empty = el("div", "empty");
    empty.append(
      el("strong", "", "暂无记录"),
      el(
        "p",
        "",
        Object.values(filters).some(Boolean)
          ? "尝试调整筛选条件。"
          : "点击新建记录，开始整理你的工作。",
      ),
      button("＋ 新建记录", () => openEditor(kind), "primary"),
    );
    p.append(empty);
  } else {
    const wrap = el("div", "table-wrap"),
      table = el("table"),
      thead = el("thead"),
      tr = el("tr");
    const headers = [
      "名称",
      kind === "customers" ? "城市 / 行业" : "关联客户",
      "状态",
      kind === "videos"
        ? "播放 / 线索"
        : kind === "assignments"
          ? "学员 / 评分"
          : "负责人 / 日期",
      "最近更新",
    ];
    headers.forEach((h) => tr.append(el("th", "", h)));
    thead.append(tr);
    table.append(thead);
    const body = el("tbody");
    for (const r of data.items) {
      const row = el("tr"),
        title = el("td", "title-cell");
      title.append(
        button(r.title, () => openEditor(kind, r.id), "open-record"),
      );
      const st = el("td");
      st.append(el("span", "pill", r.status));
      let extra =
        kind === "videos"
          ? `${format(r.data.views)} / ${format(r.data.leads)}`
          : kind === "assignments"
            ? `${r.data.student || "—"} / ${r.data.score ?? "未评分"}`
            : [
                r.data.owner || r.data.contact,
                r.data.due_date || r.data.date || r.data.publish_date,
              ]
                .filter(Boolean)
                .join(" / ") || "—";
      row.append(
        title,
        el(
          "td",
          "",
          kind === "customers"
            ? [r.data.city, r.data.industry].filter(Boolean).join(" / ") || "—"
            : r.customer_name || "未关联",
        ),
        st,
        el("td", "", extra),
        el("td", "", dateText(r.updated_at)),
      );
      body.append(row);
    }
    table.append(body);
    wrap.append(table);
    p.append(wrap);
  }
  const pagination = el("div", "pagination");
  pagination.append(
    el(
      "span",
      "",
      `共 ${data.total} 条 · 第 ${page} / ${Math.max(1, Math.ceil(data.total / 20))} 页`,
    ),
  );
  const prev = button("上一页", () => {
      page--;
      navigate(kind, false);
    }),
    next = button("下一页", () => {
      page++;
      navigate(kind, false);
    });
  prev.disabled = page === 1;
  next.disabled = page * 20 >= data.total;
  pagination.append(prev, next);
  p.append(pagination);
  c.append(p);
}
function field(name, label, type, value, options) {
  const l = el("label", type === "textarea" ? "wide" : "", label);
  let input;
  if (options) {
    input = el("select");
    for (const o of options) input.append(option(o[0], o[1]));
  } else if (type === "textarea") input = el("textarea");
  else {
    input = el("input");
    input.type = ["number", "money", "score"].includes(type)
      ? "number"
      : type || "text";
    if (["number", "money", "score"].includes(type)) {
      input.min = 0;
      input.max = type === "score" ? 100 : type === "money" ? 1e9 : 2147483647;
      input.step = type === "money" || type === "score" ? "0.01" : "1";
    }
    input.maxLength = name === "title" ? 200 : type === "url" ? 2000 : 200;
  }
  input.name = name;
  input.value = value ?? "";
  if (name === "title") input.required = true;
  l.append(input);
  return l;
}
async function openEditor(kind, id) {
  try {
    customers = await allCustomers();
    const r = id ? await api("/api/record/" + id) : null;
    editing = { kind, record: r };
    $("#editor-title").textContent =
      (r ? "编辑" : "新建") + " · " + modules[kind][0];
    $("#form-error").textContent = "";
    $("#audit").textContent = "";
    const f = $("#form-fields");
    f.replaceChildren(
      field(
        "title",
        kind === "customers" ? "客户 / 商家名称 *" : "记录标题 *",
        "text",
        r?.title,
      ),
      field(
        "status",
        "当前状态",
        "select",
        r?.status || statuses[kind][0],
        statuses[kind].map((s) => [s, s]),
      ),
    );
    if (kind !== "customers")
      f.append(
        field("customer_id", "关联客户", "select", r?.customer_id || "", [
          ["", "暂不关联"],
          ...customers.map((c) => [c.id, c.title]),
        ]),
      );
    for (const [key, label, type] of definitions[kind])
      f.append(
        field(
          key,
          label,
          type === "priority" ? "select" : type,
          r?.data[key] ?? (type === "number" || type === "money" ? 0 : ""),
          type === "priority"
            ? ["普通", "紧急", "重要"].map((s) => [s, s])
            : null,
        ),
      );
    $("#delete-record").hidden = !r;
    $("#editor").showModal();
    if (r) {
      const audit = await api("/api/record/" + id + "/audit");
      if (editing?.record?.id === id)
        $("#audit").textContent =
          "最近操作：" +
          audit
            .slice(0, 5)
            .map(
              (a) =>
                `${dateText(a.created_at)} ${a.actor === "mcp" ? "ChatGPT" : "网页"} · ${{ create: "创建", update: "更新", delete: "删除" }[a.action]}`,
            )
            .join("　/　");
    }
  } catch (e) {
    toast(e.message);
  }
}
$("#close-editor").onclick = () => $("#editor").close();
$("#record-form").onsubmit = async (e) => {
  e.preventDefault();
  const b = e.submitter;
  b.disabled = true;
  try {
    const values = Object.fromEntries(new FormData(e.target)),
      data = {};
    for (const [key, , type] of definitions[editing.kind])
      data[key] = ["number", "money", "score"].includes(type)
        ? values[key] === "" && type === "score"
          ? null
          : Number(values[key])
        : values[key];
    const body = {
      title: values.title,
      status: values.status,
      customer_id: values.customer_id || null,
      data,
    };
    if (editing.record) body.version = editing.record.version;
    await api(
      "/api/records/" +
        editing.kind +
        (editing.record ? "/" + editing.record.id : ""),
      { method: editing.record ? "PUT" : "POST", body: JSON.stringify(body) },
    );
    $("#editor").close();
    toast("记录已保存");
    await navigate(current, false);
  } catch (err) {
    $("#form-error").textContent = err.message;
  } finally {
    b.disabled = false;
  }
};
$("#delete-record").onclick = async () => {
  if (!confirm("确定删除这条记录？此操作无法撤销。")) return;
  const b = $("#delete-record");
  b.disabled = true;
  try {
    await api("/api/record/" + editing.record.id, {
      method: "DELETE",
      body: JSON.stringify({ version: editing.record.version }),
    });
    $("#editor").close();
    toast("记录已删除");
    await navigate(current, false);
  } catch (e) {
    $("#form-error").textContent = e.message;
  } finally {
    b.disabled = false;
  }
};
async function exportRecords(kind) {
  try {
    let p = 1,
      rows = [];
    for (;;) {
      const params = new URLSearchParams({
        page: p++,
        limit: 100,
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      });
      const r = await api("/api/records/" + kind + "?" + params);
      rows.push(...r.items);
      if (rows.length >= r.total || !r.items.length) break;
    }
    const escape = (v) =>
      '"' +
      String(v ?? "")
        .replace(/^(?:\s*[=+@\-]|[\t\r\n])/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const csv = [
      [
        "ID",
        "标题",
        "关联客户",
        "状态",
        ...definitions[kind].map((x) => x[1]),
        "更新时间",
      ],
      ...rows.map((r) => [
        r.id,
        r.title,
        r.customer_name,
        r.status,
        ...definitions[kind].map(([k]) => r.data[k]),
        r.updated_at,
      ]),
    ]
      .map((row) => row.map(escape).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = el("a");
    a.href = url;
    a.download = modules[kind][0] + "-" + localDate() + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("已导出 " + rows.length + " 条记录");
  } catch (e) {
    toast(e.message);
  }
}
function renderMcp() {
  const c = $("#content");
  c.replaceChildren(
    heading(
      "把工作台连接到 ChatGPT",
      "用自然语言查询客户、安排任务、完善脚本与完成复盘。",
      "CONNECTED WORKSPACE",
    ),
  );
  const p = el("div", "panel mcp-card");
  p.append(
    el("h2", "", "MCP · 受保护的团队数据接口"),
    el("p", "", "服务地址"),
    el("code", "", location.origin + "/mcp"),
  );
  const list = el("ol");
  for (const s of [
    "在支持自定义 MCP 的 ChatGPT 设置中启用开发者模式，创建连接。",
    "填写上方 HTTPS 服务地址，选择 OAuth 认证（动态注册，无需预设客户端密钥）。",
    "确认 ChatGPT 显示的 OAuth 回调地址已配置在 OAUTH_REDIRECT_URIS 中。",
    "在工作台登录后，核对客户端名称和读写权限，再点击确认授权。",
    "连接成功后可问：“列出待跟进客户”“帮我给这个客户创建拍摄任务”。",
  ])
    list.append(el("li", "", s));
  p.append(
    list,
    el(
      "p",
      "muted",
      "所有数据属于同一个团队共享空间。MCP 支持读取、创建和更新；删除请在网页中操作。视频数据需手动录入，不会自动抓取平台数据。",
    ),
  );
  p.append(button("退出工作台", () => $("#logout").click()));
  c.append(p);
}
const consentId = new URLSearchParams(location.search).get("authorize");
async function consent() {
  if (!consentId) return;
  try {
    const d = await api(
      "/api/oauth/consent?id=" + encodeURIComponent(consentId),
    );
    $("#consent-description").textContent =
      `客户端：${d.client_name}\n申请权限：${d.scope
        .split(" ")
        .map((s) =>
          s === "workbench:read" ? "读取全部业务数据" : "创建和更新业务记录",
        )
        .join("、")}`;
    $("#consent").showModal();
  } catch (e) {
    toast(e.message);
  }
}
async function decide(allow) {
  $("#allow-consent").disabled = $("#deny-consent").disabled = true;
  try {
    const r = await api("/api/oauth/consent", {
      method: "POST",
      body: JSON.stringify({ id: consentId, allow }),
    });
    location.href = r.redirect;
  } catch (e) {
    $("#consent-error").textContent = e.message;
    $("#allow-consent").disabled = $("#deny-consent").disabled = false;
  }
}
$("#allow-consent").onclick = () => decide(true);
$("#deny-consent").onclick = () => decide(false);
boot().catch((e) => {
  if (e.message !== "请先登录") $("#login-error").textContent = e.message;
});
