// 工资个税计算器 · 界面逻辑
(function () {
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => (n == null || isNaN(n) ? "—" : Number(n).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const fmtInt = (n) => (n == null || isNaN(n) ? "—" : Math.round(n).toLocaleString("zh-CN"));

  // ---------- 初始化城市下拉 ----------
  const citySel = $("city");
  Object.entries(CITIES).forEach(([key, c]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = `${c.name}（社保 ${fmtInt(c.socialBase.min)}–${fmtInt(c.socialBase.max)}）`;
    citySel.appendChild(opt);
  });
  citySel.value = "beijing";

  // ---------- 专项附加扣除 ----------
  const specialList = $("special-list");
  SPECIAL_DEDUCTIONS.forEach((d) => {
    const row = document.createElement("div");
    row.className = "special-row";
    let input;
    if (d.key === "elderly") {
      input = `<select class="input" data-special="${d.key}">
        <option value="0">不扣除</option>
        <option value="1500">非独生 · 分摊 1500</option>
        <option value="3000">独生子女 · 3000</option>
      </select>`;
    } else if (d.key === "mortgage" || d.key === "rent") {
      input = `<select class="input" data-special="${d.key}">
        <option value="0">不扣除</option>
        <option value="${d.per}">扣除 ${d.per}</option>
      </select>`;
    } else if (d.key === "childrenEdu" || d.key === "infant") {
      input = `<input type="number" class="input num" data-special="${d.key}" min="0" max="10" step="1" value="0" />`;
    } else {
      input = `<select class="input" data-special="${d.key}">
        <option value="0">不扣除</option>
        <option value="400">扣除 400</option>
      </select>`;
    }
    row.innerHTML = `<div class="special-name">${d.name}<span class="per">${d.hint}</span></div>${input}`;
    specialList.appendChild(row);
  });

  // ---------- 公积金比例滑块联动 ----------
  const rateSlider = $("housing-rate");
  function syncRateUI() {
    const city = CITIES[citySel.value];
    rateSlider.max = Math.round(city.housingFund.rateMax * 100);
    if (+rateSlider.value > +rateSlider.max) rateSlider.value = rateSlider.max;
    const v = +rateSlider.value;
    $("housing-rate-label").textContent = v + "%";
    rateSlider.style.setProperty("--fill", ((v - 5) / (12 - 5)) * 100 + "%");
  }

  // ---------- 收集参数 ----------
  function collect() {
    const specialEls = document.querySelectorAll("[data-special]");
    let specialMonthly = 0;
    specialEls.forEach((el) => {
      const key = el.dataset.special;
      const def = SPECIAL_DEDUCTIONS.find((d) => d.key === key);
      const v = Number(el.value) || 0;
      specialMonthly += (def.key === "childrenEdu" || def.key === "infant") ? v * def.per : v;
    });
    return {
      city: citySel.value,
      salary: Number($("salary").value) || 0,
      bonus: Number($("bonus").value) || 0,
      housingRate: Number(rateSlider.value) / 100,
      socialBaseOverride: $("social-base").value === "" ? null : Number($("social-base").value),
      housingBaseOverride: $("housing-base").value === "" ? null : Number($("housing-base").value),
      specialMonthly,
      isShenzhenHukou: $("hukou").value === "yes",
    };
  }

  // ---------- 主计算渲染 ----------
  let chart = null;
  function render() {
    const p = collect();
    const city = CITIES[p.city];
    const r = Calc.calcYear(p);

    // 城市联动
    $("hukou-field").hidden = p.city !== "shenzhen";
    $("city-note").textContent = "※ " + city.note;
    $("base-range-hint").textContent =
      `社保基数范围 ${fmtInt(city.socialBase.min)} – ${fmtInt(city.socialBase.max)}；公积金基数范围 ${fmtInt(city.housingFund.min)} – ${fmtInt(city.housingFund.max)}`;

    // KPI
    const bonusInfo = Calc.calcBonus(p.city, p.salary, p.bonus, p.specialMonthly, p);
    const bonusNet = bonusInfo ? bonusInfo[bonusInfo.recommend].net : 0;
    const bonusTax = bonusInfo ? bonusInfo[bonusInfo.recommend].tax : 0;
    const yearNetAll = r.yearNet + bonusNet;

    $("kpi-grid").innerHTML = [
      { label: "月均税后到手", v: r.avgNet + (p.bonus > 0 ? bonusNet / 12 : 0), c: "var(--cyan)", sub: "含年终奖摊薄" },
      { label: "月均个税", v: r.yearTax / 12 + (p.bonus > 0 ? bonusTax / 12 : 0), c: "var(--amber)", sub: `全年 ${fmt(r.yearTax + bonusTax)}` },
      { label: "月五险一金（个人）", v: r.ins.personalTotal, c: "var(--violet)", sub: `全年 ${fmt(r.yearIns)}` },
      { label: "单位月缴成本", v: r.ins.companyTotal, c: "var(--green)", sub: "招聘真实成本" },
      { label: "有效税率", v: r.effectiveRate / 100, c: "var(--red)", sub: "个税 ÷ 税前年薪", isPct: true },
      { label: "全年税后总收入", v: yearNetAll, c: "var(--cyan)", sub: `税前 ${fmt(r.yearGross + p.bonus)}` },
    ].map((k) => `
      <div class="kpi" style="--kc:${k.c}">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value">${k.isPct ? (k.v * 100).toFixed(2) + "%" : fmt(k.v)}</div>
        <div class="kpi-sub">${k.sub}</div>
      </div>`).join("");

    // 逐月表
    let cum = 0;
    $("month-table").querySelector("tbody").innerHTML = r.months.map((m) => {
      cum += m.tax;
      return `<tr>
        <td>${m.month} 月</td>
        <td>${fmt(m.gross)}</td>
        <td>${fmt(m.insurance)}</td>
        <td class="tax">${fmt(m.tax)}</td>
        <td class="neg">${fmt(m.net)}</td>
        <td>${fmt(cum)}</td>
      </tr>`;
    }).join("");

    renderChart(r);
    renderBonus(p, r, bonusInfo);
  }

  // ---------- 图表：全年构成堆叠柱 ----------
  function renderChart(r) {
    if (!chart) chart = echarts.init($("chart"));
    const months = r.months.map((m) => m.month + "月");
    chart.setOption({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(11,15,26,0.95)",
        borderColor: "rgba(34,211,238,0.3)",
        textStyle: { color: "#e2e8f0" },
        valueFormatter: (v) => fmt(v),
      },
      legend: {
        textStyle: { color: "#94a3b8" },
        top: 0,
        data: ["税后到手", "五险一金", "个税"],
      },
      grid: { left: 60, right: 20, top: 42, bottom: 30 },
      xAxis: {
        type: "category", data: months,
        axisLine: { lineStyle: { color: "rgba(148,163,184,0.2)" } },
        axisLabel: { color: "#64748b" },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.08)" } },
        axisLabel: { color: "#64748b", formatter: (v) => (v >= 10000 ? v / 10000 + "万" : v) },
      },
      series: [
        { name: "税后到手", type: "bar", stack: "s", data: r.months.map((m) => m.net), itemStyle: { color: "#22d3ee", borderRadius: [0, 0, 0, 0] } },
        { name: "五险一金", type: "bar", stack: "s", data: r.months.map((m) => m.insurance), itemStyle: { color: "#8b5cf6" } },
        { name: "个税", type: "bar", stack: "s", data: r.months.map((m) => m.tax), itemStyle: { color: "#f59e0b", borderRadius: [4, 4, 0, 0] } },
      ],
    });
  }

  // ---------- 年终奖对比 ----------
  function renderBonus(p, r, info) {
    const box = $("bonus-compare");
    if (!p.bonus || !info) {
      box.innerHTML = `<div class="panel" style="grid-column:1/-1"><p class="hint">在左侧输入年终奖金额后，这里会自动对比两种计税方式。</p></div>`;
      return;
    }
    const best = info.recommend;
    const opt = (key, title, method, d) => `
      <div class="bonus-card ${best === key ? "best" : ""}">
        ${best === key ? '<span class="badge">推荐 · 更省</span>' : ""}
        <h3>${title}</h3>
        <p class="method">${method}</p>
        <div class="bonus-line"><span>年终奖税额</span><b class="tax-v">${fmt(d.tax)}</b></div>
        <div class="bonus-line"><span>年终奖到手</span><b class="net-v">${fmt(d.net)}</b></div>
        <div class="bonus-line"><span>全年总税（工资+年终奖）</span><b class="tax-v">${fmt(r.yearTax + d.tax)}</b></div>
        <div class="bonus-total">全年税后合计 <b>${fmt(r.yearNet + d.net)}</b></div>
      </div>`;
    box.innerHTML =
      opt("separate", "单独计税", "年终奖 ÷ 12 找税率，单独算税（政策延续至 2027 年底）", info.separate) +
      opt("merged", "并入综合所得", "年终奖与工资合并，按年度综合所得税率表计算", info.merged);
  }

  // ---------- 反推 ----------
  $("reverse-btn").onclick = () => {
    const p = collect();
    const target = Number($("target-net").value);
    const box = $("reverse-result");
    if (!target || target <= 0) {
      box.innerHTML = `<p class="hint">请输入有效的目标税后金额。</p>`;
      return;
    }
    const rev = Calc.reverseSalary(p.city, target, p);
    const r = rev.result;
    box.innerHTML = `
      <div class="reverse-card">
        <p style="font-size:13px;color:var(--text-dim)">要达到月均到手 <b style="color:var(--cyan)">${fmt(target)}</b>，税前月薪约为</p>
        <div class="big">¥ ${fmt(rev.salary)}</div>
        <div class="reverse-grid">
          <div class="cell">月五险一金（个人）<b>${fmt(r.ins.personalTotal)}</b></div>
          <div class="cell">月均个税<b>${fmt(r.yearTax / 12)}</b></div>
          <div class="cell">全年税后<b>${fmt(r.yearNet)}</b></div>
          <div class="cell">单位月缴成本<b>${fmt(r.ins.companyTotal)}</b></div>
        </div>
      </div>`;
  };

  // ---------- 城市数据页 ----------
  function renderCities() {
    $("cities-year").textContent = DATA_YEAR + "口径 · 每年约 7 月调整";
    const rows = Object.values(CITIES).map((c) => `
      <tr>
        <td style="font-family:var(--sans);color:var(--text);font-weight:700">${c.name}</td>
        <td>${fmtInt(c.socialBase.min)} – ${fmtInt(c.socialBase.max)}</td>
        <td>${c.medicalBaseFixed ? fmtInt(c.medicalBaseFixed) + "（固定）" : c.medicalBase ? fmtInt(c.medicalBase.min) + " – " + fmtInt(c.medicalBase.max) : "同社保"}</td>
        <td>${(c.rates.pension.c * 100).toFixed(1)}% / ${(c.rates.pension.p * 100).toFixed(0)}%</td>
        <td>${(c.rates.medical.c * 100).toFixed(2)}% / ${(c.rates.medical.p * 100).toFixed(0)}%</td>
        <td>${(c.rates.unemployment.c * 100).toFixed(1)}% / ${(c.rates.unemployment.p * 100).toFixed(1)}%</td>
        <td>${fmtInt(c.housingFund.min)} – ${fmtInt(c.housingFund.max)}</td>
        <td>${c.housingFund.rateMin * 100}%–${c.housingFund.rateMax * 100}%</td>
      </tr>`).join("");
    $("city-table").innerHTML = `
      <thead><tr>
        <th>城市</th><th>社保基数</th><th>医保基数</th><th>养老 单位/个人</th><th>医疗 单位/个人</th><th>失业 单位/个人</th><th>公积金基数</th><th>公积金比例</th>
      </tr></thead><tbody>${rows}</tbody>`;
    $("city-disclaimer").textContent =
      "比例均为 2025 年度公开文件口径，工伤/生育仅单位缴纳已并入对应列；部分城市费率为区间估算值（详见各城备注），实际以当地官方最新文件为准。";
  }

  // ---------- 标签切换 ----------
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".tab-page").forEach((pg) => pg.classList.remove("active"));
      $("page-" + tab.dataset.tab).classList.add("active");
      if (tab.dataset.tab === "salary" && chart) setTimeout(() => chart.resize(), 50);
    };
  });

  // ---------- 事件绑定 ----------
  ["input", "change"].forEach((evt) => {
    document.querySelector(".input-panel").addEventListener(evt, render);
  });
  rateSlider.addEventListener("input", syncRateUI);
  citySel.addEventListener("change", () => {
    const c = CITIES[citySel.value];
    rateSlider.value = Math.round(c.housingFund.rateDefault * 100);
    syncRateUI();
    render();
  });
  window.addEventListener("resize", () => chart && chart.resize());

  // ---------- 启动 ----------
  $("data-year").textContent = DATA_YEAR;
  syncRateUI();
  renderCities();
  render();
})();
