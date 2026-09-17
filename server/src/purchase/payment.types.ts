/** 支付渠道 */
export type PayChannel = 'wechat' | 'alipay' | 'bankcard';

export const PAY_CHANNELS: PayChannel[] = ['wechat', 'alipay', 'bankcard'];

/** 需要发起支付的订单信息 */
export interface PayableOrder {
  orderNo: string;
  amountFen: number;
  productName: string;
  /** 微信 JSAPI 支付必需的用户 openid */
  openid: string | null;
}

/** 微信小程序 wx.requestPayment 所需参数 */
export interface WxJsapiParams {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: 'RSA';
  paySign: string;
}

/** 创建支付的返回结果 */
export interface CreatePaymentResult {
  /** mock=模拟支付（前端走模拟收银台）；real=真实渠道参数 */
  mode: 'mock' | 'real';
  channel: PayChannel;
  /** 微信小程序支付参数（真实渠道） */
  wxJsapiParams?: WxJsapiParams;
  /** 支付宝 H5 手机网站支付跳转地址（真实渠道） */
  payUrl?: string;
  /** 模拟收银台展示信息 */
  mock?: {
    channelText: string;
    amountYuan: string;
    hint: string;
  };
}

/** 第三方异步通知解析结果 */
export interface ParsedNotify {
  orderNo: string;
  transactionNo: string;
  success: boolean;
}
