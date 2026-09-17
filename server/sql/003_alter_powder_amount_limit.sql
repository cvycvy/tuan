-- 放宽预拌粉订单金额上限到 90 万元（90000000 分）
-- 适用于：已存在 powder_orders 表的环境（002_powder_orders.sql 已同步更新，新建库无需执行此脚本）

ALTER TABLE public.powder_orders
  DROP CONSTRAINT IF EXISTS powder_orders_amount_check;

ALTER TABLE public.powder_orders
  ADD CONSTRAINT powder_orders_amount_check
  CHECK (amount_fen > 0 AND amount_fen <= 90000000);

-- 验证约束已更新
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'powder_orders_amount_check';
