-- 002_powder_orders.sql
-- 预拌粉购买订单表（支持微信支付 / 支付宝 / 银行卡）
-- 可重复执行（IF NOT EXISTS）

CREATE TABLE IF NOT EXISTS public.powder_orders (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_no        varchar(40)  NOT NULL,
    user_id         uuid NULL REFERENCES public.repair_users(id) ON DELETE SET NULL,
    product_name    varchar(100) NOT NULL DEFAULT '预拌粉',
    amount_fen      bigint       NOT NULL,
    pay_channel     varchar(20)  NULL,
    status          varchar(20)  NOT NULL DEFAULT 'pending',
    transaction_no  varchar(80)  NULL,
    remark          varchar(255) NULL,
    paid_at         timestamptz  NULL,
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NULL,
    CONSTRAINT powder_orders_amount_check CHECK (amount_fen > 0 AND amount_fen <= 90000000),
    CONSTRAINT powder_orders_status_check CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
    CONSTRAINT powder_orders_channel_check CHECK (pay_channel IS NULL OR pay_channel IN ('wechat', 'alipay', 'bankcard'))
);

-- 订单号唯一
CREATE UNIQUE INDEX IF NOT EXISTS powder_orders_order_no_idx
    ON public.powder_orders (order_no);

-- 用户 / 状态 / 创建时间索引
CREATE INDEX IF NOT EXISTS powder_orders_user_id_idx
    ON public.powder_orders (user_id);

CREATE INDEX IF NOT EXISTS powder_orders_status_idx
    ON public.powder_orders (status);

CREATE INDEX IF NOT EXISTS powder_orders_created_at_idx
    ON public.powder_orders (created_at DESC);

COMMENT ON TABLE  public.powder_orders IS '预拌粉购买订单';
COMMENT ON COLUMN public.powder_orders.order_no       IS '业务订单号（平台生成）';
COMMENT ON COLUMN public.powder_orders.amount_fen     IS '支付金额（分），避免浮点误差';
COMMENT ON COLUMN public.powder_orders.pay_channel    IS '支付渠道: wechat/alipay/bankcard';
COMMENT ON COLUMN public.powder_orders.status         IS '订单状态: pending/paid/failed/cancelled';
COMMENT ON COLUMN public.powder_orders.transaction_no IS '第三方支付流水号（支付成功后回填）';
