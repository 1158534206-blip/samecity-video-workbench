import pg from "pg";
import { randomUUID } from "node:crypto";
import { schema, querySchema, kinds } from "./domain.js";
export const migration = `
CREATE TABLE IF NOT EXISTS records (
 id UUID PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('customers','tasks','communications','scripts','assignments','videos','reviews')),
 title TEXT NOT NULL, customer_id UUID REFERENCES records(id) ON DELETE RESTRICT,
 status TEXT NOT NULL, data JSONB NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
UPDATE records SET data = jsonb_build_object(
 'ownership', CASE WHEN customer_id IS NULL THEN '我的内容' ELSE '客户内容' END,
 'content_type','同城流量','content_goal','曝光','format','口播','audience','',
 'need_shots',false,'need_cta',false,'batch_size',1) || data
 WHERE kind='scripts' AND NOT (data ? 'ownership');
CREATE INDEX IF NOT EXISTS records_kind_updated ON records(kind,updated_at DESC);
CREATE INDEX IF NOT EXISTS records_customer ON records(customer_id);
CREATE TABLE IF NOT EXISTS audit_log(id BIGSERIAL PRIMARY KEY, record_id UUID, action TEXT NOT NULL, actor TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS auth_state(key TEXT PRIMARY KEY, value JSONB NOT NULL, expires_at TIMESTAMPTZ NOT NULL);
CREATE INDEX IF NOT EXISTS auth_expiry ON auth_state(expires_at);
`;
export function database(connectionString) {
  return new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 10000,
  });
}
export function repository(db) {
  const one = async (id) => {
    const r = await db.query("SELECT * FROM records WHERE id=$1", [id]);
    if (!r.rows[0])
      throw Object.assign(new Error("记录不存在"), { status: 404 });
    return r.rows[0];
  };
  async function transaction(fn) {
    const client = db.connect ? await db.connect() : db;
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release?.();
    }
  }
  return {
    get: one,
    async list(kind, params = {}) {
      schema(kind);
      const p = querySchema.parse(params);
      const values = [kind];
      const where = ["r.kind=$1"];
      for (const [key, val] of [
        ["customer_id", p.customer_id],
        ["status", p.status],
      ]) {
        if (val) {
          values.push(val);
          where.push(`r.${key}=$${values.length}`);
        }
      }
      if (p.q) {
        values.push("%" + p.q + "%");
        where.push(
          `(r.title ILIKE $${values.length} OR r.data::text ILIKE $${values.length})`,
        );
      }
      const condition = where.join(" AND ");
      const total = await db.query(
        `SELECT COUNT(*)::int AS total FROM records r WHERE ${condition}`,
        values,
      );
      values.push(p.limit, (p.page - 1) * p.limit);
      const result = await db.query(
        `SELECT r.*,c.title AS customer_name FROM records r LEFT JOIN records c ON c.id=r.customer_id WHERE ${condition} ORDER BY r.updated_at DESC,r.id LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      );
      return {
        items: result.rows,
        total: total.rows[0].total,
        page: p.page,
        limit: p.limit,
      };
    },
    async save(kind, input, id, version, actor = "web") {
      const v = schema(kind).parse(input);
      return transaction(async (c) => {
        if (v.customer_id) {
          const parent = await c.query(
            "SELECT id FROM records WHERE id=$1 AND kind='customers' FOR KEY SHARE",
            [v.customer_id],
          );
          if (!parent.rows.length)
            throw Object.assign(new Error("关联客户不存在"), { status: 400 });
        }
        const key = id || randomUUID();
        let r;
        if (id) {
          if (!Number.isInteger(version) || version < 1)
            throw Object.assign(new Error("缺少记录版本，请刷新后重试"), {
              status: 400,
            });
          r = await c.query(
            "UPDATE records SET title=$1,customer_id=$2,status=$3,data=$4,version=version+1,updated_at=NOW() WHERE id=$5 AND kind=$6 AND version=$7 RETURNING *",
            [v.title, v.customer_id, v.status, v.data, key, kind, version],
          );
          if (!r.rows.length)
            throw Object.assign(new Error("记录已变更或不存在，请刷新后重试"), {
              status: 409,
            });
        } else
          r = await c.query(
            "INSERT INTO records(id,kind,title,customer_id,status,data) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
            [key, kind, v.title, v.customer_id, v.status, v.data],
          );
        await c.query(
          "INSERT INTO audit_log(record_id,action,actor) VALUES($1,$2,$3)",
          [key, id ? "update" : "create", actor],
        );
        return r.rows[0];
      });
    },
    async remove(id, version, actor = "web") {
      return transaction(async (c) => {
        const r = await c.query(
          "DELETE FROM records WHERE id=$1 AND version=$2 RETURNING id",
          [id, version],
        );
        if (!r.rows.length)
          throw Object.assign(new Error("记录已变更或不存在，请刷新"), {
            status: 409,
          });
        await c.query(
          "INSERT INTO audit_log(record_id,action,actor) VALUES($1,$2,$3)",
          [id, "delete", actor],
        );
        return { deleted: true };
      });
    },
    async dashboard() {
      const counts = await db.query(
        "SELECT kind,COUNT(*)::int AS count FROM records GROUP BY kind",
      );
      const videos = await db.query(
        "SELECT COALESCE(SUM((data->>'views')::bigint),0)::text AS views,COALESCE(SUM((data->>'leads')::bigint),0)::text AS leads,COALESCE(SUM((data->>'deals')::bigint),0)::text AS deals FROM records WHERE kind='videos'",
      );
      const due = await db.query(
        "SELECT id,kind,title,status,data->>'due_date' AS due_date FROM records WHERE kind IN ('tasks','assignments','reviews') AND status!='已完成' AND COALESCE(data->>'due_date','')!='' ORDER BY data->>'due_date' LIMIT 10",
      );
      return {
        counts: Object.fromEntries(
          kinds.map((k) => [
            k,
            counts.rows.find((r) => r.kind === k)?.count || 0,
          ]),
        ),
        ...videos.rows[0],
        upcoming: due.rows,
      };
    },
    async audit(id) {
      return (
        await db.query(
          "SELECT action,actor,created_at FROM audit_log WHERE record_id=$1 ORDER BY id DESC LIMIT 50",
          [id],
        )
      ).rows;
    },
    async generationContext(customerId) {
      const customer = await db.query(
        "SELECT * FROM records WHERE id=$1 AND kind='customers'",
        [customerId],
      );
      if (!customer.rows[0])
        throw Object.assign(new Error("关联客户不存在"), { status: 400 });
      const history = await db.query(
        "SELECT title,data->>'hook' AS hook,data->>'body' AS body FROM records WHERE kind='scripts' AND customer_id=$1 ORDER BY updated_at DESC LIMIT 10",
        [customerId],
      );
      const reviews = await db.query(
        "SELECT title,data->>'highlights' AS highlights,data->>'problems' AS problems,data->>'actions' AS actions FROM records WHERE kind='reviews' AND customer_id=$1 ORDER BY updated_at DESC LIMIT 10",
        [customerId],
      );
      return {
        customer: customer.rows[0],
        history: history.rows
          .map((r) =>
            [r.title, r.hook, r.body?.split("创作参考（")[0]]
              .filter(Boolean)
              .join("；"),
          )
          .filter(Boolean),
        reviews: reviews.rows
          .map(
            (r) =>
              [r.highlights, r.problems, r.actions]
                .filter(Boolean)
                .join("；") || r.title,
          )
          .filter(Boolean),
      };
    },
  };
}
