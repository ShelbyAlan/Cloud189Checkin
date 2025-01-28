/* eslint-disable no-await-in-loop */
require("dotenv").config();
const log4js = require("log4js");
const recording = require("log4js/lib/appenders/recording");
log4js.configure({
  appenders: {
    vcr: { type: "recording" },
    out: { type: "console" }
  },
  categories: { default: { appenders: ["vcr", "out"], level: "info" } }
});

const logger = log4js.getLogger();
const superagent = require("superagent");
const { CloudClient } = require("cloud189-sdk");
const serverChan = require("./push/serverChan");
const telegramBot = require("./push/telegramBot");
const wecomBot = require("./push/wecomBot");
const wxpush = require("./push/wxPusher");
const accounts = require("../accounts");

// 工具函数
const mask = (s, start, end) => s.split("").fill("*", start, end).join("");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 容量汇总存储
const capacitySummary = [];
let totalPersonal = 0;
let totalFamily = 0;

// 核心任务逻辑
const doTask = async (cloudClient) => {
  const result = [];
  try {
    const res = await cloudClient.userSign();
    result.push(`${res.isSign ? "已经签到过了，" : ""}签到获得${res.netdiskBonus}M空间`);
  } catch (e) {
    result.push("签到失败：" + e.message);
  }
  return result;
};

const doFamilyTask = async (cloudClient) => {
  const result = [];
  try {
    const { familyInfoResp } = await cloudClient.getFamilyList();
    if (familyInfoResp) {
      for (const family of familyInfoResp) {
        const res = await cloudClient.familyUserSign(family.familyId);
        result.push(`家庭空间${family.familyId.slice(-4)}：${
          res.signStatus ? "已经签到过了，" : ""}获得${res.bonusSpace}M空间`);
      }
    }
  } catch (e) {
    result.push("家庭签到失败：" + e.message);
  }
  return result;
};

// 推送功能（保持原样）
const push = (title, desp) => {
  /* 原有推送实现 */
};

// 主执行流程
async function main() {
  for (const account of accounts) {
    const { userName, password } = account;
    if (!userName || !password) continue;

    const userMask = mask(userName, 3, 7);
    try {
      logger.info(`▲ 账号 ${userMask} 开始执行`);
      
      // 登录和执行任务
      const client = new CloudClient(userName, password);
      await client.login();
      
      // 执行签到任务
      const [taskResult, familyResult] = await Promise.all([
        doTask(client),
        doFamilyTask(client)
      ]);

      // 记录任务结果
      taskResult.forEach(msg => logger.info(msg));
      familyResult.forEach(msg => logger.info(msg));

      // 获取容量信息
      const { cloudCapacityInfo, familyCapacityInfo } = await client.getUserSizeInfo();
      const personalGB = (cloudCapacityInfo.totalSize / 1024**3).toFixed(2);
      const familyGB = (familyCapacityInfo.totalSize / 1024**3).toFixed(2);

      // 存储和累加容量
      capacitySummary.push({
        user: userMask,
        personal: personalGB,
        family: familyGB
      });
      totalPersonal += parseFloat(personalGB);
      totalFamily += parseFloat(familyGB);

      logger.info(`当前容量：个人 ${personalGB}G | 家庭 ${familyGB}G`);
    } catch (e) {
      logger.error(`账号 ${userMask} 执行失败：`, e);
    } finally {
      logger.info(`账号 ${userMask} 执行完毕\n`);
      
      // 添加2秒延迟（新增部分）
      await delay(2000); // <-- 这里添加延迟
    }
  }

  // 生成汇总报告（保持原样）
  if (capacitySummary.length > 0) {
    const summaryHeader = [
      "┌───────────────┬───────────────┐",
      "│    │    容量汇总    │",
      "├───────────────┼───────────────┤"
    ];
    
    const summaryRows = capacitySummary.map(item => 
      `│    │    ${item.user}: 个人   │${item.personal}G │ 家庭 │${item.family}G │`
    );

    const summaryFooter = [
      "├───────────────┼───────────────┤",
      `│    │    总计：个人 ${totalPersonal.toFixed(2)}G │ 家庭 ${totalFamily.toFixed(2)}G │`,
      "└───────────────┴───────────────┘"
    ];

    logger.info("\n" + [...summaryHeader, ...summaryRows, ...summaryFooter].join("\n"));
  }
}

// 启动执行（保持原样）
(async () => {
  try {
    await main();
  } finally {
    const events = recording.replay();
    const content = events.map(e => e.data[0]).join("\n");
    push("天翼云盘签到报告", content);
    recording.erase();
  }
})();