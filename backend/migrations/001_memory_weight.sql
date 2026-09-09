-- 阶段一：给 memories 表加"深度"字段
-- 在 Supabase SQL Editor 里手动执行一次。不影响现有数据，新增列全部带默认值。

alter table memories
  add column if not exists weight float not null default 1.0,
  add column if not exists intensity smallint,
  add column if not exists mood text,
  add column if not exists tags text[],
  add column if not exists pinned boolean not null default false,
  add column if not exists last_surfaced_at timestamptz;

-- 排序取 top-N 时会用到，加个索引
create index if not exists memories_weight_idx on memories (weight desc, last_surfaced_at desc nulls last);
