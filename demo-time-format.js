/**
 * 时间格式化演示
 * 用于计算持仓开仓时间，格式如: 5s, 1m, 3h, 2d
 */

/**
 * 格式化开仓时间
 * @param {number} startTime - 开仓时间戳（秒级）
 * @returns {string} 格式化后的时间字符串
 */
function formatPositionTime(startTime) {
  // 获取当前时间戳（秒级）
  const currentTime = Math.floor(Date.now() / 1000);

  // 计算持续时间（秒）
  const duration = currentTime - startTime;

  // 小于 60 秒 → 显示秒
  if (duration < 60) {
    return `${duration}s`;
  }

  // 小于 60 分钟 → 显示分钟
  if (duration < 60 * 60) {
    const minutes = Math.floor(duration / 60);
    return `${minutes}m`;
  }

  // 小于 24 小时 → 显示小时
  if (duration < 24 * 60 * 60) {
    const hours = Math.floor(duration / (60 * 60));
    return `${hours}h`;
  }

  // 大于等于 24 小时 → 显示天数
  const days = Math.floor(duration / (24 * 60 * 60));
  return `${days}d`;
}

// ========== 测试用例 ==========

console.log('=== 时间格式化测试 ===\n');

// 获取当前时间戳（秒级）
const now = Math.floor(Date.now() / 1000);

// 测试用例 1: 5 秒前
const test1 = now - 5;
console.log(`5秒前: ${formatPositionTime(test1)}`);

// 测试用例 2: 30 秒前
const test2 = now - 30;
console.log(`30秒前: ${formatPositionTime(test2)}`);

// 测试用例 3: 1 分钟前
const test3 = now - 60;
console.log(`1分钟前: ${formatPositionTime(test3)}`);

// 测试用例 4: 30 分钟前
const test4 = now - (30 * 60);
console.log(`30分钟前: ${formatPositionTime(test4)}`);

// 测试用例 5: 1 小时前
const test5 = now - (60 * 60);
console.log(`1小时前: ${formatPositionTime(test5)}`);

// 测试用例 6: 3 小时前
const test6 = now - (3 * 60 * 60);
console.log(`3小时前: ${formatPositionTime(test6)}`);

// 测试用例 7: 1 天前
const test7 = now - (24 * 60 * 60);
console.log(`1天前: ${formatPositionTime(test7)}`);

// 测试用例 8: 2 天前
const test8 = now - (2 * 24 * 60 * 60);
console.log(`2天前: ${formatPositionTime(test8)}`);

// 测试用例 9: 7 天前
const test9 = now - (7 * 24 * 60 * 60);
console.log(`7天前: ${formatPositionTime(test9)}`);

// 测试用例 10: 边界情况 - 59 秒
const test10 = now - 59;
console.log(`59秒前: ${formatPositionTime(test10)}`);

// 测试用例 11: 边界情况 - 60 秒（应该显示 1m）
const test11 = now - 60;
console.log(`60秒前: ${formatPositionTime(test11)}`);

// 测试用例 12: 边界情况 - 90 秒（应该显示 1m，不是 1.5m）
const test12 = now - 90;
console.log(`90秒前: ${formatPositionTime(test12)}`);

console.log('\n=== 实际 API 数据测试 ===\n');

// 使用你提供的示例数据
const sampleOrders = [
  {
    direction: "dn",
    start_time: 1766215187,
    open_price: "4970352901831056"
  },
  {
    direction: "up",
    start_time: 1766215776,
    open_price: "6752175264329370"
  }
];

sampleOrders.forEach((order, index) => {
  const timeStr = formatPositionTime(order.start_time);
  console.log(`订单 ${index + 1}:`);
  console.log(`  方向: ${order.direction === 'up' ? '做多' : '做空'}`);
  console.log(`  开仓时间: ${timeStr}`);
  console.log(`  开仓时间戳: ${order.start_time}`);
  console.log('');
});

// 导出函数供其他文件使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { formatPositionTime };
}
