// demo-position.js - 持仓数据获取与计算示例

// 引入所需模块
const https = require('https');
const Decimal = require('decimal.js');
const { PinPetSdk, getDefaultOptions, SPINPET_PROGRAM_ID } = require('pinpet-sdk');
const { Connection } = require('@solana/web3.js');

// 常量配置
const SERVER_URL = 'https://server.ai-hello.cn';  // 服务器地址
const USER_ADDRESS = 'GKApmS6rzjjj1StwkWWuoXUGPjz7r8owSn8sV47pLzZF';  // 用户地址
const MINT_ADDRESS = '3J3UV44QReeDfgq6t5D2zHpKQbxU4mBWNHGW5LoBcsSg';  // mint 值


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

// 获取持仓数据
async function getPositions() {
  const url = `${SERVER_URL}/api/orderbook/user/${USER_ADDRESS}/active?mint=${MINT_ADDRESS}`;
  return httpsGet(url);
}

// 获取 SOL 价格
async function getSolPrice() {
  const url = `${SERVER_URL}/price/sol`;
  return httpsGet(url);
}

// 获取代币信息（包含最新价格）
async function getTokenInfo(mint) {
  const url = `${SERVER_URL}/api/tokens/mint/${mint}`;
  return httpsGet(url);
}

/**
 * 计算做多 (LONG) 仓位盈亏
 * order_type = 1 是做多 (LONG)
 */
function calculateLongProfit(sdk, position) {
  try {
    console.log('\n========== 做多 (LONG) 盈亏计算过程 ==========\n');

    const {
      latest_price,
      lock_lp_start_price,
      lock_lp_token_amount,
      margin_init_sol_amount,
      margin_sol_amount,
      borrow_amount,
      realized_sol_amount
      
    } = position;

    console.log('原始数据:');
    console.log('  最新价格 (latest_price):', latest_price);
    console.log('  开仓价格 (lock_lp_start_price):', lock_lp_start_price);
    console.log('  锁定代币数量 (lock_lp_token_amount):', lock_lp_token_amount);
    console.log('  保证金 (margin_sol_amount):', margin_sol_amount, 'lamports');
    console.log('  借款金额 (borrow_amount):', borrow_amount, 'lamports');
    console.log('  已实现收益 (realized_sol_amount):', realized_sol_amount || 0, 'lamports');

    // 使用 Decimal.js 进行高精度计算
    const marginSol = new Decimal(margin_sol_amount).div(LAMPORTS_PER_SOL);
    const borrowSol = new Decimal(borrow_amount).div(LAMPORTS_PER_SOL);
    const realizedSol = new Decimal(realized_sol_amount || 0).div(LAMPORTS_PER_SOL);
    const marginInitSol = new Decimal(margin_init_sol_amount).div(LAMPORTS_PER_SOL);

    console.log('\n转换为 SOL:');
    console.log('  保证金 (marginSol):', marginSol.toString(), 'SOL');
    console.log('  借款 (borrowSol):', borrowSol.toString(), 'SOL');
    console.log('  已实现收益 (realizedSol):', realizedSol.toString(), 'SOL');

    // 1. 用 sdk.curve.sellFromPriceWithTokenInput 计算平仓收入
    console.log('\n步骤 1: 计算平仓收入');
    console.log('  调用 sdk.curve.sellFromPriceWithTokenInput(', latest_price, ',', lock_lp_token_amount, ')');
    const sellResult = sdk.curve.sellFromPriceWithTokenInput(latest_price, lock_lp_token_amount);
    console.log('  sellResult 返回值:', sellResult);

    let currentSellIncomeSol;
    if (Array.isArray(sellResult)) {
      console.log('  sellResult 是数组，取 sellResult[1]');
      currentSellIncomeSol = new Decimal(sellResult[1].toString()).div(LAMPORTS_PER_SOL);
    } else {
      console.log('  sellResult 不是数组，直接使用');
      currentSellIncomeSol = new Decimal(sellResult.toString()).div(LAMPORTS_PER_SOL);
    }
    console.log('  平仓收入 (currentSellIncomeSol):', currentSellIncomeSol.toString(), 'SOL');

    // 2. 毛利收益 = 平仓收入 + 保证金 - 借款
    console.log('\n步骤 2: 计算毛利收益');
    console.log('  公式: 毛利 = 平仓收入 + 保证金 - 借款');
    console.log('  毛利 =', currentSellIncomeSol.toString(), '+', marginSol.toString(), '-', borrowSol.toString(), "减半:",borrowSol/2);
    
    const grossProfitSol = currentSellIncomeSol.plus(marginInitSol).minus(borrowSol) ;
    console.log('  毛利收益 (grossProfitSol):', grossProfitSol.toString(), 'SOL');

    // 3. 净收益 = 毛利 - 保证金
    console.log('\n步骤 3: 计算净收益');
    console.log('  公式: 净收益 = 毛利 - 保证金');
    console.log('  净收益 =', grossProfitSol.toString(), '-', marginSol.toString());
    const netProfitSol = grossProfitSol.minus(marginSol)
    console.log('  净收益 (netProfitSol):', netProfitSol.toString(), 'SOL');

    // 4. 盈亏百分比 = (净收益 / 保证金) * 100
    console.log('\n步骤 4: 计算盈亏百分比');
    console.log('  公式: 盈亏% = (净收益 / 保证金) * 100');
    console.log('  盈亏% = (', netProfitSol.toString(), '/', marginSol.toString(), ') * 100');
    const profitPercentage = netProfitSol.div(marginSol).mul(100);
    console.log('  盈亏百分比 (profitPercentage):', profitPercentage.toString(), '%');

    // 5. 止损位百分比 = (当前价格 - 开仓价格) / 开仓价格 * 100
    console.log('\n步骤 5: 计算止损位百分比');
    const startPrice = new Decimal(lock_lp_start_price);
    const currentPrice = new Decimal(latest_price);
    console.log('  公式: 止损位% = (当前价格 - 开仓价格) / 开仓价格 * 100');
    console.log('  止损位% = (', currentPrice.toString(), '-', startPrice.toString(), ') /', startPrice.toString(), '* 100');
    const stopLossPercentage = currentPrice.minus(startPrice).div(startPrice).mul(100);
    console.log('  止损位百分比 (stopLossPercentage):', stopLossPercentage.toString(), '%');

    console.log('\n========== 计算完成 ==========\n');

    // 返回做多仓位的计算结果
    return {
      grossProfit: grossProfitSol,           // 毛利收益（平仓收入 + 保证金 - 借款）
      netProfit: netProfitSol,               // 净收益（毛利 - 保证金）
      profitPercentage: profitPercentage,     // 盈亏百分比（净收益 / 保证金 * 100）
      stopLossPercentage: stopLossPercentage, // 止损位百分比（(当前价格 - 开仓价格) / 开仓价格 * 100）
      realizedSol: realizedSol,              // 已实现收益（SOL）
      marginSol: marginSol                   // 保证金（SOL）
    };
  } catch (error) {
    console.error('做多盈亏计算错误:', error.message);
    return null;
  }
}

/**
 * 计算做空 (SHORT) 仓位盈亏
 * order_type = 2 是做空 (SHORT)
 */
function calculateShortProfit(sdk, position) {
  try {
    const {
      latest_price,
      lock_lp_start_price,
      lock_lp_token_amount,
      margin_sol_amount,
      margin_init_sol_amount,
      realized_sol_amount
    } = position;

    // 使用 Decimal.js 进行高精度计算
    const marginSol = new Decimal(margin_sol_amount).div(LAMPORTS_PER_SOL);
    const marginInitSol = new Decimal(margin_init_sol_amount).div(LAMPORTS_PER_SOL);
    const realizedSol = new Decimal(realized_sol_amount || 0).div(LAMPORTS_PER_SOL);

    // 1. 用 buyFromPriceWithTokenOutput 计算当前平仓成本
    const currentBuyResult = sdk.curve.buyFromPriceWithTokenOutput(latest_price, lock_lp_token_amount);

    let currentBuyCostSol;
    if (Array.isArray(currentBuyResult)) {
      currentBuyCostSol = new Decimal(currentBuyResult[1].toString()).div(LAMPORTS_PER_SOL);
    } else {
      currentBuyCostSol = new Decimal(currentBuyResult.toString()).div(LAMPORTS_PER_SOL);
    }

    // 2. 用 buyFromPriceWithTokenOutput 计算解锁获得的 SOL
    const unlockBuyResult = sdk.curve.buyFromPriceWithTokenOutput(lock_lp_start_price, lock_lp_token_amount);

    let unlockSol;
    if (Array.isArray(unlockBuyResult)) {
      unlockSol = new Decimal(unlockBuyResult[1].toString()).div(LAMPORTS_PER_SOL);
    } else {
      unlockSol = new Decimal(unlockBuyResult.toString()).div(LAMPORTS_PER_SOL);
    }

    // 3. 毛利收益 = 解锁 SOL - 平仓成本
    const grossProfitSol = unlockSol.minus(currentBuyCostSol);

    // 4. 净收益 = 毛利 - 初始保证金
    const netProfitSol = grossProfitSol.minus(marginInitSol);

    // 5. 盈亏百分比 = 净收益 / 初始保证金 * 100
    const profitPercentage = netProfitSol.div(marginInitSol).mul(100);

    // 6. 止损位百分比 = (开仓价格 - 当前价格) / 开仓价格 * 100
    const startPrice = new Decimal(lock_lp_start_price);
    const currentPrice = new Decimal(latest_price);
    const stopLossPercentage = startPrice.minus(currentPrice).div(startPrice).mul(100);

    // 返回做空仓位的计算结果
    return {
      grossProfit: grossProfitSol,           // 毛利收益（解锁 SOL - 平仓成本）
      netProfit: netProfitSol,               // 净收益（毛利 - 初始保证金）
      profitPercentage: profitPercentage,     // 盈亏百分比（(已实现收益 + 净收益) / 初始保证金 * 100）
      stopLossPercentage: stopLossPercentage, // 止损位百分比（(开仓价格 - 当前价格) / 开仓价格 * 100）
      realizedSol: realizedSol,              // 已实现收益（SOL）
      marginSol: marginSol                   // 当前保证金（SOL）
    };
  } catch (error) {
    console.error('做空盈亏计算错误:', error.message);
    return null;
  }
}

/**
 * 格式化开仓时间
 * @param {number} startTime - 开仓时间戳（秒级）
 * @returns {string} - 格式化后的时间字符串（如: "5s", "30m", "3h", "2d"）
 */
function formatOpenTime(startTime) {
  // 获取当前时间戳（秒）
  const currentTime = Math.floor(Date.now() / 1000);

  // 计算持续时间（秒）
  const duration = currentTime - startTime;

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
 * @param {object} position - 持仓订单数据
 * @returns {number} - 杠杆倍数（整数，四舍五入）
 */
function calculateLeverage(position) {
  // 价格精度常量 (10^23)
  const PRICE_DECIMALS = new Decimal(10).pow(23);

  // 将价格转换为 Decimal 并除以精度
  const openPrice = new Decimal(position.open_price).div(PRICE_DECIMALS);
  const lockLpStartPrice = new Decimal(position.lock_lp_start_price).div(PRICE_DECIMALS);

  let stopLossRatio;

  if (position.order_type === 1) {
    // 做空 (SHORT, order_type=1): 止损比例 = (lock_lp_start_price - open_price) / open_price
    stopLossRatio = lockLpStartPrice.minus(openPrice).div(openPrice);
  } else if (position.order_type === 2) {
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
 * 计算持仓数据（统一入口）
 */
function calculatePositionData(sdk, position, solPrice) {
  // order_type 决定计算方式
  // order_type = 1: 做多 (LONG)
  // order_type = 2: 做空 (SHORT)

  const isLong = position.order_type === 1;
  const directionLabel = isLong ? '做多 (LONG)' : '做空 (SHORT)';

  let result;
  if (isLong) {
    result = calculateLongProfit(sdk, position);
  } else {
    result = calculateShortProfit(sdk, position);
  }

  if (!result) {
    return null;
  }

  const solPriceDecimal = new Decimal(solPrice);
  const leverage = calculateLeverage(position);  // 计算杠杆倍数

  return {
    orderId: position.order_id,                                      // 订单编号
    direction: directionLabel,                                        // 方向标签（做多/做空）
    orderType: position.order_type,                                   // 订单类型（1=做多，2=做空）
    openTime: formatOpenTime(position.start_time),                   // 开仓时间（格式化）
    leverage: leverage,                                               // 杠杆倍数
    marginInSol: result.marginSol.toNumber(),                        // 保证金（SOL）
    marginInUSDT: result.marginSol.mul(solPriceDecimal).toNumber(),  // 保证金（USDT）
    netProfitInSol: result.netProfit.toNumber(),                     // 净收益（SOL）
    netProfitInUSDT: result.netProfit.mul(solPriceDecimal).toNumber(), // 净收益（USDT）
    profitPercentage: result.profitPercentage.toNumber(),             // 盈亏百分比
    stopLossPercentage: result.stopLossPercentage.toNumber(),         // 止损位百分比
    realizedInSol: result.realizedSol.toNumber(),                    // 已实现收益（SOL）
    realizedInUSDT: result.realizedSol.mul(solPriceDecimal).toNumber() // 已实现收益（USDT）
  };
}

// 格式化显示输出
function formatDisplay(data) {
  if (!data) {
    console.log('计算失败');
    return;
  }

  console.log('\n----- 持仓数据 -----\n');
  console.log('订单编号:', data.orderId);
  console.log('方向:', data.direction);
  console.log('开仓时间:', data.openTime);
  console.log('杠杆倍数:', `x${data.leverage}`);
  //console.log('Order Type:', data.orderType);
  console.log('保证金 (SOL):', data.marginInSol.toFixed(2));
  console.log('保证金 (USDT):', data.marginInUSDT.toFixed(2));
  //console.log('止损位 (%):', data.stopLossPercentage.toFixed(1) + '%');
  //console.log('已实现收益 (SOL):', (data.realizedInSol >= 0 ? '+' : '') + data.realizedInSol.toFixed(2));
  console.log('持仓盈亏 (SOL):', (data.netProfitInSol >= 0 ? '+' : '') + data.netProfitInSol.toFixed(2));
  console.log('持仓盈亏 (USDT):', (data.netProfitInUSDT >= 0 ? '+' : '') + data.netProfitInUSDT.toFixed(2));
  console.log('持仓盈亏 (%):', (data.profitPercentage >= 0 ? '+' : '') + data.profitPercentage.toFixed(1) + '%');
}

// 主函数
async function main() {
  try {
    console.log('正在获取数据...');

    // 1. 初始化 SDK
    console.log('初始化 SDK...');
    const options = getDefaultOptions('MAINNET');
    options.defaultDataSource = 'fast';  // 快速源
    const connection = new Connection(options.solanaEndpoint, 'confirmed');
    const sdk = new PinPetSdk(connection, SPINPET_PROGRAM_ID, options);
    console.log('SDK 初始化完成');

    // 2. 并行获取持仓、价格和代币信息
    const [positionData, priceData, tokenInfo] = await Promise.all([
      getPositions(),
      getSolPrice(),
      getTokenInfo(MINT_ADDRESS)
    ]);

    // 检查 API 响应是否成功
    if (positionData.code !== 200 || priceData.code !== 200 || tokenInfo.code !== 200) {
      throw new Error('API 请求失败');
    }

    const solPrice = priceData.data.price;
    const latestPrice = tokenInfo.data.latest_price;  // 从代币信息中获取最新价格

    console.log(`\n当前 SOL 价格: $${solPrice}`);
    console.log(`代币最新价格 (u128): ${latestPrice}`);

    // 4. 处理持仓数据
    if (positionData.data.orders && positionData.data.orders.length > 0) {
      // 遍历每个持仓
      for (let i = 0; i < positionData.data.orders.length; i++) {
        const position = positionData.data.orders[i];

        console.log(`\n===== 持仓 #${i + 1} =====`);

        // 使用 SDK 获取的最新价格
        position.latest_price = latestPrice;

        // 计算并显示
        const calculatedData = calculatePositionData(sdk, position, solPrice);
        formatDisplay(calculatedData);
      }
    } else {
      console.log('\n没有找到活跃的持仓');
    }

  } catch (error) {
    console.error('错误:', error.message);
    console.error(error.stack);
  }
}

// 运行主函数
main();
