// demo-history-positions.js - 历史订单数据获取与计算示例

// 引入所需模块
const https = require('https');
const Decimal = require('decimal.js');
const { PinPetSdk, getDefaultOptions, SPINPET_PROGRAM_ID } = require('pinpet-sdk');
const { Connection } = require('@solana/web3.js');

// 常量配置
const SERVER_URL = 'https://server.ai-hello.cn';  // 服务器地址
const USER_ADDRESS = 'GKApmS6rzjjj1StwkWWuoXUGPjz7r8owSn8sV47pLzZF';  // 用户地址
const MINT_ADDRESS = 'B9ziVaRwmoSeYY8a4ChpRoAYeMtuaUKogLoeFxH8r3L4';  // mint 值

// SOL 精度常量
const SOL_DECIMALS = 9;  // SOL 小数位数
const LAMPORTS_PER_SOL = new Decimal(10).pow(SOL_DECIMALS);  // 每个 SOL 的 lamports 数量

// 通用 HTTPS 请求函数
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (!data) {
            reject(new Error(`Empty response from ${url}`));
            return;
          }
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message}\nResponse: ${data}`));
        }
      });
    }).on('error', (err) => {
      reject(new Error(`Request failed for ${url}: ${err.message}`));
    });
  });
}

// 获取历史订单数据
async function getHistoryPositions() {
  const url = `${SERVER_URL}/api/orderbook/user/${USER_ADDRESS}/history?mint=${MINT_ADDRESS}`;
  return httpsGet(url);
}

// 获取 SOL 价格
async function getSolPrice() {
  const url = `${SERVER_URL}/price/sol`;
  return httpsGet(url);
}

/**
 * 格式化持仓时间
 * @param {number} startTime - 开仓时间戳（秒级）
 * @param {number} closeTime - 平仓时间戳（秒级）
 * @returns {string} - 格式化后的时间字符串（如: "5s", "30m", "3h", "2d"）
 */
function formatHoldingTime(startTime, closeTime) {
  // 计算持续时间（秒）
  const duration = closeTime - startTime;

  // 小于 60 秒 -> 显示为秒
  if (duration < 60) {
    return `${Math.floor(duration)}s`;
  }

  // 小于 60 分钟 -> 显示为分钟
  if (duration < 3600) {
    return `${Math.floor(duration / 60)}m`;
  }

  // 小于 24 小时 -> 显示为小时
  if (duration < 86400) {
    return `${Math.floor(duration / 3600)}h`;
  }

  // 大于等于 24 小时 -> 显示为天
  return `${Math.floor(duration / 86400)}d`;
}

/**
 * 计算杠杆倍数
 * @param {object} order - 历史订单数据
 * @returns {number} - 杠杆倍数（整数，四舍五入）
 */
function calculateLeverage(order) {
  // 价格精度常量 (10^23)
  const PRICE_DECIMALS = new Decimal(10).pow(23);

  // 将价格转换为 Decimal 并除以精度
  const openPrice = new Decimal(order.open_price).div(PRICE_DECIMALS);
  const lockLpStartPrice = new Decimal(order.lock_lp_start_price).div(PRICE_DECIMALS);

  let stopLossRatio;

  if (order.order_type === 1) {
    // 做空 (SHORT, order_type=1): 止损比例 = (lock_lp_start_price - open_price) / open_price
    stopLossRatio = lockLpStartPrice.minus(openPrice).div(openPrice);
  } else if (order.order_type === 2) {
    // 做多 (LONG, order_type=2): 止损比例 = (open_price - lock_lp_start_price) / open_price
    stopLossRatio = openPrice.minus(lockLpStartPrice).div(openPrice);
  } else {
    // 未知订单类型
    return 0;
  }

  // 取绝对值，因为止损比例可能是负数
  stopLossRatio = stopLossRatio.abs();

  // 杠杆倍数 = 1 / 止损比例
  const leverage = new Decimal(1).div(stopLossRatio);
  const leverageNum = leverage.toNumber();

  // 如果杠杆倍数小于 1，保留 1 位小数；否则四舍五入取整
  if (leverageNum < 1) {
    return Math.round(leverageNum * 10) / 10;  // 保留 1 位小数
  } else {
    return Math.round(leverageNum);  // 四舍五入取整
  }
}

/**
 * 计算历史订单数据
 * @param {object} record - 历史订单记录
 * @param {number} solPrice - SOL 价格（USDT）
 * @returns {object} - 计算后的订单数据
 */
function calculateHistoryData(record, solPrice) {
  const { order, close_info, direction } = record;

  // order_type 决定方向
  // order_type = 1: 做空 (SHORT)
  // order_type = 2: 做多 (LONG)
  const isShort = order.order_type === 1;
  const directionLabel = isShort ? '做空 (SHORT)' : '做多 (LONG)';

  // 使用 Decimal.js 进行高精度计算
  const marginInitSol = new Decimal(order.margin_init_sol_amount).div(LAMPORTS_PER_SOL);
  const solPriceDecimal = new Decimal(solPrice);

  // 计算杠杆倍数
  const leverage = calculateLeverage(order);

  // 已实现盈亏（SOL 和 USDT）
  let realizedSol;
  let realizedUSDT;
  let profitPercentage;

  // close_reason 说明:
  // 1: 用户主动平仓 / User close
  // 2: 强制清算 / Forced liquidation
  // 3: 到期自动平仓 / Expired close
  // 4: 用户主动平半仓 / User half-close
  // 5: 到期平半仓 / Expired half-close

  if (close_info.close_reason === 2) {
    // 强制清算时,收益直接为 0
    realizedSol = new Decimal(0);
    realizedUSDT = new Decimal(0);
    profitPercentage = new Decimal(0);
  } else {
    // 其他情况按原算法计算
    realizedSol = new Decimal(order.realized_sol_amount || 0).div(LAMPORTS_PER_SOL);
    realizedUSDT = realizedSol.mul(solPriceDecimal);
    // 已实现盈亏比例 = (已实现盈亏 / 初始保证金) * 100
    profitPercentage = realizedSol.div(marginInitSol).mul(100);
  }

  // 保证金（USDT）
  const marginUSDT = marginInitSol.mul(solPriceDecimal);

  // 持仓时间
  const holdingTime = formatHoldingTime(order.start_time, close_info.close_timestamp);

  return {
    orderId: order.order_id,                                      // 订单编号
    direction: directionLabel,                                     // 方向标签（做多/做空）
    orderType: order.order_type,                                   // 订单类型（1=做空，2=做多）
    holdingTime: holdingTime,                                      // 持仓时间（格式化）
    leverage: leverage,                                            // 杠杆倍数
    marginInSol: marginInitSol.toNumber(),                        // 保证金（SOL）
    marginInUSDT: marginUSDT.toNumber(),                          // 保证金（USDT）
    realizedInSol: realizedSol.toNumber(),                        // 已实现盈亏（SOL）
    realizedInUSDT: realizedUSDT.toNumber(),                      // 已实现盈亏（USDT）
    profitPercentage: profitPercentage.toNumber(),                 // 已实现盈亏比例（%）
    closePrice: close_info.close_price,                           // 平仓价格
    closeReason: close_info.close_reason,                         // 平仓原因
    closeTimestamp: close_info.close_timestamp                    // 平仓时间戳
  };
}

/**
 * 获取平仓原因说明
 * @param {number} closeReason - 平仓原因代码
 * @returns {string} - 平仓原因说明
 */
function getCloseReasonLabel(closeReason) {
  const reasons = {
    1: '用户主动平仓',
    2: '强制清算',
    3: '到期自动平仓',
    4: '用户主动平半仓',
    5: '到期平半仓'
  };
  return reasons[closeReason] || '未知原因';
}

/**
 * 格式化显示历史订单输出
 */
function formatDisplay(data) {
  if (!data) {
    console.log('计算失败');
    return;
  }

  console.log('\n----- 历史订单 -----\n');
  console.log('订单编号:', data.orderId);
  console.log('方向:', data.direction);
  console.log('持仓时间:', data.holdingTime);
  console.log('杠杆倍数:', `x${data.leverage}`);
  console.log('保证金 (USDT):', data.marginInUSDT.toFixed(2));
  console.log('平仓原因:', getCloseReasonLabel(data.closeReason));
  console.log('已实现盈亏 (USDT):', (data.realizedInUSDT >= 0 ? '+' : '') + data.realizedInUSDT.toFixed(2));
  console.log('已实现盈亏比例 (%):', (data.profitPercentage >= 0 ? '+' : '') + data.profitPercentage.toFixed(1) + '%');
  console.log('已实现盈亏 (SOL):', (data.realizedInSol >= 0 ? '+' : '') + data.realizedInSol.toFixed(2));

}

// 主函数
async function main() {
  try {
    console.log('正在获取历史订单数据...');

    // 1. 并行获取历史订单和 SOL 价格
    const [historyData, priceData] = await Promise.all([
      getHistoryPositions(),
      getSolPrice()
    ]);

    // 检查 API 响应是否成功
    if (historyData.code !== 200 || priceData.code !== 200) {
      throw new Error('API 请求失败');
    }

    const solPrice = priceData.data.price;
    console.log(`\n当前 SOL 价格: $${solPrice}`);

    // 2. 处理历史订单数据
    if (historyData.data.records && historyData.data.records.length > 0) {
      console.log(`\n共找到 ${historyData.data.total} 条历史订单`);

      // 遍历每个历史订单
      for (let i = 0; i < historyData.data.records.length; i++) {
        const record = historyData.data.records[i];

        console.log(`\n===== 历史订单 #${i + 1} =====`);

        // 计算并显示
        const calculatedData = calculateHistoryData(record, solPrice);
        formatDisplay(calculatedData);
      }
    } else {
      console.log('\n没有找到历史订单');
    }

  } catch (error) {
    console.error('错误:', error.message);
    console.error(error.stack);
  }
}

// 运行主函数
main();
