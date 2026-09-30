// ============================================================
// 工资个税计算器 · 纯计算引擎（无 DOM 依赖，可 Node 测试）
// ============================================================
(function (root, factory) {
  const D = typeof module !== "undefined" && module.exports
    ? require("./data.js")
    : root;
  const api = factory(D);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof self !== "undefined" ? self : globalThis, function (D) {
  const { CITIES, TAX_BRACKETS, BONUS_BRACKETS, TAX_THRESHOLD_MONTHLY } = D;

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
  const r2 = (v) => Math.round(v * 100) / 100;

  // 按年度综合所得税率表计算税额
  function annualTax(taxable) {
    if (taxable <= 0) return 0;
    for (const b of TAX_BRACKETS) {
      if (taxable <= b.limit) return r2(taxable * b.rate - b.deduct);
    }
    return 0;
  }

  // 年终奖单独计税
  function bonusTaxSeparate(bonus) {
    if (bonus <= 0) return 0;
    const monthly = bonus / 12;
    for (const b of BONUS_BRACKETS) {
      if (monthly <= b.limit) return r2(bonus * b.rate - b.deduct);
    }
    return 0;
  }

  // ------------------------------------------------------------
  // 五险一金计算
  // opts: { salary, socialBaseOverride, housingBaseOverride, housingRate, isShenzhenHukou }
  // ------------------------------------------------------------
  function calcInsurance(cityKey, opts) {
    const city = CITIES[cityKey];
    if (!city) throw new Error("未知城市: " + cityKey);
    const salary = Math.max(0, Number(opts.salary) || 0);

    const socialBase = clamp(
      opts.socialBaseOverride != null ? opts.socialBaseOverride : salary,
      city.socialBase.min, city.socialBase.max
    );

    let medicalBase;
    if (city.medicalBaseFixed) {
      medicalBase = city.medicalBaseFixed;
    } else if (city.medicalBase) {
      medicalBase = clamp(
        opts.socialBaseOverride != null ? opts.socialBaseOverride : salary,
        city.medicalBase.min, city.medicalBase.max
      );
    } else {
      medicalBase = socialBase;
    }

    let unemploymentBase = socialBase;
    if (city.unemploymentBase) {
      unemploymentBase = clamp(
        opts.socialBaseOverride != null ? opts.socialBaseOverride : salary,
        city.unemploymentBase.min, city.unemploymentBase.max
      );
    }

    const housingBase = clamp(
      opts.housingBaseOverride != null ? opts.housingBaseOverride : salary,
      city.housingFund.min, city.housingFund.max
    );
    const housingRate = clamp(
      Number(opts.housingRate != null ? opts.housingRate : city.housingFund.rateDefault),
      city.housingFund.rateMin, city.housingFund.rateMax
    );

    let pensionCompanyRate = city.rates.pension.c;
    if (cityKey === "shenzhen" && opts.isShenzhenHukou) {
      pensionCompanyRate = city.hukouPensionCompany;
    }

    const items = {
      pension:   { label: "养老保险", base: socialBase,        companyRate: pensionCompanyRate,        personalRate: city.rates.pension.p },
      medical:   { label: "医疗保险", base: medicalBase,       companyRate: city.rates.medical.c,      personalRate: city.rates.medical.p },
      unemployment:{ label: "失业保险", base: unemploymentBase, companyRate: city.rates.unemployment.c, personalRate: city.rates.unemployment.p },
      injury:    { label: "工伤保险", base: socialBase,        companyRate: city.rates.injury.c,      personalRate: 0 },
      maternity: { label: "生育保险", base: medicalBase,       companyRate: city.rates.maternity.c,   personalRate: 0 },
      housing:   { label: "公积金",   base: housingBase,       companyRate: housingRate,              personalRate: housingRate },
    };

    let company = 0, personal = 0;
    for (const k of Object.keys(items)) {
      const it = items[k];
      it.company = r2(it.base * it.companyRate);
      it.personal = r2(it.base * it.personalRate);
      company += it.company;
      personal += it.personal;
    }
    if (city.medicalExtraPersonal) {
      items.medical.personal += city.medicalExtraPersonal;
      items.medical.extra = city.medicalExtraPersonal;
      personal += city.medicalExtraPersonal;
    }

    return {
      items, city,
      companyTotal: r2(company),
      personalTotal: r2(personal),
      socialBase, medicalBase, housingBase, housingRate,
      // 个税专项扣除（三险一金个人部分，不含工伤/生育）
      taxDeductiblePersonal: r2(
        items.pension.personal + items.medical.personal + items.unemployment.personal + items.housing.personal
      ),
    };
  }

  // ------------------------------------------------------------
  // 全年工资计算（累计预扣法）
  // opts: { city, salary, bonus, socialBaseOverride, housingBaseOverride, housingRate,
  //         specialMonthly （专项附加扣除/月）, isShenzhenHukou }
  // ------------------------------------------------------------
  function calcYear(opts) {
    const salary = Math.max(0, Number(opts.salary) || 0);
    const bonus = Math.max(0, Number(opts.bonus) || 0);
    const special = Math.max(0, Number(opts.specialMonthly) || 0);

    const ins = calcInsurance(opts.city, opts);
    const monthlyFixed = salary - TAX_THRESHOLD_MONTHLY - ins.taxDeductiblePersonal - special;

    const months = [];
    let cumIncome = 0, cumIns = 0, cumTax = 0;
    for (let m = 1; m <= 12; m++) {
      cumIncome += salary;
      cumIns += ins.taxDeductiblePersonal;
      const cumTaxable = cumIncome - TAX_THRESHOLD_MONTHLY * m - cumIns - special * m;
      const cumTaxShould = annualTax(cumTaxable);
      const monthTax = r2(cumTaxShould - cumTax);
      cumTax = cumTaxShould;
      months.push({
        month: m,
        gross: salary,
        insurance: ins.personalTotal,
        taxable: r2(Math.max(0, monthlyFixed)),
        cumTaxable: r2(Math.max(0, cumTaxable)),
        tax: monthTax,
        net: r2(salary - ins.personalTotal - monthTax),
      });
    }

    const yearGross = salary * 12;
    const yearIns = r2(ins.personalTotal * 12);
    const yearTaxable = r2(yearGross - TAX_THRESHOLD_MONTHLY * 12 - yearIns - special * 12);
    const yearTax = annualTax(yearTaxable);
    const yearNet = r2(yearGross - yearIns - yearTax);

    return {
      months, ins,
      yearGross, yearIns, yearTaxable, yearTax, yearNet,
      yearSpecial: special * 12,
      avgNet: r2(yearNet / 12),
      effectiveRate: yearGross > 0 ? r2((yearTax / yearGross) * 100) : 0,
      // 不含年终奖
    };
  }

  // ------------------------------------------------------------
  // 年终奖两种算法对比
  // bonusStrategy: "separate" | "merged"
  // ------------------------------------------------------------
  function calcBonus(city, salary, bonus, specialMonthly, opts) {
    if (!bonus || bonus <= 0) return null;
    const o = Object.assign({ city, salary, bonus: 0, specialMonthly }, opts || {});

    const separateTax = bonusTaxSeparate(bonus);
    const separateNet = r2(bonus - separateTax);

    // 并入综合所得：年终奖 + 全年工资一起按年算
    const ins = calcInsurance(city, o);
    const taxable = salary * 12 + bonus - TAX_THRESHOLD_MONTHLY * 12 - ins.taxDeductiblePersonal * 12 - specialMonthly * 12;
    const mergedTotalTax = annualTax(taxable);
    const baseYear = calcYear(o);
    const mergedBonusTax = r2(mergedTotalTax - baseYear.yearTax);
    const mergedNet = r2(bonus - mergedBonusTax);

    return {
      separate: { tax: separateTax, net: separateNet },
      merged: { tax: mergedBonusTax, net: mergedNet },
      recommend: separateNet >= mergedNet ? "separate" : "merged",
    };
  }

  // ------------------------------------------------------------
  // 税后反推税前（二分查找；以全年平均税后月薪为目标）
  // targetNet: 期望的月均税后到手
  // ------------------------------------------------------------
  function reverseSalary(city, targetNet, opts) {
    targetNet = Number(targetNet);
    if (!(targetNet >= 0)) return null;
    let lo = 0, hi = Math.max(targetNet * 3, 20000);
    // 保证 hi 足够大（opts 里可能带有 salary，必须让 mid 覆盖它）
    for (let i = 0; i < 80 && calcYear(Object.assign({}, opts, { city, salary: hi })).avgNet < targetNet; i++) {
      hi *= 2;
    }
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      const net = calcYear(Object.assign({}, opts, { city, salary: mid })).avgNet;
      if (Math.abs(net - targetNet) < 0.01) break;
      if (net < targetNet) lo = mid; else hi = mid;
    }
    const salary = r2((lo + hi) / 2);
    const result = calcYear(Object.assign({}, opts, { city, salary }));
    return { salary, result };
  }

  return { calcInsurance, calcYear, calcBonus, reverseSalary, annualTax, bonusTaxSeparate, r2 };
});
