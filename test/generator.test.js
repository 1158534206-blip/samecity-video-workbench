import { test } from "node:test";
import assert from "node:assert/strict";
import { generateScripts } from "../src/generator.js";
import { PGlite } from "@electric-sql/pglite";
import { migration, repository } from "../src/db.js";
test("客户上下文包含嵌套资料、历史正文及复盘，且不串客户", async () => {
  const db = new PGlite();
  try {
    await db.exec(migration);
    const repo = repository(db);
    const c = await repo.save("customers", {
      title: "青禾",
      data: {
        city: "杭州",
        industry: "咖啡",
        products: "手冲体验课",
        target_customers: "咖啡初学者",
        advantages: "一对一讲解",
      },
    });
    await repo.save("scripts", {
      title: "历史选题",
      customer_id: c.id,
      data: { body: "历史正文独有信息" },
    });
    await repo.save("reviews", {
      title: "复盘",
      customer_id: c.id,
      data: { actions: "增加研磨演示" },
    });
    const other = await repo.save("customers", { title: "不相关客户" });
    await repo.save("reviews", {
      title: "隔离",
      customer_id: other.id,
      data: { actions: "不能泄漏" },
    });
    const context = await repo.generationContext(c.id);
    assert.match(context.history.join(""), /历史正文独有信息/);
    const items = generateScripts(context, {
      ownership: "客户内容",
      content_type: "产品",
      content_goal: "成交",
      format: "采访",
      audience: "社区新手",
      need_shots: true,
      need_cta: false,
      batch_size: 3,
    });
    for (const item of items) {
      assert.match(item.body, /手冲体验课/);
      assert.match(item.body, /社区新手/);
      assert.match(item.body, /采访提纲/);
      assert.match(item.body, /增加研磨演示/);
      assert.doesNotMatch(item.body, /不能泄漏/);
      assert.equal(item.call_to_action, "");
      assert.ok(item.shots);
    }
    await db.query("UPDATE records SET data='{}' WHERE kind='scripts'");
    await db.exec(migration);
    await db.exec(migration);
    assert.equal(
      (await repo.list("scripts")).items[0].data.ownership,
      "客户内容",
    );
  } finally {
    await db.close();
  }
});
