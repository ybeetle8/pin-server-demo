// demo-position.js - 持仓数据获取与计算示例

// 引入所需模块
const https = require('https');
const Decimal = require('decimal.js');
const { PinPetSdk, getDefaultOptions, SPINPET_PROGRAM_ID } = require('pinpet-sdk');
const { Connection } = require('@solana/web3.js');

// 常量配置
const SERVER_URL = 'https://server.ai-hello.cn';  // 服务器地址
const USER_ADDRESS = 'EU1a9TcZ4XkmbAxXKmqXke7FVLiPy1wtTv77jBEfSSBo';  // 用户地址
const MINT_ADDRESS = '2cy4g7MTCEKm4buXktf5YCvmrXuSp5QW9jXcXNMqVmJN';  // mint 值

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

/**
 * 计算做多 (LONG) 仓位盈亏
 * order_type = 1 是做多 (LONG)
 */
function calculateLongProfit(sdk, position) {
  try {
    const {
      latest_price,
      lock_lp_start_price,
      lock_lp_token_amount,
      margin_sol_amount,
      borrow_amount,
      realized_sol_amount
    } = position;

    // 使用 Decimal.js 进行高精度计算
    const marginSol = new Decimal(margin_sol_amount).div(LAMPORTS_PER_SOL);
    const borrowSol = new Decimal(borrow_amount).div(LAMPORTS_PER_SOL);
    const realizedSol = new Decimal(realized_sol_amount || 0).div(LAMPORTS_PER_SOL);

    // 1. 用 sdk.curve.sellFromPriceWithTokenInput 计算平仓收入
    const sellResult = sdk.curve.sellFromPriceWithTokenInput(latest_price, lock_lp_token_amount);

    let currentSellIncomeSol;
    if (Array.isArray(sellResult)) {
      currentSellIncomeSol = new Decimal(sellResult[1].toString()).div(LAMPORTS_PER_SOL);
    } else {
      currentSellIncomeSol = new Decimal(sellResult.toString()).div(LAMPORTS_PER_SOL);
    }

    // 2. 毛利收益 = 平仓收入 + 保证金 - 借款
    const grossProfitSol = currentSellIncomeSol.plus(marginSol).minus(borrowSol);

    // 3. 净收益 = 毛利 - 保证金 + 已实现收益
    const netProfitSol = grossProfitSol.minus(marginSol).plus(realizedSol);

    // 4. 盈亏百分比 = (净收益 / 保证金) * 100
    const profitPercentage = netProfitSol.div(marginSol).mul(100);

    // 5. 止损位百分比 = (当前价格 - 开仓价格) / 开仓价格 * 100
    const startPrice = new Decimal(lock_lp_start_price);
    const currentPrice = new Decimal(latest_price);
    const stopLossPercentage = currentPrice.minus(startPrice).div(startPrice).mul(100);

    return {
      grossProfit: grossProfitSol,
      netProfit: netProfitSol,
      profitPercentage: profitPercentage,
      stopLossPercentage: stopLossPercentage,
      realizedSol: realizedSol,
      marginSol: marginSol
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

    // 5. 盈亏百分比 = (已实现收益 + 净收益) / 初始保证金 * 100
    const profitPercentage = realizedSol.plus(netProfitSol).div(marginInitSol).mul(100);

    // 6. 止损位百分比 = (开仓价格 - 当前价格) / 开仓价格 * 100
    const startPrice = new Decimal(lock_lp_start_price);
    const currentPrice = new Decimal(latest_price);
    const stopLossPercentage = startPrice.minus(currentPrice).div(startPrice).mul(100);

    return {
      grossProfit: grossProfitSol,
      netProfit: netProfitSol,
      profitPercentage: profitPercentage,
      stopLossPercentage: stopLossPercentage,
      realizedSol: realizedSol,
      marginSol: marginSol
    };
  } catch (error) {
    console.error('做空盈亏计算错误:', error.message);
    return null;
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

  return {
    direction: directionLabel,
    orderType: position.order_type,
    marginInSol: result.marginSol.toNumber(),
    marginInUSDT: result.marginSol.mul(solPriceDecimal).toNumber(),
    netProfitInSol: result.netProfit.toNumber(),
    netProfitInUSDT: result.netProfit.mul(solPriceDecimal).toNumber(),
    profitPercentage: result.profitPercentage.toNumber(),
    stopLossPercentage: result.stopLossPercentage.toNumber(),
    realizedInSol: result.realizedSol.toNumber(),
    realizedInUSDT: result.realizedSol.mul(solPriceDecimal).toNumber()
  };
}

// 格式化显示输出
function formatDisplay(data) {
  if (!data) {
    console.log('计算失败');
    return;
  }

  console.log('\n----- 持仓数据 -----\n');
  console.log('方向:', data.direction);
  console.log('Order Type:', data.orderType);
  console.log('保证金 (SOL):', data.marginInSol.toFixed(2));
  console.log('保证金 (USDT):', data.marginInUSDT.toFixed(2));
  console.log('止损位 (%):', data.stopLossPercentage.toFixed(1) + '%');
  console.log('已实现收益 (SOL):', (data.realizedInSol >= 0 ? '+' : '') + data.realizedInSol.toFixed(2));
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
    const options = getDefaultOptions('LOCALNET');
    options.defaultDataSource = 'fast';  // 使用快速 API 数据源
    options.fastApiUrl = SERVER_URL;  // 使用我们的服务器地址
    const connection = new Connection(options.solanaEndpoint, 'confirmed');
    const sdk = new PinPetSdk(connection, SPINPET_PROGRAM_ID, options);
    console.log('SDK 初始化完成');

    // 2. 并行获取持仓和价格数据
    const [positionData, priceData] = await Promise.all([
      getPositions(),
      getSolPrice()
    ]);

    // 检查 API 响应是否成功
    if (positionData.code !== 200 || priceData.code !== 200) {
      throw new Error('API 请求失败');
    }

    const solPrice = priceData.data.price;
    console.log(`\n当前 SOL 价格: $${solPrice}`);

    // 3. 使用 SDK 获取代币最新价格
    console.log('获取代币最新价格...');
    const latestPrice = await sdk.data.price(MINT_ADDRESS);
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
