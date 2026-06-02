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
    risk: "ALL",
  },
};

const els = {
  sourceMeta: document.getElementById("sourceMeta"),
  privacyMeta: document.getElementById("privacyMeta"),
  monthFilter: document.getElementById("monthFilter"),
  currencyFilter: document.getElementById("currencyFilter"),
  productLineFilter: document.getElementById("productLineFilter"),
  programFilter: document.getElementById("programFilter"),
  typeFilter: document.getElementById("typeFilter"),
  channelFilter: document.getElementById("channelFilter"),
  paymentTypeFilter: document.getElementById("paymentTypeFilter"),
  statusFilter: document.getElementById("statusFilter"),
  riskFilter: document.getElementById("riskFilter"),
  resetFilters: document.getElementById("resetFilters"),
  exportView: document.getElementById("exportView"),
  paidRevenue: document.getElementById("paidRevenue"),
  paidRevenueDetail: document.getElementById("paidRevenueDetail"),
  pendingRevenue: document.getElementById("pendingRevenue"),
  pendingTransactions: document.getElementById("pendingTransactions"),
  activeEnrollments: document.getElementById("activeEnrollments"),
  activeEnrollmentDetail: document.getElementById("activeEnrollmentDetail"),
  activeUsers: document.getElementById("activeUsers"),
  userDetail: document.getElementById("userDetail"),
  activeCourses: document.getElementById("activeCourses"),
  courseDetail: document.getElementById("courseDetail"),
  collectionRate: document.getElementById("collectionRate"),
  collectionDetail: document.getElementById("collectionDetail"),
  executiveReadout: document.getElementById("executiveReadout"),
  nextAction: document.getElementById("nextAction"),
  riskReadout: document.getElementById("riskReadout"),
  qualityMeta: document.getElementById("qualityMeta"),
  qualityScore: document.getElementById("qualityScore"),
  qualityBrief: document.getElementById("qualityBrief"),
  qualityIssueList: document.getElementById("qualityIssueList"),
  actionQueue: document.getElementById("actionQueue"),
  monthRange: document.getElementById("monthRange"),
  monthlyChart: document.getElementById("monthlyChart"),
  currencyCards: document.getElementById("currencyCards"),
  avgTicketCards: document.getElementById("avgTicketCards"),
  courseRevenueBars: document.getElementById("courseRevenueBars"),
  pendingCourseBars: document.getElementById("pendingCourseBars"),
  typeBars: document.getElementById("typeBars"),
  userSegmentCards: document.getElementById("userSegmentCards"),
  userHealthCards: document.getElementById("userHealthCards"),
  courseBars: document.getElementById("courseBars"),
  productLineBars: document.getElementById("productLineBars"),
  dataDebtCourses: document.getElementById("dataDebtCourses"),
  statusCards: document.getElementById("statusCards"),
  channelBars: document.getElementById("channelBars"),
  paymentTypeBars: document.getElementById("paymentTypeBars"),
  paymentRiskCards: document.getElementById("paymentRiskCards"),
  riskList: document.getElementById("riskList"),
  highPendingCourses: document.getElementById("highPendingCourses"),
  fixesMeta: document.getElementById("fixesMeta"),
  sheetFixesTable: document.getElementById("sheetFixesTable"),
  visibleRows: document.getElementById("visibleRows"),
  recordsTable: document.getElementById("recordsTable"),
};

const currencyLabels = {
  PEN: "S/",
  USD: "US$",
  SIN_MONEDA: "Sin moneda",
};

const statusLabels = {
  PAGADO: "Pagado",
  PENDIENTE: "Pendiente",
  ANULADO: "Anulado",
  RETIRADO: "Retirado",
  SIN_ESTADO: "Sin estado",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtNumber(value, options = {}) {
  return new Intl.NumberFormat("es-PE", options).format(value || 0);
}

function fmtMoney(bucket, currency = state.filters.currency) {
  const data = bucket || {};
  if (currency === "ALL") {
    const parts = ["USD", "PEN", "SIN_MONEDA"]
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

function getRiskMeta(id) {
  return state.data.riskCatalog.find((item) => item.id === id) || {
    id,
    label: id,
    severity: "low",
    area: "Datos",
    action: "Revisar registros afectados.",
  };
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
      (state.filters.status === "ALL" || record.status === state.filters.status) &&
      (state.filters.risk === "ALL" || (record.riskTags || []).includes(state.filters.risk))
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
    count: 0,
    riskRows: 0,
    ...extra,
  };
}

function addMoney(bucket, currency, amount) {
  bucket[currency] = Number((bucket[currency] || 0) + Number(amount || 0));
}

function groupAdd(map, key, record, extra = {}) {
  const item = map.get(key) || emptyGroup(key, extra);
  item.count += 1;
  if ((record.riskTags || []).length) item.riskRows += 1;
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
    userCourses: new Map(),
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
    byCurrency: new Map(),
    risks: Object.fromEntries(state.data.riskCatalog.map((item) => [item.id, 0])),
  };

  for (const record of records) {
    const amount = Number(record.amount || 0);
    summary.allUsers.add(record.userId);
    summary.userFrequency.set(record.userId, (summary.userFrequency.get(record.userId) || 0) + 1);
    summary.byStatus.set(record.status, (summary.byStatus.get(record.status) || 0) + 1);

    for (const risk of record.riskTags || []) {
      summary.risks[risk] = (summary.risks[risk] || 0) + 1;
    }

    groupAdd(summary.byCurrency, record.currency, record, { currency: record.currency });
    groupAdd(summary.byChannel, record.channel, record, { channel: record.channel });
    groupAdd(summary.byPaymentType, record.paymentType, record, { paymentType: record.paymentType });

    if (isActive(record)) {
      summary.activeEnrollments += 1;
      summary.activeUsers.add(record.userId);
      summary.activeCourses.add(record.course);
      if (!summary.userCourses.has(record.userId)) summary.userCourses.set(record.userId, new Set());
      summary.userCourses.get(record.userId).add(record.course);

      groupAdd(summary.byMonth, record.month, record, { month: record.month });
      groupAdd(summary.byType, record.type, record, { type: record.type });
      groupAdd(summary.byCourse, record.course, record, {
        productLine: record.productLine,
        course: record.course,
      });
      groupAdd(summary.byProductLine, record.productLine, record, { productLine: record.productLine });
      groupAdd(summary.byUserSegment, record.userSegment, record, { userSegment: record.userSegment });
    } else {
      groupAdd(summary.byCourse, record.course, record, {
        productLine: record.productLine,
        course: record.course,
      });
    }

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
  summary.multiCourseUsers = [...summary.userCourses.values()].filter((courses) => courses.size > 1).length;
  summary.avgCoursesPerUser = Number(
    ([...summary.userCourses.values()].reduce((sum, courses) => sum + courses.size, 0) / Math.max(1, summary.activeUsers.size)).toFixed(2),
  );
  summary.collectionRate = Number(((summary.paidCount / Math.max(1, summary.paidCount + summary.pendingCount)) * 100).toFixed(1));
  return summary;
}

function fillOptions(select, values, formatter = (value) => value) {
  for (const value of values) {
    select.add(new Option(formatter(value), value));
  }
}

function populateFilters() {
  const records = state.data.records;
  fillOptions(els.monthFilter, [...new Set(records.map((record) => record.month).filter(Boolean))].sort(), monthLabel);
  fillOptions(els.productLineFilter, [...new Set(records.map((record) => record.productLine))].sort());
  fillOptions(els.programFilter, [...new Set(records.map((record) => record.program))].sort());
  fillOptions(els.typeFilter, [...new Set(records.map((record) => record.type))].sort());
  fillOptions(els.channelFilter, [...new Set(records.map((record) => record.channel))].sort());
  fillOptions(els.paymentTypeFilter, [...new Set(records.map((record) => record.paymentType))].sort());
  fillOptions(
    els.riskFilter,
    state.data.riskCatalog.map((item) => item.id),
    (id) => getRiskMeta(id).label,
  );
}

function renderKpis(summary) {
  els.paidRevenue.textContent = fmtMoney(summary.paid);
  els.paidRevenueDetail.textContent = `${fmtNumber(summary.paidCount)} pagos cobrados`;
  els.pendingRevenue.textContent = fmtMoney(summary.pending);
  els.pendingTransactions.textContent = `${fmtNumber(summary.pendingCount)} pagos pendientes`;
  els.activeEnrollments.textContent = fmtNumber(summary.activeEnrollments);
  els.activeEnrollmentDetail.textContent = `${fmtNumber(summary.pendingCount)} pendientes incluidos`;
  els.activeUsers.textContent = fmtNumber(summary.activeUsers.size);
  els.userDetail.textContent = `${fmtNumber(summary.repeatUsers)} recurrentes / ${fmtNumber(summary.multiCourseUsers)} multi-curso`;
  els.activeCourses.textContent = fmtNumber(summary.activeCourses.size);
  els.courseDetail.textContent = `${fmtNumber(finalizeGroups(summary.byProductLine).length)} lineas activas`;
  els.collectionRate.textContent = `${fmtNumber(summary.collectionRate, { maximumFractionDigits: 1 })}%`;
  els.collectionDetail.textContent = `${fmtNumber(summary.paidCount)} cobrados sobre ${fmtNumber(summary.paidCount + summary.pendingCount)} activos`;
}

function riskItems(summary) {
  return state.data.riskCatalog
    .map((item) => ({
      ...item,
      value: Number(summary.risks[item.id] || 0),
      weight: Number(summary.risks[item.id] || 0) * (item.severity === "high" ? 3 : item.severity === "medium" ? 2 : 1),
    }))
    .sort((a, b) => b.weight - a.weight);
}

function renderDecision(summary) {
  const courses = finalizeGroups(summary.byCourse).filter((item) => item.course !== "Sin programa");
  const paidCourses = courses.slice().sort((a, b) => valueScore(b.paid) - valueScore(a.paid));
  const tractionCourses = courses.slice().sort((a, b) => b.activeEnrollments - a.activeEnrollments);
  const pendingCourses = finalizeGroups(summary.byPendingCourse).sort((a, b) => valueScore(b.pending) - valueScore(a.pending));
  const topRevenueCourse = paidCourses[0];
  const topTractionCourse = tractionCourses[0];
  const topPending = pendingCourses[0];
  const mainRisk = riskItems(summary).find((item) => item.value > 0);

  els.executiveReadout.textContent = topRevenueCourse
    ? `La vista actual concentra ${fmtMoney(summary.paid)} cobrados, ${fmtNumber(summary.activeEnrollments)} inscritos activos y ${fmtNumber(summary.activeCourses.size)} cursos. El mayor ingreso viene de ${topRevenueCourse.name}; la mayor traccion de inscritos viene de ${topTractionCourse?.name || topRevenueCourse.name}.`
    : "No hay registros suficientes para la combinacion de filtros actual.";

  els.nextAction.textContent = topPending
    ? `Cerrar cobranza de ${topPending.name}: ${fmtNumber(topPending.pendingCount)} pendientes por ${fmtMoney(topPending.pending)}.`
    : mainRisk
      ? `${mainRisk.action}`
      : "Sin accion critica visible para la vista actual.";

  els.riskReadout.textContent = mainRisk
    ? `${mainRisk.label}: ${fmtNumber(mainRisk.value)} casos. ${mainRisk.action}`
    : "Sin riesgos visibles en esta vista filtrada.";
}

function renderQuality() {
  const quality = state.data.dataQuality;
  const score = Number(quality.score || 0);
  const topIssues = quality.issues.filter((issue) => issue.count > 0).slice(0, 4);
  els.qualityScore.textContent = score;
  els.qualityScore.parentElement.style.setProperty("--score", `${score}%`);
  els.qualityMeta.textContent = `${fmtNumber(quality.totalRows)} filas / ${fmtNumber(quality.rowsWithIssues)} con incidencias`;
  els.qualityBrief.textContent = `Score global del Sheet: ${score}/100. El principal problema operativo es ${quality.topIssueLabel}; debe corregirse antes de automatizar reporting, certificacion o CRM.`;
  els.qualityIssueList.innerHTML = topIssues
    .map(
      (issue) => `
        <span class="quality-chip ${escapeHtml(issue.severity)}">
          ${escapeHtml(issue.label)}
          <b>${fmtNumber(issue.count)}</b>
        </span>
      `,
    )
    .join("");

  els.actionQueue.innerHTML = quality.actionQueue.length
    ? quality.actionQueue
        .map(
          (item, index) => `
            <div class="action-item ${escapeHtml(item.priority.toLowerCase())}">
              <span>${index + 1}</span>
              <div>
                <strong>${escapeHtml(item.title)}</strong>
                <p>${escapeHtml(item.action)}</p>
                <small>${escapeHtml(item.owner)} / ${escapeHtml(item.area)} / impacto: ${fmtNumber(item.impact)}</small>
              </div>
              <b>${escapeHtml(item.priority)}</b>
            </div>
          `,
        )
        .join("")
    : `<div class="empty-state">No hay acciones priorizadas.</div>`;
}

function renderMonthly(summary) {
  const months = finalizeGroups(summary.byMonth)
    .filter((item) => item.month !== "Sin fecha")
    .sort((a, b) => a.month.localeCompare(b.month));
  const maxPaid = Math.max(1, ...months.map((month) => valueScore(month.paid)));
  const maxEnrollments = Math.max(1, ...months.map((month) => month.activeEnrollments));
  els.monthRange.textContent = months.length
    ? `${monthLabel(months[0].month)} - ${monthLabel(months[months.length - 1].month)}`
    : "-";

  els.monthlyChart.innerHTML = months.length
    ? months
        .map((month) => {
          const paidHeight = Math.max(8, Math.round((valueScore(month.paid) / maxPaid) * 210));
          const enrollmentHeight = Math.max(6, Math.round((month.activeEnrollments / maxEnrollments) * 210));
          return `
            <div class="month-col" title="${escapeHtml(monthLabel(month.month))}: ${escapeHtml(fmtMoney(month.paid))}">
              <div class="month-stack">
                <div class="month-bar paid" style="height:${paidHeight}px"></div>
                <div class="month-bar users" style="height:${enrollmentHeight}px"></div>
              </div>
              <strong>${fmtNumber(month.activeEnrollments)}</strong>
              <small>${escapeHtml(monthLabel(month.month))}</small>
            </div>
          `;
        })
        .join("")
    : `<div class="empty-state">Sin tendencia para esta vista.</div>`;
}

function metricValue(row, metric) {
  if (metric === "enrollments") return row.activeEnrollments || 0;
  if (metric === "users") return row.uniqueUsers || 0;
  if (metric === "pending") return valueScore(row.pending);
  if (metric === "count") return row.count || row.paidCount || 0;
  if (metric === "risk") return row.riskRows || 0;
  return valueScore(row.paid);
}

function metricLabel(row, metric) {
  if (metric === "enrollments") return `${fmtNumber(row.activeEnrollments)} inscritos / ${fmtNumber(row.uniqueUsers || 0)} usuarios`;
  if (metric === "users") return `${fmtNumber(row.uniqueUsers || 0)} usuarios anonimos`;
  if (metric === "pending") return `${fmtMoney(row.pending)} / ${fmtNumber(row.pendingCount)} pendientes`;
  if (metric === "count") return `${fmtNumber(row.count || 0)} registros / ${fmtNumber(row.paidCount || 0)} pagos`;
  if (metric === "risk") return `${fmtNumber(row.riskRows || 0)} filas con riesgo / ${fmtMoney(row.paid)}`;
  return `${fmtMoney(row.paid)} / ${fmtNumber(row.paidCount)} pagos`;
}

function renderBars(target, items, options = {}) {
  const limit = options.limit || 10;
  const metric = options.metric || "paid";
  const rows = items
    .filter((row) => row.name && row.name !== "Sin programa")
    .slice()
    .sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
    .slice(0, limit);
  const max = Math.max(1, ...rows.map((row) => metricValue(row, metric)));

  target.innerHTML = rows.length
    ? rows
        .map((row) => {
          const value = metricValue(row, metric);
          const width = Math.max(3, Math.round((value / max) * 100));
          return `
            <div class="bar-row">
              <div class="bar-meta">
                <strong>${escapeHtml(row.name)}</strong>
                <span>${escapeHtml(metricLabel(row, metric))}</span>
              </div>
              <div class="bar-track"><div class="bar-fill ${escapeHtml(metric)}" style="width:${width}%"></div></div>
            </div>
          `;
        })
        .join("")
    : `<div class="empty-state">Sin registros para esta vista.</div>`;
}

function renderStatus(summary) {
  const statuses = [...summary.byStatus.entries()].sort((a, b) => b[1] - a[1]);
  els.statusCards.innerHTML = statuses.length
    ? statuses
        .map(
          ([status, count]) => `
            <div class="status-card ${escapeHtml(status)}">
              <span>${escapeHtml(statusLabels[status] || status)}</span>
              <strong>${fmtNumber(count)}</strong>
            </div>
          `,
        )
        .join("")
    : `<div class="empty-state">Sin estados para esta vista.</div>`;
}

function renderCurrency(summary) {
  const rows = finalizeGroups(summary.byCurrency).sort((a, b) => valueScore(b.paid) - valueScore(a.paid));
  els.currencyCards.innerHTML = rows.length
    ? rows
        .map(
          (row) => `
            <div class="metric-row">
              <span>${escapeHtml(currencyLabels[row.name] || row.name)}</span>
              <strong>${escapeHtml(fmtMoney(row.paid, row.name))}</strong>
              <small>${fmtNumber(row.paidCount)} cobrados / ${fmtNumber(row.pendingCount)} pendientes</small>
            </div>
          `,
        )
        .join("")
    : `<div class="empty-state">Sin monedas para esta vista.</div>`;

  els.avgTicketCards.innerHTML = ["PEN", "USD"]
    .map((currency) => {
      const row = rows.find((item) => item.name === currency);
      const ticket = row && row.paidCount ? Number((Number(row.paid[currency] || 0) / row.paidCount).toFixed(2)) : 0;
      return `
        <div class="mini-metric">
          <span>Ticket ${escapeHtml(currency)}</span>
          <strong>${currencyLabels[currency]} ${fmtNumber(ticket)}</strong>
        </div>
      `;
    })
    .join("");
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

  els.userHealthCards.innerHTML = `
    <div class="mini-metric">
      <span>Contacto incompleto</span>
      <strong>${fmtNumber(summary.risks.missing_contact || 0)}</strong>
    </div>
    <div class="mini-metric">
      <span>Cursos por usuario</span>
      <strong>${fmtNumber(summary.avgCoursesPerUser, { maximumFractionDigits: 2 })}</strong>
    </div>
  `;
}

function renderPaymentRisks(summary) {
  els.paymentRiskCards.innerHTML = `
    <div class="mini-metric">
      <span>Sin canal</span>
      <strong>${fmtNumber(summary.risks.missing_channel || 0)}</strong>
    </div>
    <div class="mini-metric">
      <span>Pagado sin voucher</span>
      <strong>${fmtNumber(summary.risks.paid_without_voucher || 0)}</strong>
    </div>
  `;
}

function renderDataDebt(summary) {
  const rows = finalizeGroups(summary.byCourse)
    .filter((row) => row.riskRows > 0 && valueScore(row.paid) > 0)
    .sort((a, b) => b.riskRows * Math.max(1, valueScore(b.paid)) - a.riskRows * Math.max(1, valueScore(a.paid)));
  renderBars(els.dataDebtCourses, rows, { metric: "risk", limit: 10 });
}

function renderRisks(summary) {
  const items = riskItems(summary).filter((item) => item.value > 0).slice(0, 9);
  els.riskList.innerHTML = items.length
    ? items
        .map(
          (item) => `
            <div class="risk-item ${escapeHtml(item.severity)}">
              <div class="risk-dot"></div>
              <div>
                <strong>${escapeHtml(item.label)}</strong>
                <span>${escapeHtml(item.action)}</span>
              </div>
              <b>${fmtNumber(item.value)}</b>
            </div>
          `,
        )
        .join("")
    : `<div class="empty-state">Sin riesgos visibles en esta vista.</div>`;
}

function renderSheetFixes() {
  const issues = state.data.dataQuality.issues.filter((issue) => issue.count > 0);
  els.fixesMeta.textContent = `${fmtNumber(issues.length)} tipos / ${fmtNumber(state.data.dataQuality.openIssues)} casos`;
  els.sheetFixesTable.innerHTML = issues.length
    ? issues
        .map(
          (issue) => `
            <tr>
              <td><strong>${escapeHtml(issue.label)}</strong></td>
              <td>${escapeHtml(issue.area)}</td>
              <td><span class="severity-badge ${escapeHtml(issue.severity)}">${escapeHtml(issue.severity)}</span></td>
              <td class="num">${fmtNumber(issue.count)}</td>
              <td>${escapeHtml(issue.sampleRows.length ? issue.sampleRows.join(", ") : "-")}</td>
              <td>${escapeHtml(issue.action)}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="6">No hay problemas detectados.</td></tr>`;
}

function renderTable(records) {
  const rows = records
    .slice()
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, 160);

  els.visibleRows.textContent = `${fmtNumber(records.length)} registros / mostrando ${fmtNumber(rows.length)}`;
  els.recordsTable.innerHTML = rows.length
    ? rows
        .map(
          (record) => `
            <tr>
              <td>${escapeHtml(monthLabel(record.month))}</td>
              <td>${escapeHtml(record.productLine)}</td>
              <td>${escapeHtml(record.course)}</td>
              <td>${escapeHtml(record.type)}</td>
              <td><code>${escapeHtml(record.userId)}</code></td>
              <td>${escapeHtml(record.channel)}</td>
              <td>${escapeHtml(record.paymentType)}</td>
              <td><span class="status-badge ${escapeHtml(record.status)}">${escapeHtml(statusLabels[record.status] || record.status)}</span></td>
              <td>${escapeHtml(record.currency)}</td>
              <td class="num">${escapeHtml(fmtMoney({ [record.currency]: record.amount }, record.currency))}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="10">Sin registros para esta vista.</td></tr>`;
}

function render() {
  const records = getFilteredRecords();
  const summary = summarize(records);
  renderKpis(summary);
  renderDecision(summary);
  renderQuality();
  renderMonthly(summary);
  renderCurrency(summary);
  renderBars(els.courseRevenueBars, finalizeGroups(summary.byCourse), { metric: "paid", limit: 12 });
  renderBars(els.pendingCourseBars, finalizeGroups(summary.byPendingCourse), { metric: "pending", limit: 10 });
  renderBars(els.typeBars, finalizeGroups(summary.byType), { metric: "enrollments", limit: 8 });
  renderUserSegments(summary);
  renderBars(els.courseBars, finalizeGroups(summary.byCourse), { metric: "enrollments", limit: 12 });
  renderBars(els.productLineBars, finalizeGroups(summary.byProductLine), { metric: "enrollments", limit: 8 });
  renderDataDebt(summary);
  renderStatus(summary);
  renderBars(els.channelBars, finalizeGroups(summary.byChannel), { metric: "paid", limit: 12 });
  renderBars(els.paymentTypeBars, finalizeGroups(summary.byPaymentType), { metric: "count", limit: 10 });
  renderPaymentRisks(summary);
  renderRisks(summary);
  renderBars(els.highPendingCourses, finalizeGroups(summary.byPendingCourse), { metric: "pending", limit: 8 });
  renderSheetFixes();
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
    [els.riskFilter, "risk"],
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
      risk: "ALL",
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
      collectionRate: summary.collectionRate,
      activeEnrollments: summary.activeEnrollments,
      activeUsers: summary.activeUsers.size,
      activeCourses: summary.activeCourses.size,
      topRisks: riskItems(summary)
        .filter((item) => item.value > 0)
        .slice(0, 5)
        .map((item) => ({ id: item.id, label: item.label, count: item.value })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "aecode-command-center-view.json";
    link.click();
    URL.revokeObjectURL(url);
  });
}

async function boot() {
  const response = await fetch("data/dashboard-data.json");
  state.data = await response.json();
  els.sourceMeta.textContent = `${fmtNumber(state.data.meta.rowCount)} filas anonimizadas / ${state.data.meta.generatedAt.slice(0, 10)}`;
  els.privacyMeta.textContent = state.data.meta.privacy;
  populateFilters();
  bindEvents();
  render();
}

boot().catch((error) => {
  document.body.innerHTML = `<main class="fallback-error"><h1>Error cargando dashboard</h1><p>${escapeHtml(error.message)}</p></main>`;
});
