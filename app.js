const state = {
  data: null,
  filters: {
    month: "ALL",
    currency: "ALL",
    productLine: "ALL",
    program: "ALL",
    type: "ALL",
    channel: "ALL",
    paymentType: "ALL",
    status: "ALL",
  },
};

const els = {
  sourceMeta: document.getElementById("sourceMeta"),
  monthFilter: document.getElementById("monthFilter"),
  currencyFilter: document.getElementById("currencyFilter"),
  productLineFilter: document.getElementById("productLineFilter"),
  programFilter: document.getElementById("programFilter"),
  typeFilter: document.getElementById("typeFilter"),
  channelFilter: document.getElementById("channelFilter"),
  paymentTypeFilter: document.getElementById("paymentTypeFilter"),
  statusFilter: document.getElementById("statusFilter"),
  resetFilters: document.getElementById("resetFilters"),
  exportView: document.getElementById("exportView"),
  paidRevenue: document.getElementById("paidRevenue"),
  paidRevenueDetail: document.getElementById("paidRevenueDetail"),
  activeEnrollments: document.getElementById("activeEnrollments"),
  activeEnrollmentDetail: document.getElementById("activeEnrollmentDetail"),
  activeUsers: document.getElementById("activeUsers"),
  userDetail: document.getElementById("userDetail"),
  activeCourses: document.getElementById("activeCourses"),
  courseDetail: document.getElementById("courseDetail"),
  pendingRevenue: document.getElementById("pendingRevenue"),
  pendingTransactions: document.getElementById("pendingTransactions"),
  executiveReadout: document.getElementById("executiveReadout"),
  nextAction: document.getElementById("nextAction"),
  riskReadout: document.getElementById("riskReadout"),
  monthRange: document.getElementById("monthRange"),
  monthlyChart: document.getElementById("monthlyChart"),
  statusCards: document.getElementById("statusCards"),
  typeBars: document.getElementById("typeBars"),
  userSegmentCards: document.getElementById("userSegmentCards"),
  courseBars: document.getElementById("courseBars"),
  productLineBars: document.getElementById("productLineBars"),
  channelBars: document.getElementById("channelBars"),
  paymentTypeBars: document.getElementById("paymentTypeBars"),
  riskList: document.getElementById("riskList"),
  pendingCourseBars: document.getElementById("pendingCourseBars"),
  visibleRows: document.getElementById("visibleRows"),
  recordsTable: document.getElementById("recordsTable"),
};

const currencyLabels = {
  PEN: "S/",
  USD: "US$",
  SIN_MONEDA: "Sin moneda",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtNumber(value) {
  return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 0 }).format(value || 0);
}

function fmtMoney(bucket, currency) {
  const data = bucket || {};
  if (currency === "ALL") {
    const parts = ["USD", "PEN"]
      .filter((key) => Number(data[key] || 0) > 0)
      .map((key) => `${currencyLabels[key] || key} ${fmtNumber(data[key])}`);
    return parts.length ? parts.join(" / ") : "0";
  }
  return `${currencyLabels[currency] || currency} ${fmtNumber(data[currency] || 0)}`;
}

function monthLabel(month) {
  if (!month || month === "Sin fecha") return "Sin fecha";
  const [year, mm] = month.split("-");
  const names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${names[Number(mm) - 1]} ${year.slice(2)}`;
}

function isActive(record) {
  return record.status === "PAGADO" || record.status === "PENDIENTE";
}

function valueScore(bucket) {
  if (state.filters.currency !== "ALL") return Number((bucket || {})[state.filters.currency] || 0);
  return Number((bucket || {}).PEN || 0) + Number((bucket || {}).USD || 0) * 3.7;
}

function getFilteredRecords() {
  return state.data.records.filter((record) => {
    return (
      (state.filters.month === "ALL" || record.month === state.filters.month) &&
      (state.filters.currency === "ALL" || record.currency === state.filters.currency) &&
      (state.filters.productLine === "ALL" || record.productLine === state.filters.productLine) &&
      (state.filters.program === "ALL" || record.program === state.filters.program) &&
      (state.filters.type === "ALL" || record.type === state.filters.type) &&
      (state.filters.channel === "ALL" || record.channel === state.filters.channel) &&
      (state.filters.paymentType === "ALL" || record.paymentType === state.filters.paymentType) &&
      (state.filters.status === "ALL" || record.status === state.filters.status)
    );
  });
}

function emptyGroup(name, extra = {}) {
  return {
    name,
    paid: {},
    pending: {},
    paidCount: 0,
    pendingCount: 0,
    activeEnrollments: 0,
    uniqueUsers: new Set(),
    ...extra,
  };
}

function addMoney(bucket, currency, amount) {
  bucket[currency] = (bucket[currency] || 0) + Number(amount || 0);
}

function groupAdd(map, key, record, extra = {}) {
  const item = map.get(key) || emptyGroup(key, extra);
  if (isActive(record)) {
    item.activeEnrollments += 1;
    item.uniqueUsers.add(record.userId);
  }
  if (record.status === "PAGADO") {
    item.paidCount += 1;
    addMoney(item.paid, record.currency, record.amount);
  }
  if (record.status === "PENDIENTE") {
    item.pendingCount += 1;
    addMoney(item.pending, record.currency, record.amount);
  }
  map.set(key, item);
}

function finalizeGroups(map) {
  return [...map.values()].map((item) => ({
    ...item,
    uniqueUsers: item.uniqueUsers instanceof Set ? item.uniqueUsers.size : item.uniqueUsers,
  }));
}

function summarize(records) {
  const summary = {
    paid: {},
    pending: {},
    paidCount: 0,
    pendingCount: 0,
    activeEnrollments: 0,
    activeUsers: new Set(),
    paidUsers: new Set(),
    allUsers: new Set(),
    userFrequency: new Map(),
    activeCourses: new Set(),
    byMonth: new Map(),
    byStatus: new Map(),
    byType: new Map(),
    byCourse: new Map(),
    byProductLine: new Map(),
    byChannel: new Map(),
    byPaymentType: new Map(),
    byPendingCourse: new Map(),
    byUserSegment: new Map(),
    risks: {
      missingChannel: 0,
      paidWithoutVoucher: 0,
      missingId: 0,
      missingContact: 0,
      futureDatedRows: 0,
    },
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const record of records) {
    const amount = Number(record.amount || 0);
    summary.allUsers.add(record.userId);
    summary.userFrequency.set(record.userId, (summary.userFrequency.get(record.userId) || 0) + 1);
    summary.byStatus.set(record.status, (summary.byStatus.get(record.status) || 0) + 1);

    if (record.channel === "Sin canal") summary.risks.missingChannel += 1;
    if (!record.hasId) summary.risks.missingId += 1;
    if (!record.hasContact) summary.risks.missingContact += 1;
    if (record.status === "PAGADO" && !record.hasVoucher) summary.risks.paidWithoutVoucher += 1;
    if (record.date && new Date(`${record.date}T00:00:00`) > today) summary.risks.futureDatedRows += 1;

    if (isActive(record)) {
      summary.activeEnrollments += 1;
      summary.activeUsers.add(record.userId);
      summary.activeCourses.add(record.course);
      groupAdd(summary.byMonth, record.month, record, { month: record.month });
      groupAdd(summary.byType, record.type, record);
      groupAdd(summary.byCourse, record.course, record, {
        productLine: record.productLine,
        course: record.course,
      });
      groupAdd(summary.byProductLine, record.productLine, record);
      groupAdd(summary.byUserSegment, record.userSegment, record);
    }

    groupAdd(summary.byChannel, record.channel, record);
    groupAdd(summary.byPaymentType, record.paymentType, record);

    if (record.status === "PAGADO") {
      summary.paidCount += 1;
      summary.paidUsers.add(record.userId);
      addMoney(summary.paid, record.currency, amount);
    }

    if (record.status === "PENDIENTE") {
      summary.pendingCount += 1;
      addMoney(summary.pending, record.currency, amount);
      groupAdd(summary.byPendingCourse, record.course, record, {
        productLine: record.productLine,
        course: record.course,
      });
    }
  }

  summary.repeatUsers = [...summary.userFrequency.values()].filter((count) => count > 1).length;
  return summary;
}

function fillOptions(select, values, formatter = (value) => value) {
  for (const value of values) {
    select.add(new Option(formatter(value), value));
  }
}

function populateFilters() {
  const records = state.data.records;
  const months = [...new Set(records.map((r) => r.month).filter(Boolean))].sort();
  const productLines = [...new Set(records.map((r) => r.productLine))].sort();
  const programs = [...new Set(records.map((r) => r.program))].sort();
  const types = [...new Set(records.map((r) => r.type))].sort();
  const channels = [...new Set(records.map((r) => r.channel))].sort();
  const paymentTypes = [...new Set(records.map((r) => r.paymentType))].sort();

  fillOptions(els.monthFilter, months, monthLabel);
  fillOptions(els.productLineFilter, productLines);
  fillOptions(els.programFilter, programs);
  fillOptions(els.typeFilter, types);
  fillOptions(els.channelFilter, channels);
  fillOptions(els.paymentTypeFilter, paymentTypes);
}

function renderKpis(summary) {
  els.paidRevenue.textContent = fmtMoney(summary.paid, state.filters.currency);
  els.paidRevenueDetail.textContent = `${fmtNumber(summary.paidCount)} pagos cobrados`;
  els.activeEnrollments.textContent = fmtNumber(summary.activeEnrollments);
  els.activeEnrollmentDetail.textContent = `${fmtNumber(summary.pendingCount)} pendientes incluidos`;
  els.activeUsers.textContent = fmtNumber(summary.activeUsers.size);
  els.userDetail.textContent = `${fmtNumber(summary.repeatUsers)} usuarios recurrentes anonimos`;
  els.activeCourses.textContent = fmtNumber(summary.activeCourses.size);
  els.courseDetail.textContent = `${fmtNumber(finalizeGroups(summary.byProductLine).length)} lineas activas`;
  els.pendingRevenue.textContent = fmtMoney(summary.pending, state.filters.currency);
  els.pendingTransactions.textContent = `${fmtNumber(summary.pendingCount)} pagos pendientes`;
}

function renderDecision(summary) {
  const courses = finalizeGroups(summary.byCourse).sort((a, b) => b.activeEnrollments - a.activeEnrollments);
  const paidCourses = finalizeGroups(summary.byCourse).sort((a, b) => valueScore(b.paid) - valueScore(a.paid));
  const pendingCourses = finalizeGroups(summary.byPendingCourse).sort((a, b) => valueScore(b.pending) - valueScore(a.pending));
  const channels = finalizeGroups(summary.byChannel).sort((a, b) => valueScore(b.paid) - valueScore(a.paid));
  const topCourse = courses[0];
  const topRevenueCourse = paidCourses[0];
  const topPending = pendingCourses[0];
  const topChannel = channels[0];

  els.executiveReadout.textContent = topRevenueCourse
    ? `La vista actual muestra ${fmtMoney(summary.paid, state.filters.currency)} cobrados y ${fmtNumber(summary.activeEnrollments)} inscritos activos. El curso con mayor venta es ${topRevenueCourse.name}; el curso con mas inscritos es ${topCourse?.name || topRevenueCourse.name}.`
    : "No hay registros suficientes para la combinacion de filtros actual.";

  els.nextAction.textContent = topPending
    ? `Cerrar cobranza de ${topPending.name}: ${fmtNumber(topPending.pendingCount)} pendientes por ${fmtMoney(topPending.pending, state.filters.currency)}.`
    : topChannel
      ? `Escalar el medio de pago con mejor traccion: ${topChannel.name}, con ${fmtMoney(topChannel.paid, state.filters.currency)} cobrados.`
      : "Sin accion prioritaria para la vista actual.";

  const riskEntries = riskItems(summary);
  const mainRisk = riskEntries.sort((a, b) => b.weight - a.weight)[0];
  els.riskReadout.textContent = mainRisk
    ? `${mainRisk.title}: ${fmtNumber(mainRisk.value)} casos. ${mainRisk.action}`
    : "Sin riesgos visibles en esta vista.";
}

function renderMonthly(summary) {
  const months = finalizeGroups(summary.byMonth).sort((a, b) => a.month.localeCompare(b.month));
  const maxPaid = Math.max(1, ...months.map((m) => valueScore(m.paid)));
  const maxEnrollments = Math.max(1, ...months.map((m) => m.activeEnrollments));
  els.monthRange.textContent = months.length
    ? `${monthLabel(months[0].month)} - ${monthLabel(months[months.length - 1].month)}`
    : "-";

  els.monthlyChart.innerHTML = months
    .map((m) => {
      const paidHeight = Math.max(8, Math.round((valueScore(m.paid) / maxPaid) * 210));
      const enrollmentHeight = Math.max(6, Math.round((m.activeEnrollments / maxEnrollments) * 210));
      return `
        <div class="month-col" title="${escapeHtml(monthLabel(m.month))}: ${escapeHtml(fmtMoney(m.paid, state.filters.currency))}">
          <div class="month-stack">
            <div class="month-bar paid" style="height:${paidHeight}px"></div>
            <div class="month-bar users" style="height:${enrollmentHeight}px"></div>
          </div>
          <strong>${fmtNumber(m.activeEnrollments)}</strong>
          <small>${escapeHtml(monthLabel(m.month))}</small>
        </div>
      `;
    })
    .join("");
}

function renderBars(target, items, options = {}) {
  const limit = options.limit || 10;
  const metric = options.metric || "paid";
  const rows = items.slice().sort((a, b) => metricValue(b, metric) - metricValue(a, metric)).slice(0, limit);
  const max = Math.max(1, ...rows.map((row) => metricValue(row, metric)));

  target.innerHTML = rows.length
    ? rows
        .map((row) => {
          const value = metricValue(row, metric);
          const width = Math.max(2, Math.round((value / max) * 100));
          return `
            <div class="bar-row">
              <div class="bar-meta">
                <strong>${escapeHtml(row.name)}</strong>
                <span>${escapeHtml(metricLabel(row, metric))}</span>
              </div>
              <div class="bar-track"><div class="bar-fill ${metric}" style="width:${width}%"></div></div>
            </div>
          `;
        })
        .join("")
    : `<div class="empty-state">Sin registros para esta vista.</div>`;
}

function metricValue(row, metric) {
  if (metric === "enrollments") return row.activeEnrollments || 0;
  if (metric === "users") return row.uniqueUsers || 0;
  if (metric === "pending") return valueScore(row.pending);
  if (metric === "count") return row.count || row.paidCount || 0;
  return valueScore(row.paid);
}

function metricLabel(row, metric) {
  if (metric === "enrollments") {
    return `${fmtNumber(row.activeEnrollments)} inscritos / ${fmtNumber(row.uniqueUsers || 0)} usuarios`;
  }
  if (metric === "users") return `${fmtNumber(row.uniqueUsers || 0)} usuarios anonimos`;
  if (metric === "pending") return `${fmtMoney(row.pending, state.filters.currency)} / ${fmtNumber(row.pendingCount)} pendientes`;
  if (metric === "count") return `${fmtNumber(row.count || 0)} registros / ${fmtNumber(row.paidCount || 0)} pagos`;
  return `${fmtMoney(row.paid, state.filters.currency)} / ${fmtNumber(row.paidCount)} pagos`;
}

function renderStatus(summary) {
  const statuses = [...summary.byStatus.entries()].sort((a, b) => b[1] - a[1]);
  els.statusCards.innerHTML = statuses.length
    ? statuses
        .map(
          ([status, count]) => `
            <div class="status-card ${escapeHtml(status)}">
              <span>${escapeHtml(status)}</span>
              <strong>${fmtNumber(count)}</strong>
            </div>
          `,
        )
        .join("")
    : `<div class="empty-state">Sin estados para esta vista.</div>`;
}

function renderUserSegments(summary) {
  const rows = finalizeGroups(summary.byUserSegment).sort((a, b) => b.activeEnrollments - a.activeEnrollments);
  els.userSegmentCards.innerHTML = rows.length
    ? rows
        .map(
          (row) => `
            <div class="metric-row">
              <span>${escapeHtml(row.name)}</span>
              <strong>${fmtNumber(row.uniqueUsers)}</strong>
              <small>${fmtNumber(row.activeEnrollments)} inscripciones</small>
            </div>
          `,
        )
        .join("")
    : `<div class="empty-state">Sin usuarios para esta vista.</div>`;
}

function riskItems(summary) {
  const risks = summary.risks;
  return [
    {
      level: risks.futureDatedRows > 0 ? "high" : "low",
      title: "Registros con fecha futura",
      detail: "Preventas, cohortes futuras o error de digitacion.",
      action: "Separar preventa de venta realizada.",
      value: risks.futureDatedRows,
      weight: risks.futureDatedRows * 6,
    },
    {
      level: risks.missingId > 50 ? "high" : risks.missingId > 0 ? "medium" : "low",
      title: "Registros sin ID de programa",
      detail: "Afecta trazabilidad por cohorte, certificacion y automatizacion.",
      action: "Normalizar ID por curso y edicion.",
      value: risks.missingId,
      weight: risks.missingId * 4,
    },
    {
      level: risks.missingChannel > 20 ? "medium" : risks.missingChannel > 0 ? "low" : "low",
      title: "Medio de pago faltante",
      detail: "Debilita lectura de conversion por canal y conciliacion.",
      action: "Completar canal en registros abiertos.",
      value: risks.missingChannel,
      weight: risks.missingChannel * 3,
    },
    {
      level: risks.paidWithoutVoucher > 0 ? "medium" : "low",
      title: "Pagos sin voucher visible",
      detail: "Riesgo de cierre comercial sin evidencia suficiente.",
      action: "Validar contra banco antes de cerrar.",
      value: risks.paidWithoutVoucher,
      weight: risks.paidWithoutVoucher * 5,
    },
    {
      level: risks.missingContact > 0 ? "medium" : "low",
      title: "Usuarios sin contacto",
      detail: "Impide seguimiento, certificacion y recompra.",
      action: "Completar contacto minimo operativo.",
      value: risks.missingContact,
      weight: risks.missingContact * 5,
    },
  ];
}

function renderRisks(summary) {
  els.riskList.innerHTML = riskItems(summary)
    .map(
      (item) => `
        <div class="risk-item ${item.level}">
          <div class="risk-dot"></div>
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.detail)}</span>
          </div>
          <b>${fmtNumber(item.value)}</b>
        </div>
      `,
    )
    .join("");
}

function renderTable(records) {
  const rows = records
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 120);

  els.visibleRows.textContent = `${fmtNumber(records.length)} registros / mostrando ${fmtNumber(rows.length)}`;
  els.recordsTable.innerHTML = rows.length
    ? rows
        .map(
          (r) => `
            <tr>
              <td>${escapeHtml(monthLabel(r.month))}</td>
              <td>${escapeHtml(r.productLine)}</td>
              <td>${escapeHtml(r.course)}</td>
              <td>${escapeHtml(r.type)}</td>
              <td>${escapeHtml(r.userSegment)}</td>
              <td>${escapeHtml(r.channel)}</td>
              <td><span class="status-badge ${escapeHtml(r.status)}">${escapeHtml(r.status)}</span></td>
              <td>${escapeHtml(r.currency)}</td>
              <td class="num">${escapeHtml(fmtMoney({ [r.currency]: r.amount }, r.currency))}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="9">Sin registros para esta vista.</td></tr>`;
}

function render() {
  const records = getFilteredRecords();
  const summary = summarize(records);
  renderKpis(summary);
  renderDecision(summary);
  renderMonthly(summary);
  renderStatus(summary);
  renderBars(els.typeBars, finalizeGroups(summary.byType), { metric: "enrollments", limit: 8 });
  renderUserSegments(summary);
  renderBars(els.courseBars, finalizeGroups(summary.byCourse), { metric: "enrollments", limit: 12 });
  renderBars(els.productLineBars, finalizeGroups(summary.byProductLine), { metric: "enrollments", limit: 8 });
  renderBars(els.channelBars, finalizeGroups(summary.byChannel), { metric: "paid", limit: 12 });
  renderBars(els.paymentTypeBars, finalizeGroups(summary.byPaymentType), { metric: "count", limit: 10 });
  renderRisks(summary);
  renderBars(els.pendingCourseBars, finalizeGroups(summary.byPendingCourse), { metric: "pending", limit: 10 });
  renderTable(records);
}

function bindEvents() {
  const map = [
    [els.monthFilter, "month"],
    [els.currencyFilter, "currency"],
    [els.productLineFilter, "productLine"],
    [els.programFilter, "program"],
    [els.typeFilter, "type"],
    [els.channelFilter, "channel"],
    [els.paymentTypeFilter, "paymentType"],
    [els.statusFilter, "status"],
  ];

  for (const [element, key] of map) {
    element.addEventListener("change", () => {
      state.filters[key] = element.value;
      render();
    });
  }

  els.resetFilters.addEventListener("click", () => {
    state.filters = {
      month: "ALL",
      currency: "ALL",
      productLine: "ALL",
      program: "ALL",
      type: "ALL",
      channel: "ALL",
      paymentType: "ALL",
      status: "ALL",
    };
    for (const [element, key] of map) element.value = state.filters[key];
    render();
  });

  els.exportView.addEventListener("click", () => {
    const records = getFilteredRecords();
    const summary = summarize(records);
    const payload = {
      filters: state.filters,
      exportedAt: new Date().toISOString(),
      rows: records.length,
      paid: summary.paid,
      pending: summary.pending,
      activeEnrollments: summary.activeEnrollments,
      activeUsers: summary.activeUsers.size,
      activeCourses: summary.activeCourses.size,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "aecode-revenue-os-view.json";
    link.click();
    URL.revokeObjectURL(url);
  });
}

async function boot() {
  const response = await fetch("data/dashboard-data.json");
  state.data = await response.json();
  els.sourceMeta.textContent = `${fmtNumber(state.data.meta.rowCount)} filas anonimizadas / generado ${state.data.meta.generatedAt.slice(0, 10)}`;
  populateFilters();
  bindEvents();
  render();
}

boot().catch((error) => {
  document.body.innerHTML = `<main class="panel"><h1>Error cargando dashboard</h1><p>${escapeHtml(error.message)}</p></main>`;
});
