/**
 * 一次性 Supabase 清理脚本（查异常 + 清理）
 *
 * 用法：
 *   cd server
 *   npx tsx scripts/cleanup-powder-orders.ts     # dry-run（只查不删）
 *   npx tsx scripts/cleanup-powder-orders.ts --do  # 真删
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// ---- 1. 读 .env ----
function loadDotenv(file: string) {
  if (!fs.existsSync(file)) return;
  const raw = fs.readFileSync(file, 'utf-8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*['"]?(.*?)['"]?\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadDotenv(path.resolve(process.cwd(), '.env'));

const url = process.env.COZE_SUPABASE_URL;
const key = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('缺少 COZE_SUPABASE_URL / COZE_SUPABASE_ANON_KEY（或 SERVICE_ROLE_KEY）');
  process.exit(1);
}

const supabase = createClient(url, key);
const DO_DELETE = process.argv.includes('--do');
const MAX_FEN = 9_999_900;

async function main() {
  // ---- 2. 拉全量 ----
  const { data, error } = await supabase
    .from('powder_orders')
    .select('id, order_no, amount_fen, amount_fen_raw:amount_fen, status, created_at, remark')
    .order('created_at', { ascending: false });

  if (error) { console.error('SELECT 失败:', error.message); process.exit(1); }
  const rows = data || [];
  console.log(`订单总数：${rows.length}`);

  const abnormal = rows.filter((r: any) => {
    const fen = Number(r.amount_fen);
    return !Number.isFinite(fen) || fen <= 0 || fen > MAX_FEN || !Number.isInteger(fen);
  });

  if (abnormal.length === 0) {
    console.log('✅ 全部正常，无异常数据');
    return;
  }

  console.log(`\n⚠️  发现 ${abnormal.length} 条异常：`);
  for (const r of abnormal as any[]) {
    const fen = Number(r.amount_fen);
    const yuan = (fen / 100).toFixed(2);
    const reason =
      fen <= 0 ? '金额非正'
      : !Number.isInteger(fen) ? '非整数'
      : fen > MAX_FEN ? `超过上限 ${MAX_FEN} 分（≈${MAX_FEN / 100}元）`
      : '未知';
    console.log(`  [${r.status}] ${r.order_no}  amount_fen=${fen} (≈${yuan}元)  reason=${reason}  createdAt=${r.created_at}`);
  }

  if (!DO_DELETE) {
    console.log('\n（dry-run，加 --do 才会真删）');
    return;
  }

  // ---- 3. 先尝试"智能修正"：如果是正好多了 100 倍（amount_fen % 100 == 0），修正；否则删除 ----
  console.log('\n开始清理（--do 已启用）...');
  for (const r of abnormal as any[]) {
    const fen = Number(r.amount_fen);
    const tooBig = fen > MAX_FEN;
    const canDivide = tooBig && fen % 100 === 0 && fen / 100 > 0 && fen / 100 <= MAX_FEN;

    if (canDivide) {
      const fixedFen = fen / 100;
      const { error: e } = await supabase
        .from('powder_orders')
        .update({ amount_fen: fixedFen })
        .eq('id', r.id);
      if (e) console.error(`  ✗ 修正 ${r.order_no}: ${e.message}`);
      else console.log(`  ✓ 修正 ${r.order_no}  ${fen} → ${fixedFen}`);
    } else {
      const { error: e } = await supabase
        .from('powder_orders')
        .delete()
        .eq('id', r.id);
      if (e) console.error(`  ✗ 删除 ${r.order_no}: ${e.message}`);
      else console.log(`  ✓ 删除 ${r.order_no}`);
    }
  }

  // ---- 4. 复查 ----
  const { data: after } = await supabase.from('powder_orders').select('amount_fen');
  const stillBad = (after || []).filter((r: any) => {
    const f = Number(r.amount_fen);
    return !Number.isFinite(f) || f <= 0 || f > MAX_FEN || !Number.isInteger(f);
  });
  console.log(`\n复查：剩余异常 ${stillBad.length} 条`);
}

main().catch(e => { console.error(e); process.exit(1); });
