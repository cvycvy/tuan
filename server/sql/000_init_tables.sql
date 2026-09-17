-- 000_init_tables.sql
-- 协助申报业务表初始化脚本（PostgreSQL / Supabase）
-- 对应 src/storage/database/shared/model.py 的业务表定义
--
-- 执行顺序：
--   1. 先执行本文件（建表 + 索引）
--   2. 再执行 001_nearby_rpc.sql（附近查询函数）
--
-- 说明：
--   - id 使用 uuid 类型，默认值 gen_random_uuid()（pgcrypto 扩展，Supabase 默认已启用）
--   - 所有时间字段使用 timestamptz（带时区）
--   - updated_at 由应用层写入，未设自动更新触发器
--   - 外键均为 ON DELETE SET NULL，便于用户/师傅删除时保留历史订单

-- =====================================================================
-- 1. 报修用户表（微信登录身份）
-- =====================================================================
CREATE TABLE IF NOT EXISTS repair_users (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    openid      varchar(64)  NOT NULL,
    nick_name   varchar(64),
    avatar_url  varchar(512),
    phone       varchar(32),
    created_at  timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT repair_users_openid_unique UNIQUE (openid)
);

COMMENT ON TABLE  repair_users IS '报修用户表（微信登录身份）';
COMMENT ON COLUMN repair_users.openid     IS '微信 openid';
COMMENT ON COLUMN repair_users.nick_name  IS '微信昵称';
COMMENT ON COLUMN repair_users.avatar_url IS '微信头像';
COMMENT ON COLUMN repair_users.phone      IS '最近使用的联系电话';

CREATE UNIQUE INDEX IF NOT EXISTS repair_users_openid_idx ON repair_users (openid);


-- =====================================================================
-- 2. 维修员档案表
-- =====================================================================
CREATE TABLE IF NOT EXISTS repair_workers (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        varchar(64)  NOT NULL,
    phone       varchar(32)  NOT NULL,
    trade       varchar(64)  NOT NULL,
    latitude    double precision NOT NULL,
    longitude   double precision NOT NULL,
    online      boolean      NOT NULL DEFAULT true,
    wx_openid   varchar(64),
    created_at  timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT repair_workers_wx_openid_unique UNIQUE (wx_openid)
);

COMMENT ON TABLE  repair_workers IS '维修员档案表';
COMMENT ON COLUMN repair_workers.name      IS '维修员姓名';
COMMENT ON COLUMN repair_workers.phone     IS '联系电话';
COMMENT ON COLUMN repair_workers.trade     IS '维修工种';
COMMENT ON COLUMN repair_workers.latitude  IS '当前位置纬度';
COMMENT ON COLUMN repair_workers.longitude IS '当前位置经度';
COMMENT ON COLUMN repair_workers.online    IS '是否在线接单';
COMMENT ON COLUMN repair_workers.wx_openid IS '微信 openid';

CREATE INDEX IF NOT EXISTS repair_workers_trade_idx  ON repair_workers (trade);
CREATE INDEX IF NOT EXISTS repair_workers_online_idx ON repair_workers (online);
CREATE UNIQUE INDEX IF NOT EXISTS repair_workers_openid_idx ON repair_workers (wx_openid);


-- =====================================================================
-- 3. 维修申报订单表
-- =====================================================================
CREATE TABLE IF NOT EXISTS repair_orders (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category        varchar(64)  NOT NULL,
    description     text         NOT NULL,
    address         varchar(255) NOT NULL,
    contact_name    varchar(64)  NOT NULL,
    contact_phone   varchar(32)  NOT NULL,
    latitude        double precision NOT NULL,
    longitude       double precision NOT NULL,
    status          varchar(20)  NOT NULL DEFAULT 'pending',
    user_id         uuid,
    worker_id       uuid,
    scheduled_at    timestamptz,
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz,

    CONSTRAINT fk_repair_orders_user
        FOREIGN KEY (user_id)   REFERENCES repair_users(id)   ON DELETE SET NULL,
    CONSTRAINT fk_repair_orders_worker
        FOREIGN KEY (worker_id) REFERENCES repair_workers(id) ON DELETE SET NULL
);

COMMENT ON TABLE  repair_orders IS '维修申报订单表';
COMMENT ON COLUMN repair_orders.category      IS '故障类型';
COMMENT ON COLUMN repair_orders.description   IS '故障描述';
COMMENT ON COLUMN repair_orders.address       IS '上门地址';
COMMENT ON COLUMN repair_orders.contact_name  IS '联系人';
COMMENT ON COLUMN repair_orders.contact_phone IS '联系电话';
COMMENT ON COLUMN repair_orders.latitude      IS '报修位置纬度';
COMMENT ON COLUMN repair_orders.longitude     IS '报修位置经度';
COMMENT ON COLUMN repair_orders.status        IS '状态: pending/accepted/repairing/completed/cancelled';
COMMENT ON COLUMN repair_orders.user_id       IS '下单用户';
COMMENT ON COLUMN repair_orders.worker_id     IS '接单维修员';
COMMENT ON COLUMN repair_orders.scheduled_at  IS '约定上门时间';

CREATE INDEX IF NOT EXISTS repair_orders_status_idx     ON repair_orders (status);
CREATE INDEX IF NOT EXISTS repair_orders_user_id_idx    ON repair_orders (user_id);
CREATE INDEX IF NOT EXISTS repair_orders_worker_id_idx  ON repair_orders (worker_id);
CREATE INDEX IF NOT EXISTS repair_orders_created_at_idx ON repair_orders (created_at);
