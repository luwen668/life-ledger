// 计算引擎单元测试 —— node test.js
const { calcInsurance, calcYear, calcBonus, reverseSalary } = require("./calc.js");

let passed = 0, failed = 0;
function eq(actual, expected, name, tolerance = 0.011) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) { passed++; }
  else { failed++; console.error(`✗ ${name}: 期望 ${expected}, 实际 ${actual}`); }
}

// ========== 案例 1：北京月薪 1 万，无专项扣除，公积金 12% ==========
// 手算：个人五险一金 = 养老800 + 医疗200+3 + 失业50 + 公积金1200 = 2253
// 月应税 = 10000-5000-2253 = 2747；年应税 32964 < 36000 → 全年税 32964*3% = 988.92
// 月税 82.41；税后 = 10000-2253-82.41 = 7664.59
let r = calcYear({ city: "beijing", salary: 10000, specialMonthly: 0, housingRate: 0.12 });
eq(r.ins.personalTotal, 2253, "北京1万-个人五险一金");
eq(r.yearTax, 988.92, "北京1万-全年个税");
eq(r.months[0].tax, 82.41, "北京1万-首月个税");
eq(r.months[0].net, 7664.59, "北京1万-首月税后");
eq(r.yearNet, 988.92 ? 10000 * 12 - 2253 * 12 - 988.92 : 0, "北京1万-全年税后");
eq(r.effectiveRate, 988.92 / 120000 * 100, "北京1万-有效税率");

// ========== 案例 2：年终奖单独计税的临界点陷阱 ==========
// 36000/12=3000 → 3%，税 1080
// 36001/12=3000.08 → 跳档 10%，税 36001*10%-210 = 3390.1
let b = calcBonus("beijing", 10000, 36000, 0, { housingRate: 0.12 });
eq(b.separate.tax, 1080, "年终奖36000单独计税");
b = calcBonus("beijing", 10000, 36001, 0, { housingRate: 0.12 });
eq(b.separate.tax, 3390.1, "年终奖36001单独计税(跳档)");
if (b.recommend === "merged") { passed++; } else { failed++; console.error("✗ 年终奖36001应选合并: 实际 " + b.recommend); }

// ========== 案例 3：北京月薪 5 万（触发社保上限）==========
// 社保基数封顶 35811：养老个人 2864.88，医疗 716.22+3，失业 179.06
// 公积金基数封顶 35811，12% = 4297.32
// 个人合计 8060.48；月应税 36939.52；年应税 443274.24
// 443274.24 > 420000 → 落入 30% 档：443274.24*30% - 52920 = 80062.27
r = calcYear({ city: "beijing", salary: 50000, specialMonthly: 0, housingRate: 0.12 });
eq(r.ins.socialBase, 35811, "北京5万-社保封顶");
eq(r.ins.housingBase, 35811, "北京5万-公积金封顶");
eq(r.ins.personalTotal, 8060.48, "北京5万-个人五险一金");
eq(r.yearTax, 80062.27, "北京5万-全年个税");

// ========== 案例 4：税后反推 ==========
const rev = reverseSalary("beijing", 7664.59, { specialMonthly: 0, housingRate: 0.12 });
eq(rev.salary, 10000, "反推税前(目标7664.59)", 1);

// ========== 案例 5：深圳非深户 vs 深户 ==========
const sz = calcInsurance("shenzhen", { salary: 20000, housingRate: 0.12 });
eq(sz.items.pension.company, 3200, "深圳非深户-养老单位16%");
eq(sz.items.medical.personal, 400, "深圳-医保个人2%");
eq(sz.items.unemployment.personal, 40, "深圳-失业个人0.2%");
const szHukou = calcInsurance("shenzhen", { salary: 20000, housingRate: 0.12, isShenzhenHukou: true });
eq(szHukou.items.pension.company, 3400, "深圳深户-养老单位17%");

// ========== 案例 6：成都医保固定基数 7646 ==========
const cd = calcInsurance("chengdu", { salary: 30000, housingRate: 0.12 });
eq(cd.items.medical.base, 7646, "成都-医保基数固定7646");
eq(cd.items.medical.personal, 152.92, "成都-医保个人 7646*2%");

// ========== 案例 7：武汉医疗 +7 元大病 ==========
const wh = calcInsurance("wuhan", { salary: 10000, housingRate: 0.12 });
eq(wh.items.medical.personal, 207, "武汉-医保个人200+7");

// ========== 案例 8：专项附加扣除生效 ==========
// 北京1万 + 赡养老人3000：月应税 = 10000-5000-2253-3000 = -253 → 全年税 0
r = calcYear({ city: "beijing", salary: 10000, specialMonthly: 3000, housingRate: 0.12 });
eq(r.yearTax, 0, "专项扣除-全年免税");
eq(r.yearNet, 10000 * 12 - 2253 * 12, "专项扣除-全年税后");

// ========== 案例 9：上海公积金比例上限 7% ==========
const sh = calcYear({ city: "shanghai", salary: 30000, specialMonthly: 0, housingRate: 0.07 });
eq(sh.ins.items.housing.personal, 2100, "上海-公积金7%");

console.log(`\n${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
