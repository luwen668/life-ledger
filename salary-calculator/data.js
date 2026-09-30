// ============================================================
// 工资个税计算器 · 数据中枢（2025年度口径）
// 数据来源：各市人社局/公积金中心官方通知（经搜索核验）
// 注意：每年 7 月左右各地会调整基数，使用前请核对最新文件
// ============================================================

// 综合所得个税税率表（年度，工资薪金累计预扣适用）
const TAX_BRACKETS = [
  { limit: 36000,   rate: 0.03,  deduct: 0 },
  { limit: 144000,  rate: 0.10,  deduct: 2520 },
  { limit: 300000,  rate: 0.20,  deduct: 16920 },
  { limit: 420000,  rate: 0.25,  deduct: 31920 },
  { limit: 660000,  rate: 0.30,  deduct: 52920 },
  { limit: 960000,  rate: 0.35,  deduct: 85920 },
  { limit: Infinity, rate: 0.45, deduct: 181920 },
];

// 年终奖单独计税税率表（按月换算：年终奖 / 12 找档）
const BONUS_BRACKETS = [
  { limit: 3000,   rate: 0.03,  deduct: 0 },
  { limit: 12000,  rate: 0.10,  deduct: 210 },
  { limit: 25000,  rate: 0.20,  deduct: 1410 },
  { limit: 35000,  rate: 0.25,  deduct: 2660 },
  { limit: 55000,  rate: 0.30,  deduct: 4410 },
  { limit: 80000,  rate: 0.35,  deduct: 7160 },
  { limit: Infinity, rate: 0.45, deduct: 15160 },
];

// 个税起征点（月度免征额）
const TAX_THRESHOLD_MONTHLY = 5000;

// 专项附加扣除标准（元/月，2025年口径）
const SPECIAL_DEDUCTIONS = [
  { key: "childrenEdu", name: "子女教育",      per: 2000, hint: "每个子女每月 2000，父母分摊", group: "family" },
  { key: "infant",      name: "3岁以下婴幼儿", per: 2000, hint: "每个婴幼儿每月 2000", group: "family" },
  { key: "elderly",     name: "赡养老人",      per: 3000, hint: "独生子女每月 3000；非独分摊最高 1500", group: "family" },
  { key: "mortgage",    name: "住房贷款利息",  per: 1000, hint: "每月 1000，与租金二选一", group: "housing" },
  { key: "rent",        name: "住房租金",      per: 1500, hint: "按城市分档 800 / 1100 / 1500", group: "housing" },
  { key: "education",   name: "继续教育",      per: 400,  hint: "学历继续教育每月 400", group: "other" },
];

// ============================================================
// 城市数据
// rates: [单位比例, 个人比例]
// socialBase: 养老/失业/工伤 基数上下限
// medicalBase: 医疗/生育 基数上下限（null = 同 socialBase）
// medicalBaseFixed: 医保基数固定值（成都 2025 特殊口径）
// ============================================================
const CITIES = {
  beijing: {
    name: "北京", short: "京",
    socialBase: { min: 7162, max: 35811 },
    medicalBase: null,
    rates: {
      pension:    { c: 0.16,  p: 0.08 },
      medical:    { c: 0.098, p: 0.02 },
      unemployment:{ c: 0.005, p: 0.005 },
      injury:     { c: 0.004, p: 0 },
      maternity:  { c: 0,     p: 0 },
    },
    medicalExtraPersonal: 3, // 北京医保个人 +3 元
    housingFund: { min: 2540, max: 35811, rateMin: 0.05, rateMax: 0.12, rateDefault: 0.12 },
    note: "2025.7 起执行。工伤按 0.4% 估算（行业浮动 0.2%–1.9%）。",
  },
  shanghai: {
    name: "上海", short: "沪",
    socialBase: { min: 7460, max: 37302 },
    medicalBase: null,
    rates: {
      pension:    { c: 0.16,  p: 0.08 },
      medical:    { c: 0.095, p: 0.02 },
      unemployment:{ c: 0.005, p: 0.005 },
      injury:     { c: 0.002, p: 0 },
      maternity:  { c: 0,     p: 0 },
    },
    housingFund: { min: 2690, max: 37302, rateMin: 0.05, rateMax: 0.07, rateDefault: 0.07 },
    note: "2025.7 起执行。公积金比例 5%–7%（另有补充公积金 1%–5% 未计入）。工伤按 0.2% 估算。",
  },
  guangzhou: {
    name: "广州", short: "穗",
    socialBase: { min: 5510, max: 27549 },
    medicalBase: { min: 6236, max: 31179 },
    rates: {
      pension:    { c: 0.16,  p: 0.08 },
      medical:    { c: 0.0535, p: 0.02 },
      unemployment:{ c: 0.008, p: 0.002 },
      injury:     { c: 0.004, p: 0 },
      maternity:  { c: 0,     p: 0 },
    },
    housingFund: { min: 2500, max: 39828, rateMin: 0.05, rateMax: 0.12, rateDefault: 0.12 },
    note: "2025 年度执行。医保单位 5.35% 为阶段性降低费率（2025.12.31 到期，2026 起恢复 6.85%）。工伤按 0.4% 估算。",
  },
  shenzhen: {
    name: "深圳", short: "深",
    socialBase: { min: 4775, max: 27549 },
    medicalBase: { min: 6733, max: 33666 },
    unemploymentBase: { min: 2520, max: 44265 },
    rates: {
      pension:    { c: 0.16,  p: 0.08 }, // 深户单位 17%（见 hukouPensionCompany）
      medical:    { c: 0.05,  p: 0.02 }, // 一档；2025 阶段性降费，2026 恢复 6%
      unemployment:{ c: 0.008, p: 0.002 },
      injury:     { c: 0.004, p: 0 },
      maternity:  { c: 0.005, p: 0 },
    },
    hukouPensionCompany: 0.17, // 深户单位养老比例
    housingFund: { min: 2520, max: 44265, rateMin: 0.05, rateMax: 0.12, rateDefault: 0.12 },
    note: "2025.7 起执行。医保为一档费率（二档为 1.5%/0.5%）。生育单位 0.5%。深户养老单位 17%。",
  },
  hangzhou: {
    name: "杭州", short: "杭",
    socialBase: { min: 4986, max: 25299 },
    medicalBase: null,
    rates: {
      pension:    { c: 0.16,  p: 0.08 },
      medical:    { c: 0.095, p: 0.02 },
      unemployment:{ c: 0.005, p: 0.005 },
      injury:     { c: 0.004, p: 0 },
      maternity:  { c: 0,     p: 0 },
    },
    housingFund: { min: 2490, max: 40694, rateMin: 0.05, rateMax: 0.12, rateDefault: 0.12 },
    note: "2025.1 起执行（浙人社发〔2025〕52号）。工伤按 0.4% 估算。",
  },
  chengdu: {
    name: "成都", short: "蓉",
    socialBase: { min: 4588, max: 22938 },
    medicalBaseFixed: 7646, // 2025 年度医保/生育统一按 7646 执行
    rates: {
      pension:    { c: 0.16,  p: 0.08 },
      medical:    { c: 0.075, p: 0.02 }, // 含大病互助补充，估算值 6.75%–7.55%
      unemployment:{ c: 0.006, p: 0.004 },
      injury:     { c: 0.004, p: 0 },
      maternity:  { c: 0,     p: 0 },
    },
    housingFund: { min: 2330, max: 31378, rateMin: 0.05, rateMax: 0.12, rateDefault: 0.12 },
    note: "2025 年度执行。医保基数 2025 年统一按 7646 元口径（官方更新后请以新文件为准）。医保单位比例约 7.5%（含补充）。",
  },
  wuhan: {
    name: "武汉", short: "汉",
    socialBase: { min: 4498, max: 22488 },
    medicalBase: null,
    rates: {
      pension:    { c: 0.16,  p: 0.08 },
      medical:    { c: 0.08,  p: 0.02 },
      unemployment:{ c: 0.007, p: 0.003 },
      injury:     { c: 0.004, p: 0 },
      maternity:  { c: 0.007, p: 0 },
    },
    medicalExtraPersonal: 7, // 大病医疗 7 元/月
    housingFund: { min: 2210, max: 34560, rateMin: 0.05, rateMax: 0.12, rateDefault: 0.12 },
    note: "2025 年度执行（鄂人社发〔2025〕28号，2025.9 公布）。工伤按 0.4% 估算。",
  },
  nanjing: {
    name: "南京", short: "宁",
    socialBase: { min: 4952, max: 24762 },
    medicalBase: null,
    rates: {
      pension:    { c: 0.16,  p: 0.08 },
      medical:    { c: 0.078, p: 0.02 }, // 医疗 7% + 生育 0.8% 估算
      unemployment:{ c: 0.005, p: 0.005 },
      injury:     { c: 0.004, p: 0 },
      maternity:  { c: 0,     p: 0 },
    },
    housingFund: { min: 2490, max: 41400, rateMin: 0.05, rateMax: 0.12, rateDefault: 0.12 },
    note: "2025 下半年新口径（上限 24762/下限 4952）。医保单位 7.8% 为估算值。工伤按 0.4% 估算。",
  },
  chongqing: {
    name: "重庆", short: "渝",
    socialBase: { min: 4404, max: 22017 },
    medicalBase: null,
    rates: {
      pension:    { c: 0.16,  p: 0.08 },
      medical:    { c: 0.085, p: 0.02 }, // 含生育 0.5%
      unemployment:{ c: 0.005, p: 0.005 },
      injury:     { c: 0.004, p: 0 },
      maternity:  { c: 0,     p: 0 },
    },
    housingFund: { min: 2330, max: 30318, rateMin: 0.05, rateMax: 0.12, rateDefault: 0.12 },
    note: "2025 年度执行（渝人社规〔2025〕20号）。工伤按 0.4% 估算。",
  },
  xian: {
    name: "西安", short: "陕",
    socialBase: { min: 4559, max: 22795 },
    medicalBase: { min: 5182, max: 25912 },
    rates: {
      pension:    { c: 0.16,  p: 0.08 },
      medical:    { c: 0.08,  p: 0.02 },
      unemployment:{ c: 0.007, p: 0.003 },
      injury:     { c: 0.004, p: 0 },
      maternity:  { c: 0,     p: 0 },
    },
    housingFund: { min: 2160, max: 31761, rateMin: 0.05, rateMax: 0.12, rateDefault: 0.12 },
    note: "2025 年度执行。医保单独口径（5182–25912）。工伤按 0.4% 估算。",
  },
};

const DATA_YEAR = "2025年度";

// 浏览器环境：const 不会挂到 window，需显式暴露
if (typeof window !== "undefined") {
  window.CITIES = CITIES;
  window.TAX_BRACKETS = TAX_BRACKETS;
  window.BONUS_BRACKETS = BONUS_BRACKETS;
  window.TAX_THRESHOLD_MONTHLY = TAX_THRESHOLD_MONTHLY;
  window.SPECIAL_DEDUCTIONS = SPECIAL_DEDUCTIONS;
  window.DATA_YEAR = DATA_YEAR;
}

// Node 导出（供单元测试）
if (typeof module !== "undefined" && module.exports) {
  module.exports = { CITIES, TAX_BRACKETS, BONUS_BRACKETS, TAX_THRESHOLD_MONTHLY, SPECIAL_DEDUCTIONS, DATA_YEAR };
}
