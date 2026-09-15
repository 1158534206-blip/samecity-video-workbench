import { z } from "zod";
export const kinds = [
  "customers",
  "tasks",
  "communications",
  "scripts",
  "assignments",
  "videos",
  "reviews",
];
const text = z.string().trim().max(20000).default("");
const short = z.string().trim().max(200).default("");
const date = z.union([z.literal(""), z.string().date()]).default("");
const count = z.number().int().min(0).max(2147483647).default(0);
const url = z
  .union([
    z.literal(""),
    z
      .string()
      .url()
      .max(2000)
      .refine((v) => /^https?:\/\//.test(v), "仅支持 HTTP(S) 链接"),
  ])
  .default("");
export const fields = {
  customers: {
    city: short,
    industry: short,
    contact: short,
    phone: short,
    account: short,
    goal: text,
  },
  tasks: {
    owner: short,
    due_date: date,
    priority: z.enum(["普通", "紧急", "重要"]).default("普通"),
    description: text,
  },
  communications: {
    contact: short,
    channel: short,
    date,
    summary: text,
    next_step: text,
  },
  scripts: {
    platform: short,
    hook: text,
    body: text,
    shots: text,
    call_to_action: text,
    publish_date: date,
  },
  assignments: {
    student: short,
    lesson: short,
    due_date: date,
    requirements: text,
    submission: url,
    feedback: text,
    score: z.number().min(0).max(100).nullable().default(null),
  },
  videos: {
    platform: short,
    url,
    publish_date: date,
    views: count,
    likes: count,
    comments: count,
    shares: count,
    leads: count,
    deals: count,
    cost: z.number().min(0).max(1e9).default(0),
  },
  reviews: {
    period: short,
    highlights: text,
    problems: text,
    actions: text,
    owner: short,
    due_date: date,
  },
};
export const statuses = {
  customers: ["合作中", "待跟进", "已暂停", "已结束"],
  tasks: ["待开始", "进行中", "待确认", "已完成"],
  communications: ["已记录", "待跟进", "已闭环"],
  scripts: ["选题中", "待审核", "待拍摄", "已发布"],
  assignments: ["待布置", "待提交", "待批改", "已完成"],
  videos: ["已发布", "待优化"],
  reviews: ["草稿", "待执行", "已完成"],
};
export function recordSchema(kind) {
  if (!kinds.includes(kind))
    throw Object.assign(new Error("未知业务模块"), { status: 400 });
  return z
    .object({
      title: z.string().trim().min(1).max(200),
      customer_id: z.string().uuid().nullable().default(null),
      status: z.enum(statuses[kind]).default(statuses[kind][0]),
      data: z.object(fields[kind]).strict().default({}),
    })
    .strict();
}
export function schema(kind) {
  return recordSchema(kind).superRefine((v, ctx) => {
    if (kind === "customers" && v.customer_id)
      ctx.addIssue({ code: "custom", message: "客户不能关联其他客户" });
  });
}
export const querySchema = z.object({
  q: z.string().max(200).default(""),
  customer_id: z.string().uuid().optional(),
  status: z.string().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
