const state = {
  data: null,
  filters: {
    currency: "ALL",
    program: "ALL",
    channel: "ALL",
    status: "ALL",
  },
};

const els = {
  sourceMeta: document.getElementById("sourceMeta"),
  currencyFilter: document.getElementById("currencyFilter"),
  programFilter: document.getElementById("programFilter"),
  channelFilter: document.getElementById("channelFilter"),
  statusFilter: document.getElementById("statusFilter"),
  resetFilters: document.getElementById("resetFilters"),
  exportView: document.getElementById("exportView"),
  paidRevenue: document.getElementById("paidRevenue"),
  paidRevenueDetail: document.getElementById("paidRevenueDetail"),
  paidTransactions: document.getElementById("paidTransactions"),
  activeTransactions: document.getElementById("activeTransactions"),
  pendingRevenue: document.getElementById("pendingRevenue"),
  pendingTransactions: document.getElementById("pendingTransactions"),
  avgTicket: document.getElementById("avgTicket"),
  repeatContacts: document.getElementById("repeatContacts"),
  executiveReadout: document.getElementById("executiveReadout"),
  nextAction: document.getElementById("nextAction"),
  monthRange: document.getElementById("monthRange"),
  monthlyChart: document.getElementById("monthlyChart"),
  riskList: document.getElementById("riskList"),
  programBars: document.getElementById("programBars"),
  channelBars: document.getElementById("channelBars"),
  typeBars: document.getElementById("typeBars"),
  statusDonut: document.getElementById("statusDonut"),
  visibleRows: document.getElementById("visibleRows"),
  recordsTable: document.getElementById("recordsTable"),
};

const currencyLabels = {
  PEN: "S/",
  USD: "US$",
  SIN_MONEDA: "Sin moneda",
};

function fmtNumber(value) {
  return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 }).format(value || 0);
}

function fmtMoney(value, currency) {
  if (currency === "ALL") {
    return Object.entries(value || {})
      .filter(([, amount]) => amount > 0)
      .map(([key, amount]) => `${currencyLabels[key] || key} ${fmtNumber(amount)}`)
      .join(" · ");
  }
  return `${currencyLabels[currency] || currency} ${fmtNumber((value || {})[currency] || 0)}`;
}

function monthLabel(month) {
  if (!month || month === "Sin fecha") return "Sin fecha";
  const [year, mm] = month.split("-");
  const names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${names[Number(mm) - 1]} ${year.slice(2)}`;
}

function getFilteredRecords() {
  return state.data.records.filter((record) => {
    return (
      (state.filters.currency === "ALL" || record.currency === state.filters.currency) &&
      (state.filters.program === "ALL" || record.program === state.filters.program) &&
      (state.filters.channel === "ALL" || record.channel === state.filters.channel) &&
      (state.filters.status === "ALL" || record.status === state.filters.status)
    );
  });
}

function summarize(records) {
  const summary = {
    paidCount: 0,
    pendingCount: 0,
    activeCount: 0,
    paid: {},
    pending: {},
    avgTicket: {},
    byProgram: new Map(),
    byChannel: new Map(),
    byType: new Map(),
    byStatus: new Map(),
    byMonth: new Map(),
  };

  for (const record of records) {
    const currency = record.currency;
    const amount = Number(record.amount || 0);
    summary.byStatus.set(record.status, (summary.byStatus.get(record.status) || 0) + 1);

    if (["PAGADO", "PENDIENTE"].includes(record.status)) summary.activeCount += 1;

    if (record.status === "PAGADO") {
      summary.paidCount += 1;
      summary.paid[currency] = (summary.paid[currency] || 0) + amount;
      addGroup(summary.byProgram, record.program, currency, amount, "paidCount");
      addGroup(summary.byChannel, record.channel, currency, amount, "paidCount");
      addGroup(summary.byType, record.type, currency, amount, "paidCount");
      addMonth(summary.byMonth, record.month, currency, amount, "paidCount");
    }

    if (record.status === "PENDIENTE") {
      summary.pendingCount += 1;
      summary.pending[currency] = (summary.pending[currency] || 0) + amount;
      addGroup(summary.byProgram, record.program, currency, amount, "pendingCount");
      addGroup(summary.byChannel, record.channel, currency, amount, "pendingCount");
      addMonth(summary.byMonth, record.month, currency, amount, "pendingCount", "pending");
    }
  }

  for (const currency of ["PEN", "USD"]) {
    const paidInCurrency = records.filter((r) => r.status === "PAGADO" && r.currency === currency).length;
    summary.avgTicket[currency] = (summary.paid[currency] || 0) / Math.max(1, paidInCurrency);
  }

  return summary;
}

function addGroup(map, key, currency, amount, countKey) {
  const item = map.get(key) || { name: key, paid: {}, pending: {}, paidCount: 0, pendingCount: 0 };
  item[countKey] += 1;
  const bucket = countKey === "pendingCount" ? item.pending : item.paid;
  bucket[currency] = (bucket[currency] || 0) + amount;
  map.set(key, item);
}

function addMonth(map, month, currency, amount, countKey, bucketName = "paid") {
  const item = map.get(month) || { month, paid: {}, pending: {}, paidCount: 0, pendingCount: 0 };
  item[countKey] += 1;
  item[bucketName][currency] = (item[bucketName][currency] || 0) + amount;
  map.set(month, item);
}

function totalForCurrency(bucket) {
  if (state.filters.currency !== "ALL") return bucket[state.filters.currency] || 0;
  return (bucket.PEN || 0) + (bucket.USD || 0);
}

function populateFilters() {
  const programs = [...new Set(state.data.records.map((r) => r.program))].sort();
  const channels = [...new Set(state.data.records.map((r) => r.channel))].sort();
  for (const program of programs) {
    els.programFilter.add(new Option(program, program));
  }
  for (const channel of channels) {
    els.channelFilter.add(new Option(channel, channel));
  }
}

function renderKpis(summary) {
  els.paidRevenue.textContent = fmtMoney(summary.paid, state.filters.currency) || "0";
  els.paidRevenueDetail.textContent = `${fmtNumber(summary.paidCount)} pagos cobrados`;
  els.paidTransactions.textContent = fmtNumber(summary.paidCount);
  els.activeTransactions.textContent = `${fmtNumber(summary.activeCount)} transacciones activas`;
  els.pendingRevenue.textContent = fmtMoney(summary.pending, state.filters.currency) || "0";
  els.pendingTransactions.textContent = `${fmtNumber(summary.pendingCount)} pagos pendientes`;
  els.avgTicket.textContent =
    state.filters.currency === "USD"
      ? `US$ ${fmtNumber(summary.avgTicket.USD)}`
      : state.filters.currency === "PEN"
        ? `S/ ${fmtNumber(summary.avgTicket.PEN)}`
        : `S/ ${fmtNumber(summary.avgTicket.PEN)} · US$ ${fmtNumber(summary.avgTicket.USD)}`;
  els.repeatContacts.textContent = `${fmtNumber(state.data.summary.repeatContacts)} contactos recurrentes detectados`;
}

function renderDecision(summary) {
  const programs = [...summary.byProgram.values()].sort((a, b) => totalForCurrency(b.paid) - totalForCurrency(a.paid));
  const topProgram = programs[0];
  const pendingPrograms = programs
    .filter((p) => p.pendingCount > 0)
    .sort((a, b) => totalForCurrency(b.pending) - totalForCurrency(a.pending));
  const topPending = pendingPrograms[0];
  const paid = fmtMoney(summary.paid, state.filters.currency) || "0";
  const pending = fmtMoney(summary.pending, state.filters.currency) || "0";

  els.executiveReadout.textContent = topProgram
    ? `La vista filtrada muestra ${paid} cobrados. El programa con mayor traccion es ${topProgram.name}, con ${fmtNumber(topProgram.paidCount)} pagos registrados.`
    : "No hay registros para la combinacion de filtros actual.";

  els.nextAction.textContent = topPending
    ? `Priorizar cobranza y validacion de ${topPending.name}: concentra ${fmtNumber(topPending.pendingCount)} pendientes por ${fmtMoney(topPending.pending, state.filters.currency) || pending}.`
    : `Sin pendientes visibles en esta vista. Enfocar la siguiente iteracion en escalar el canal con mayor pago confirmado.`;
}

function renderMonthly(summary) {
  const months = [...summary.byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  const max = Math.max(1, ...months.map((m) => totalForCurrency(m.paid)));
  els.monthRange.textContent = months.length ? `${monthLabel(months[0].month)} - ${monthLabel(months[months.length - 1].month)}` : "-";
  els.monthlyChart.innerHTML = months
    .map((m) => {
      const total = totalForCurrency(m.paid);
      const height = Math.max(8, Math.round((total / max) * 220));
      return `
        <div class="month-col" title="${monthLabel(m.month)}: ${fmtMoney(m.paid, state.filters.currency)}">
          <div class="month-stack"><div class="month-bar" style="height:${height}px"></div></div>
          <strong>${fmtNumber(total)}</strong>
          <small>${monthLabel(m.month)}</small>
        </div>
      `;
    })
    .join("");
}

function renderBars(target, items, options = {}) {
  const limit = options.limit || 10;
  const mode = options.mode || "paid";
  const rows = [...items]
    .sort((a, b) => totalForCurrency(b[mode]) - totalForCurrency(a[mode]))
    .slice(0, limit);
  const max = Math.max(1, ...rows.map((row) => totalForCurrency(row[mode])));
  target.innerHTML = rows
    .map((row) => {
      const total = totalForCurrency(row[mode]);
      const width = Math.round((total / max) * 100);
      const count = mode === "pending" ? row.pendingCount : row.paidCount;
      return `
        <div class="bar-row">
          <div class="bar-meta"><strong>${row.name}</strong><span>${fmtMoney(row[mode], state.filters.currency) || "0"} · ${fmtNumber(count)}</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
        </div>
      `;
    })
    .join("");
}

function renderRisks() {
  const risk = state.data.summary.risk;
  const risks = [
    {
      level: risk.futureDatedRows > 0 ? "high" : "low",
      title: "Registros con fecha futura",
      detail: "Revisar si son preventas, errores de digitacion o cohortes futuras.",
      value: risk.futureDatedRows,
    },
    {
      level: risk.missingId > 100 ? "high" : "medium",
      title: "Registros sin ID de programa",
      detail: "Dificulta trazabilidad por cohortes, certificacion y automatizacion.",
      value: risk.missingId,
    },
    {
      level: risk.missingChannel > 20 ? "medium" : "low",
      title: "Canal de pago faltante",
      detail: "Reduce lectura de conversion por canal y conciliacion.",
      value: risk.missingChannel,
    },
    {
      level: risk.paidWithoutVoucher > 0 ? "medium" : "low",
      title: "Pagos sin voucher visible",
      detail: "Requiere validacion bancaria antes de cerrar cobranza.",
      value: risk.paidWithoutVoucher,
    },
  ];

  els.riskList.innerHTML = risks
    .map(
      (item) => `
      <div class="risk-item ${item.level}">
        <div class="risk-dot"></div>
        <div><strong>${item.title}</strong><span>${item.detail}</span></div>
        <b>${fmtNumber(item.value)}</b>
      </div>
    `,
    )
    .join("");
}

function renderStatus(summary) {
  const statuses = [...summary.byStatus.entries()].sort((a, b) => b[1] - a[1]);
  els.statusDonut.innerHTML = statuses
    .map(
      ([status, count]) => `
      <div class="status-card">
        <span>${status}</span>
        <strong>${fmtNumber(count)}</strong>
      </div>
    `,
    )
    .join("");
}

function renderTable(records) {
  const rows = records
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 80);
  els.visibleRows.textContent = `${fmtNumber(records.length)} registros · mostrando ${fmtNumber(rows.length)}`;
  els.recordsTable.innerHTML = rows
    .map(
      (r) => `
      <tr>
        <td>${monthLabel(r.month)}</td>
        <td>${r.program}</td>
        <td>${r.type}</td>
        <td>${r.channel}</td>
        <td><span class="status-badge ${r.status}">${r.status}</span></td>
        <td>${r.currency}</td>
        <td class="num">${fmtMoney({ [r.currency]: r.amount }, r.currency)}</td>
      </tr>
    `,
    )
    .join("");
}

function render() {
  const records = getFilteredRecords();
  const summary = summarize(records);
  renderKpis(summary);
  renderDecision(summary);
  renderMonthly(summary);
  renderBars(els.programBars, [...summary.byProgram.values()], { limit: 10 });
  renderBars(els.channelBars, [...summary.byChannel.values()], { limit: 12 });
  renderBars(els.typeBars, [...summary.byType.values()], { limit: 8 });
  renderRisks();
  renderStatus(summary);
  renderTable(records);
}

function bindEvents() {
  const map = [
    [els.currencyFilter, "currency"],
    [els.programFilter, "program"],
    [els.channelFilter, "channel"],
    [els.statusFilter, "status"],
  ];
  for (const [element, key] of map) {
    element.addEventListener("change", () => {
      state.filters[key] = element.value;
      render();
    });
  }

  els.resetFilters.addEventListener("click", () => {
    state.filters = { currency: "ALL", program: "ALL", channel: "ALL", status: "ALL" };
    for (const [element, key] of map) element.value = state.filters[key];
    render();
  });

  els.exportView.addEventListener("click", () => {
    const payload = {
      filters: state.filters,
      exportedAt: new Date().toISOString(),
      records: getFilteredRecords().length,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "aecode-sales-dashboard-view.json";
    link.click();
    URL.revokeObjectURL(url);
  });
}

async function boot() {
  const response = await fetch("data/dashboard-data.json");
  state.data = await response.json();
  els.sourceMeta.textContent = `${fmtNumber(state.data.meta.rowCount)} filas anonimizadas · generado ${state.data.meta.generatedAt.slice(0, 10)}`;
  populateFilters();
  bindEvents();
  render();
}

boot().catch((error) => {
  document.body.innerHTML = `<main class="panel"><h1>Error cargando dashboard</h1><p>${error.message}</p></main>`;
});

