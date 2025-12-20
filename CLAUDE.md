# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在处理此仓库代码时提供指导。

## 项目概述

这是一个 PIN Server 演示项目，连接到索引服务器 (https://server.ai-hello.cn) 来获取和显示加密货币持仓和订单数据。项目使用 Solana 区块链集成和 PinPet SDK 进行交易操作。

## 核心架构组件

### 数据源
- **索引服务器**: `VITE_PINPET_API_URL=https://server.ai-hello.cn` - 获取持仓和订单数据的主要 API
- **WebSocket**: `VITE_TRADE_QUOTE_WS=https://server.ai-hello.cn/kline` - 实时价格数据流
- **Solana RPC**: 通过环境变量配置本地/开发网连接

### 核心依赖
- `pinpet-sdk`: 交易 SDK 集成 (v2.1.1)
- `decimal.js`: 用于金融数据的高精度小数计算
- `buffer`: 浏览器环境的 Node.js buffer API

## 开发规范

### 代码注释规范
**重要**: 所有代码必须使用中文注释
- 函数说明使用中文
- 变量含义使用中文注释
- 复杂逻辑必须添加中文解释
- 示例:
  ```javascript
  // 计算持仓盈亏百分比
  function calculatePnlPercentage(entry, current) {
    // 盈亏 = (当前价格 - 开仓价格) / 开仓价格 * 100
    return ((current - entry) / entry) * 100;
  }
  ```

### 文档位置
所有文档默认放置在 `notes` 目录下:
- 使用 Markdown (.md) 格式编写
- 使用中文命名文件
- 确保所有示例代码可以通过 `node xxx.js` 直接运行，无需额外依赖

### 代码示例
所有代码示例应该:
- 可独立运行 (`node filename.js`)
- 无外部依赖要求
- **单文件完成**: 所有示例代码必须在单个 JS 文件中完成，不要引用多个 JS 文件，这样更方便查看和运行
- 方便直接查看和提供给 AI 分析
- 使用中文注释说明代码逻辑

### 持仓显示计算

持仓订单显示字段:
- **总盈亏 (USDT)**: USDT 总盈亏及百分比
- **开仓时间**: 持仓开仓时间 (5秒/1分钟/3小时/2天 格式)
- **方向**: 做多/做空方向
- **杠杆倍数**: 杠杆倍数 (x2, x5 等)
- **保证金**: USDT 保证金
- **未平仓持仓盈亏**: 未实现盈亏 (USDT 和百分比)

历史订单显示字段:
- **平仓时间**: 持仓平仓时间
- **已平仓持仓盈亏**: 已实现盈亏 (USDT 和百分比)

## 运行项目

当前未配置测试脚本。添加功能时:
1. 创建可以用 `node filename.js` 运行的演示文件
2. 将文档放置在 `notes` 目录
3. 确保所有代码示例都是独立的、无依赖的
4. 所有代码使用中文注释

## 环境配置

关键环境变量:
- `VITE_PINPET_API_URL`: 索引服务器端点
- `VITE_TRADE_QUOTE_WS`: 实时数据 WebSocket 端点
- `VITE_SOLANA_RPC_URL`: Solana RPC 连接
- `VITE_SOLANA_NETWORKS`: 网络选择 (LOCALNET/DEVNET)
- `VITE_DEFAULT_DATA_SOURCE`: 数据源偏好 (fast/chain)