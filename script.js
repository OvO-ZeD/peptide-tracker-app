var trackerState = {
  tabs: [],
  currentTabId: null
};

var STORAGE_KEY_V2 = "peptide_tracker_state_v2";
var STORAGE_KEY_V1 = "peptide_tracker_state_v1";
var currentView = "home";

function getWeekKey(dateObj) {
  var d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
  var day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + "-W" + String(weekNo).padStart(2, "0");
}

function trackerStorageKey() { return STORAGE_KEY_V2; }
function persistTrackerState() { localStorage.setItem(trackerStorageKey(), JSON.stringify(trackerState)); }

function getCurrentTrackerTab() {
  for (var i = 0; i < trackerState.tabs.length; i++) {
    if (trackerState.tabs[i].id === trackerState.currentTabId) return trackerState.tabs[i];
  }
  return null;
}

function loadTrackerState() {
  var raw = localStorage.getItem(STORAGE_KEY_V2) || localStorage.getItem(STORAGE_KEY_V1);
  if (raw) {
    try {
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tabs)) trackerState = parsed;
    } catch (e) {
      trackerState = { tabs: [], currentTabId: null };
    }
  }
  if (!trackerState.tabs.length) {
    var seedId = "tab_" + Date.now();
    trackerState.tabs = [{ id: seedId, name: "Peptide 1", peptideName: "", doseMg: 0, frequencyPerWeek: 1, logsByWeek: {} }];
    trackerState.currentTabId = seedId;
  }
  if (!trackerState.currentTabId || !getCurrentTrackerTab()) trackerState.currentTabId = trackerState.tabs[0].id;
  persistTrackerState();
}

function pulseElement(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("pulse");
  window.requestAnimationFrame(function() { el.classList.add("pulse"); });
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderTrackerTabs() {
  var root = document.getElementById("tracker_tabs");
  if (!root) return;
  var html = "";
  for (var i = 0; i < trackerState.tabs.length; i++) {
    var tab = trackerState.tabs[i];
    var cls = tab.id === trackerState.currentTabId ? "tracker-tab active" : "tracker-tab";
    html += "<button class=\"" + cls + "\" onclick=\"selectTrackerTab('" + escapeHtml(tab.id) + "')\">" + escapeHtml(tab.name) + "</button>";
  }
  root.innerHTML = html;
}

function selectTrackerTab(tabId) {
  trackerState.currentTabId = tabId;
  persistTrackerState();
  renderTracker();
}

function addPeptideTab() {
  var input = document.getElementById("new_peptide_name");
  var name = (input.value || "").trim() || "Peptide " + (trackerState.tabs.length + 1);
  var id = "tab_" + Date.now();
  trackerState.tabs.push({ id: id, name: name, peptideName: "", doseMg: 0, frequencyPerWeek: 1, logsByWeek: {} });
  trackerState.currentTabId = id;
  input.value = "";
  persistTrackerState();
  renderTracker();
}

function renameCurrentPeptideTab() {
  var tab = getCurrentTrackerTab();
  if (!tab) return;
  var input = document.getElementById("rename_peptide_name");
  var name = (input.value || "").trim();
  if (!name) return;
  tab.name = name;
  input.value = "";
  persistTrackerState();
  renderTrackerTabs();
}

function saveTrackerDetails() {
  var tab = getCurrentTrackerTab();
  if (!tab) return;
  tab.peptideName = (document.getElementById("tracker_peptide_name").value || "").trim();
  tab.doseMg = Number(document.getElementById("tracker_dose_mg").value || 0);
  tab.frequencyPerWeek = Number(document.getElementById("tracker_frequency").value || 1);
  persistTrackerState();
  renderTrackerWeeklyTotal();
  if (currentView === "logs") renderLogsView();
  pulseElement("tracker_weekly_total");
}

function renderTrackerWeeklyTotal() {
  var tab = getCurrentTrackerTab();
  if (!tab) return;
  var total = (Number(tab.doseMg) || 0) * (Number(tab.frequencyPerWeek) || 0);
  document.getElementById("tracker_weekly_total").innerText = "Weekly total: " + total.toFixed(2) + " mg";
}

function calculateUnits() {
  var dose = Number(document.getElementById("calc_dose_mg").value || 0);
  var vial = Number(document.getElementById("calc_vial_mg").value || 0);
  var bac = Number(document.getElementById("calc_bac_ml").value || 0);
  if (dose <= 0 || vial <= 0 || bac <= 0) {
    document.getElementById("calc_result").innerText = "Enter valid dose, vial mg, and bac water ml.";
    return;
  }
  var concentrationMgPerMl = vial / bac;
  var doseMl = dose / concentrationMgPerMl;
  var units = doseMl * 100;
  document.getElementById("calc_result").innerText = "Inject " + units.toFixed(1) + " units (" + doseMl.toFixed(2) + " ml).";
  pulseElement("calc_result");
}

function logAdministrationNow() {
  var tab = getCurrentTrackerTab();
  if (!tab) return;
  var now = new Date();
  var week = getWeekKey(now);
  if (!tab.logsByWeek[week]) tab.logsByWeek[week] = [];
  tab.logsByWeek[week].push(now.toISOString());
  persistTrackerState();
  renderTrackerLogs();
  if (currentView === "logs") renderLogsView();
  pulseElement("tracker_log_count");
}

function clearWeeklyLogs() {
  var tab = getCurrentTrackerTab();
  if (!tab) return;
  var week = getWeekKey(new Date());
  tab.logsByWeek[week] = [];
  persistTrackerState();
  renderTrackerLogs();
  if (currentView === "logs") renderLogsView();
}

function renderTrackerLogs() {
  var tab = getCurrentTrackerTab();
  if (!tab) return;
  var week = getWeekKey(new Date());
  var logs = tab.logsByWeek[week] || [];
  var countEl = document.getElementById("tracker_log_count");
  if (countEl) countEl.innerText = "This week administrations: " + logs.length;
}

function getHistoricalLogWeeks(tab) {
  var weeks = [];
  var logsByWeek = tab.logsByWeek || {};
  for (var week in logsByWeek) {
    if (Object.prototype.hasOwnProperty.call(logsByWeek, week) && logsByWeek[week] && logsByWeek[week].length) {
      weeks.push({ week: week, logs: logsByWeek[week].slice().sort(function(a, b) { return b.localeCompare(a); }) });
    }
  }
  weeks.sort(function(a, b) { return a.week < b.week ? 1 : -1; });
  return weeks;
}

function renderLogsView() {
  var tab = getCurrentTrackerTab();
  if (!tab) return;

  var groupsRoot = document.getElementById("logs_groups");
  var totalCountEl = document.getElementById("logs_total_count");
  if (!groupsRoot || !totalCountEl) return;

  var weeks = getHistoricalLogWeeks(tab);
  var total = 0;
  var html = "";
  for (var i = 0; i < weeks.length; i++) {
    total += weeks[i].logs.length;
    html += "<details class=\"week-group\"" + (i === 0 ? " open" : "") + ">";
    html += "<summary>" + escapeHtml(weeks[i].week) + " <span class=\"badge\">" + weeks[i].logs.length + "</span></summary>";
    html += "<ul>";
    for (var j = 0; j < weeks[i].logs.length; j++) html += "<li>" + new Date(weeks[i].logs[j]).toLocaleString() + "</li>";
    html += "</ul></details>";
  }

  totalCountEl.textContent = total + " total logs";
  groupsRoot.innerHTML = html || "<p class=\"muted\">No historical logs yet. Log your first administration from Home.</p>";
  renderLogsChart(weeks, tab);
}

function renderLogsChart(weeks, tab) {
  var canvas = document.getElementById("logs_chart");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var w = canvas.clientWidth || 800;
  var h = canvas.height || 180;
  canvas.width = w;
  ctx.clearRect(0, 0, w, h);

  var labels = weeks.slice(0, 12).reverse();
  var values = [];
  var maxY = 1;
  for (var i = 0; i < labels.length; i++) {
    var v = labels[i].logs.length;
    values.push(v);
    if (v > maxY) maxY = v;
  }

  var pad = 24;
  var gx = w - pad * 2;
  var gy = h - pad * 2;

  ctx.strokeStyle = "rgba(166,175,203,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, h - pad);
  ctx.lineTo(w - pad, h - pad);
  ctx.stroke();

  if (!values.length) return;

  ctx.strokeStyle = "#54d6c8";
  ctx.fillStyle = "rgba(84,214,200,0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (var k = 0; k < values.length; k++) {
    var x = pad + (gx * (values.length === 1 ? 0.5 : k / (values.length - 1)));
    var y = h - pad - (gy * (values[k] / maxY));
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  var expected = Number(tab.frequencyPerWeek) || 0;
  if (expected > 0) {
    ctx.strokeStyle = "rgba(139,125,255,0.8)";
    ctx.setLineDash([6, 5]);
    var ey = h - pad - (gy * (Math.min(expected, maxY) / maxY));
    ctx.beginPath();
    ctx.moveTo(pad, ey);
    ctx.lineTo(w - pad, ey);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function renderTrackerForm() {
  var tab = getCurrentTrackerTab();
  if (!tab) return;
  document.getElementById("tracker_peptide_name").value = tab.peptideName || "";
  document.getElementById("tracker_dose_mg").value = tab.doseMg || "";
  document.getElementById("tracker_frequency").value = tab.frequencyPerWeek || 1;
  renderTrackerWeeklyTotal();
  renderTrackerLogs();
}

function renderTracker() {
  renderTrackerTabs();
  renderTrackerForm();
  if (currentView === "logs") renderLogsView();
}

function switchView(view) {
  currentView = view === "logs" ? "logs" : "home";
  var home = document.getElementById("view_home");
  var logs = document.getElementById("view_logs");
  var navHome = document.getElementById("nav_home");
  var navLogs = document.getElementById("nav_logs");
  var label = document.getElementById("view_label");

  if (home) home.classList.toggle("active", currentView === "home");
  if (logs) logs.classList.toggle("active", currentView === "logs");
  if (navHome) navHome.classList.toggle("active", currentView === "home");
  if (navLogs) navLogs.classList.toggle("active", currentView === "logs");
  if (label) label.textContent = currentView === "logs" ? "Logs" : "Home";

  if (currentView === "logs") renderLogsView();
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
}

function toggleTheme() { document.body.classList.toggle("theme-dark"); }

function attachBackgroundParallax() {
  var particles = document.getElementById("bg_particles");
  if (!particles) return;
  window.addEventListener("mousemove", function(e) {
    var x = (e.clientX / window.innerWidth - 0.5) * 8;
    var y = (e.clientY / window.innerHeight - 0.5) * 8;
    particles.style.transform = "translate(" + x.toFixed(2) + "px," + y.toFixed(2) + "px)";
  });
}

attachBackgroundParallax();
loadTrackerState();
renderTracker();
switchView("home");
registerServiceWorker();
