# PIN Server Demo

> 从索引服务器获取持仓数据的计算与展示示例
> 所有示例代码可直接运行：`node xxx.js`

## 📊 示例代码

### 1️⃣ 当前持仓订单
```bash
node demo-active-positions.js
```

**UI 展示字段：**
- 币名/交易对：`MyCoin/SOL`
- 总盈亏：`35.1 USDT (+4.5%)`
- 开仓时间：`5s | 1m | 3h | 2d`
- 方向/杠杆：`Long/Short x2-x5`
- 保证金：`103.1 USDT`
- 未实现盈亏：`60.5 USDT (20.1%)`

---

### 2️⃣ 历史订单记录
```bash
node demo-history-positions.js
```

**UI 展示字段：**
- 币名/交易对：`MyCoin/SOL`
- 订单编号：`#2`
- 平仓时间：`5s | 1m | 2day`
- 方向：`Long/Short`
- 已实现盈亏：`60.5 USDT (20.1%)`

---

## 🔧 配置

索引服务器地址：`https://server.ai-hello.cn`
环境变量：`VITE_PINPET_API_URL`
