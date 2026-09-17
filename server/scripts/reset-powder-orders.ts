/**
 * 清 powder_orders 全部（仅用于开发环境重置）
 *   npx tsx scripts/reset-powder-orders.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadDotenv(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*['"]?(.*?)['"]?\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadDotenv(path.resolve(process.cwd(), '.env'));

const supabase = createClient(
  process.env.COZE_SUPABASE_URL!,
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_ANON_KEY!,
);

async function main() {
  const { count, error: e1 } = await supabase
    .from('powder_orders')
    .select('*', { count: 'exact', head: true });
  if (e1) { console.error(e1.message); process.exit(1); }
  console.log(`当前 powder_orders 共 ${count} 条`);

  const { data, error } = await supabase
    .from('powder_orders')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
    .select('order_no');
  if (error) { console.error('DELETE 失败:', error.message); process.exit(1); }
  console.log(`已清 ${data?.length ?? 0} 条`);
  if ((data?.length ?? 0) > 0) {
    console.log('订单号：', data?.map((o: any) => o.order_no).join(', '));
  }
}
main().catch(e => { console.error(e); process.exit(1); });
