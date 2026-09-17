import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createDecipheriv, createSign, createVerify, randomUUID } from 'node:crypto';
import type {
  CreatePaymentResult,
  ParsedNotify,
  PayableOrder,
  PayChannel,
  WxJsapiParams,
} from './payment.types';

/**
 * 各支付渠道单笔金额上限（分）。
 * - 支付宝 wap 官方上限 90,000,000 分 = 900,000 元
 * - 微信 JSAPI 官方上限 9,999,999 分 ≈ 99,999.99 元
 * - 银行卡（mock/未接银联）按全局上限走
 * 与 purchase.service.MAX_AMOUNT_YUAN * 100 对齐。
 */
const MAX_PAY_AMOUNT_FEN = 90_000_000;
const WECHAT_MAX_PAY_AMOUNT_FEN = 9_999_999;

/** 按渠道返回该渠道允许的最大金额（分） */
export function maxAmountFenForChannel(channel: PayChannel): number {
  if (channel === 'wechat') return WECHAT_MAX_PAY_AMOUNT_FEN;
  return MAX_PAY_AMOUNT_FEN;
}

/**
 * 支付渠道服务
 *
 * 当前落地方式（用户已确认）：
 * - 未配置真实凭证 / 非生产环境：走「模拟支付」，订单状态机完全真实，可端到端跑通；
 * - 配置下列环境变量后自动切换为真实链路（签名/下单/通知解密均已按官方协议实现）：
 *
 * 微信支付（JSAPI，小程序内 wx.requestPayment）:
 *   WXPAY_APPID / WXPAY_MCHID / WXPAY_APIV3_KEY / WXPAY_SERIAL_NO /
 *   WXPAY_PRIVATE_KEY（PEM 文本或其 base64） / WXPAY_NOTIFY_URL
 *
 * 支付宝（手机网站支付 wap，H5 跳转）:
 *   ALIPAY_APP_ID / ALIPAY_APP_PRIVATE_KEY / ALIPAY_PUBLIC_KEY /
 *   ALIPAY_NOTIFY_URL / ALIPAY_GATEWAY（可选，默认正式环境网关）
 *
 * 也可用 PAYMENT_MOCK=true|false 强制开关模拟支付。
 *
 * 说明：银行卡没有独立的直连支付通道，真实环境需接入银联聚合支付或走
 * 支付宝/微信的银行卡快捷支付；当前银行ka卡渠道在真实模式下返回 501。
 */
@Injectable()
export class PaymentService {
  /** 是否允许模拟支付：非生产环境默认允许；生产环境必须显式 PAYMENT_MOCK=true */
  isMockAllowed(): boolean {
    const flag = (process.env.PAYMENT_MOCK || '').toLowerCase();
    if (flag === 'true' || flag === '1') return true;
    if (flag === 'false' || flag === '0') return false;
    return process.env.NODE_ENV !== 'production';
  }

  /** 渠道是否已配置真实凭证 */
  private isChannelConfigured(channel: PayChannel): boolean {
    if (channel === 'wechat') {
      return !!(
        process.env.WXPAY_APPID &&
        process.env.WXPAY_MCHID &&
        process.env.WXPAY_APIV3_KEY &&
        process.env.WXPAY_SERIAL_NO &&
        (process.env.WXPAY_PRIVATE_KEY || process.env.WXPAY_PRIVATE_KEY_PATH)
      );
    }
    if (channel === 'alipay') {
      return !!(process.env.ALIPAY_APP_ID && process.env.ALIPAY_APP_PRIVATE_KEY && process.env.ALIPAY_PUBLIC_KEY);
    }
    // 银行卡无独立通道，不存在"已配置"状态
    return false;
  }

  /** 创建支付：凭证齐全走真实链路，否则（且允许 mock）走模拟支付 */
  async createPayment(order: PayableOrder, channel: PayChannel): Promise<CreatePaymentResult> {
    // DB 金额 sanity check（兜住任何绕过 API 写入的脏数据）
    // 全局上限 90 万元（支付宝/银行卡）；微信 JSAPI 单渠道上限 ≈ 10 万元
    if (!Number.isInteger(order.amountFen) || order.amountFen <= 0) {
      throw new BadRequestException(`订单金额异常（${order.amountFen}），无法发起支付`);
    }
    const channelMax = maxAmountFenForChannel(channel);
    if (order.amountFen > channelMax) {
      const channelText = channel === 'wechat' ? '微信支付' : channel === 'alipay' ? '支付宝' : '银行卡';
      throw new BadRequestException(
        `${channelText}单笔金额超出上限（${(channelMax / 100).toFixed(2)} 元），当前 ${(order.amountFen / 100).toFixed(2)} 元`,
      );
    }

    const amountYuan = (order.amountFen / 100).toFixed(2);

    const useMock = !this.isChannelConfigured(channel) || (process.env.PAYMENT_MOCK || '').toLowerCase() === 'true';
    if (useMock) {
      if (!this.isMockAllowed()) {
        throw new ServiceUnavailableException(`支付渠道 ${channel} 未配置真实凭证，且生产环境不允许模拟支付`);
      }
      return this.buildMockResult(channel, amountYuan);
    }

    if (channel === 'wechat') return { mode: 'real', channel, wxJsapiParams: await this.createWxJsapi(order) };
    if (channel === 'alipay') return { mode: 'real', channel, payUrl: this.createAlipayWapUrl(order) };
    throw new ServiceUnavailableException('银行卡支付需接入银联聚合支付（或支付宝/微信银行卡快捷支付），暂未开通');
  }

  /** 解析并校验异步通知（验签/解密），返回订单号与流水号 */
  async parseNotify(
    channel: PayChannel,
    body: Record<string, any>,
    headers: Record<string, any>,
  ): Promise<ParsedNotify> {
    if (channel === 'wechat') return this.parseWxNotify(body, headers);
    if (channel === 'alipay') return this.parseAlipayNotify(body);
    throw new BadRequestException('银行卡渠道无异步通知（仅模拟支付）');
  }

  // ============================== 模拟支付 ==============================

  private buildMockResult(channel: PayChannel, amountYuan: string): CreatePaymentResult {
    const channelText = channel === 'wechat' ? '微信支付' : channel === 'alipay' ? '支付宝' : '银行卡支付';
    return {
      mode: 'mock',
      channel,
      mock: {
        channelText,
        amountYuan,
        hint: '模拟支付环境：确认后订单立即标记为已支付',
      },
    };
  }

  /** 生成模拟支付流水号 */
  buildMockTransactionNo(): string {
    return `MOCK${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  }

  // ============================== 微信支付 JSAPI ==============================

  private async createWxJsapi(order: PayableOrder): Promise<WxJsapiParams> {
    if (!order.openid) {
      throw new BadRequestException('微信支付需要用户 openid，请先完成微信登录');
    }
    const appid = process.env.WXPAY_APPID!;
    const mchid = process.env.WXPAY_MCHID!;
    const serialNo = process.env.WXPAY_SERIAL_NO!;
    const privateKey = await this.readPem(process.env.WXPAY_PRIVATE_KEY, process.env.WXPAY_PRIVATE_KEY_PATH);
    const notifyUrl = process.env.WXPAY_NOTIFY_URL!;

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomUUID().replace(/-/g, '');
    const urlPath = '/v3/pay/transactions/jsapi';
    const reqBody = {
      appid,
      mchid,
      description: order.productName,
      out_trade_no: order.orderNo,
      notify_url: notifyUrl,
      amount: { total: order.amountFen, currency: 'CNY' },
      payer: { openid: order.openid },
    };
    const bodyStr = JSON.stringify(reqBody);

    // 构造并 RSA-SHA256 签名 Authorization 头
    const signSource = ['POST', urlPath, timestamp, nonce, bodyStr, ''].join('\n');
    const signature = rsaSha256Sign(signSource, privateKey);
    const authorization =
      `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",` +
      `timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`;

    const res = await fetch(`https://api.mch.weixin.qq.com${urlPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: authorization },
      body: bodyStr,
    });
    if (!res.ok) {
      throw new ServiceUnavailableException(`微信支付下单失败: ${await res.text()}`);
    }
    const data = (await res.json()) as { prepay_id?: string };
    if (!data.prepay_id) {
      throw new ServiceUnavailableException('微信支付未返回 prepay_id');
    }

    // 用商户私钥对 wx.requestPayment 参数二次签名
    const payParams: WxJsapiParams = {
      timeStamp: timestamp,
      nonceStr: nonce,
      package: `prepay_id=${data.prepay_id}`,
      signType: 'RSA',
      paySign: '',
    };
    const paySignSource = [appid, payParams.timeStamp, payParams.nonceStr, payParams.package, ''].join('\n');
    payParams.paySign = rsaSha256Sign(paySignSource, privateKey);
    return payParams;
  }

  private async parseWxNotify(
    body: Record<string, any>,
    _headers: Record<string, any>,
  ): Promise<ParsedNotify> {
    // TODO(真实上线)：先用微信支付平台证书校验 Wechatpay-Signature / Wechatpay-Serial 头
    const resource = body?.resource;
    if (!resource?.ciphertext || !resource?.nonce) {
      throw new BadRequestException('微信支付通知缺少 resource');
    }
    const apiv3Key = process.env.WXPAY_APIV3_KEY!;
    const cipherBuf = Buffer.from(resource.ciphertext, 'base64');
    const authTag = cipherBuf.subarray(cipherBuf.length - 16);
    const encrypted = cipherBuf.subarray(0, cipherBuf.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(apiv3Key), Buffer.from(resource.nonce));
    decipher.setAuthTag(authTag);
    if (resource.associated_data) {
      decipher.setAAD(Buffer.from(resource.associated_data));
    }
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8');
    const payload = JSON.parse(decrypted);

    return {
      orderNo: payload.out_trade_no,
      transactionNo: payload.transaction_id,
      success: payload.trade_state === 'SUCCESS',
    };
  }

  // ============================== 支付宝手机网站支付 ==============================

  private createAlipayWapUrl(order: PayableOrder): string {
    const params: Record<string, string> = {
      app_id: process.env.ALIPAY_APP_ID!,
      method: 'alipay.trade.wap.pay',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: formatAlipayTime(new Date()),
      version: '1.0',
      notify_url: process.env.ALIPAY_NOTIFY_URL || '',
      biz_content: JSON.stringify({
        out_trade_no: order.orderNo,
        total_amount: (order.amountFen / 100).toFixed(2),
        subject: order.productName,
        product_code: 'QUICK_WAP_WAY',
      }),
    };
    const privateKey = normalizePem(process.env.ALIPAY_APP_PRIVATE_KEY!, 'PRIVATE KEY');
    params.sign = rsaSha256Sign(alipaySignContent(params), privateKey);
    const gateway = process.env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do';
    return `${gateway}?${toUrlEncoded(params)}`;
  }

  private parseAlipayNotify(body: Record<string, any>): ParsedNotify {
    const sign = String(body.sign || '');
    const publicKey = normalizePem(process.env.ALIPAY_PUBLIC_KEY!, 'PUBLIC KEY');
    const signContent = alipaySignContent(body);
    const ok = rsaSha256Verify(signContent, sign, publicKey);
    if (!ok) {
      throw new BadRequestException('支付宝异步通知验签失败');
    }
    const tradeStatus = String(body.trade_status || '');
    return {
      orderNo: String(body.out_trade_no || ''),
      transactionNo: String(body.trade_no || ''),
      success: tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED',
    };
  }

  // ============================== 工具 ==============================

  private async readPem(raw?: string, filePath?: string): Promise<string> {
    if (raw) return normalizePem(raw, 'PRIVATE KEY');
    if (filePath) {
      const fs = await import('node:fs/promises');
      return (await fs.readFile(filePath, 'utf-8')).trim();
    }
    throw new ServiceUnavailableException('缺少商户私钥配置');
  }
}

// -------------------------------- 加密辅助 --------------------------------

function rsaSha256Sign(message: string, privateKeyPem: string): string {
  return createSign('RSA-SHA256').update(message, 'utf-8').sign(privateKeyPem, 'base64');
}

function rsaSha256Verify(message: string, signatureBase64: string, publicKeyPem: string): boolean {
  return createVerify('RSA-SHA256').update(message, 'utf-8').verify(publicKeyPem, signatureBase64, 'base64');
}

/** 兼容 PEM 全文与单行 base64 两种配置形式 */
function normalizePem(key: string, label: 'PRIVATE KEY' | 'PUBLIC KEY'): string {
  const trimmed = key.trim();
  if (trimmed.includes('-----BEGIN')) return trimmed;
  const body = trimmed.replace(/\s+/g, '');
  const lines = body.match(/.{1,64}/g)?.join('\n') || body;
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}

/** 支付宝待签名串：剔除 sign/sign_type，按 key 字典序拼接 */
function alipaySignContent(params: Record<string, any>): string {
  return Object.keys(params)
    .filter(k => k !== 'sign' && k !== 'sign_type' && params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
}

function toUrlEncoded(params: Record<string, string>): string {
  return Object.keys(params)
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');
}

function formatAlipayTime(d: Date): string {
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
