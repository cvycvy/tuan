-- 001_nearby_rpc.sql
-- 附近待接单查询下推数据库（纯 SQL 实现，不依赖 PostGIS / earthdistance 扩展）
-- 用法：在 Supabase 的 SQL 编辑器（或项目数据库控制台）中执行一次即可。
-- 执行后，服务端 /api/repair/orders/nearby 会自动改为调用本函数；
-- 若函数不存在，服务端会自动降级为应用层 Haversine 计算，不影响可用性。

-- 待接单状态索引（已存在时跳过）
CREATE INDEX IF NOT EXISTS repair_orders_status_idx
  ON repair_orders (status);

-- 附近待接单函数：数据库内完成 Haversine 距离计算、半径过滤、距离升序排序
-- 修复应用层"只取最新 200 条再算距离"导致的漏单问题
CREATE OR REPLACE FUNCTION repair_nearby_orders(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision DEFAULT 20,
  p_limit integer DEFAULT 200
)
RETURNS TABLE (
  id varchar,
  category varchar,
  description text,
  address varchar,
  contact_name varchar,
  contact_phone varchar,
  latitude double precision,
  longitude double precision,
  status varchar,
  worker_id varchar,
  scheduled_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  distance_km numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT
      o.id,
      o.category,
      o.description,
      o.address,
      o.contact_name,
      o.contact_phone,
      o.latitude,
      o.longitude,
      o.status,
      o.worker_id,
      o.scheduled_at,
      o.created_at,
      o.updated_at,
      6371 * 2 * atan2(
        sqrt(
          sin(radians(o.latitude - p_lat) / 2) ^ 2
          + cos(radians(p_lat)) * cos(radians(o.latitude))
            * sin(radians(o.longitude - p_lng) / 2) ^ 2
        ),
        sqrt(
          1 - (
            sin(radians(o.latitude - p_lat) / 2) ^ 2
            + cos(radians(p_lat)) * cos(radians(o.latitude))
              * sin(radians(o.longitude - p_lng) / 2) ^ 2
          )
        )
      ) AS dist_km
    FROM repair_orders o
    WHERE o.status = 'pending'
  )
  SELECT
    b.id,
    b.category,
    b.description,
    b.address,
    b.contact_name,
    b.contact_phone,
    b.latitude,
    b.longitude,
    b.status,
    b.worker_id,
    b.scheduled_at,
    b.created_at,
    b.updated_at,
    round(b.dist_km::numeric, 1) AS distance_km
  FROM base b
  WHERE b.dist_km <= p_radius_km
  ORDER BY b.dist_km ASC, b.created_at DESC
  LIMIT GREATEST(LEAST(p_limit, 500), 1);
$$;
