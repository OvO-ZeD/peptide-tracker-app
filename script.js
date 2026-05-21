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

function normalizeLogEntry(entry, tab) {
  if (typeof entry === "string") {
    return {
      at: entry,
      peptideName: (tab && tab.peptideName) || (tab && tab.name) || "Peptide",
      doseMg: Number((tab && tab.doseMg) || 0)
    };
  }
  if (entry && typeof entry === "object") {
    return {
      at: entry.at || entry.date || new Date().toISOString(),
      peptideName: entry.peptideName || (tab && tab.peptideName) || (tab && tab.name) || "Peptide",
      doseMg: Number(entry.doseMg || 0)
    };
  }
  return null;
}

function getDateKeyFromIso(isoString) {
  var d = new Date(isoString);
  if (isNaN(d.getTime())) d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function formatDateHeading(dateKey) {
  var d = new Date(dateKey + "T00:00:00");
  if (isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "long", day: "numeric" });
}

function parseTimeToParts(timeStr) {
  var raw = String(timeStr || "08:00").split(":");
  return { h: Number(raw[0] || 8), m: Number(raw[1] || 0) };
}

function requestReminderPermission() {
  if (!("Notification" in window)) {
    window.alert("Notifications are not supported on this device/browser.");
    return;
  }
  Notification.requestPermission().then(function(permission) {
    if (permission === "granted") window.alert("Notifications enabled.");
    else window.alert("Notifications not enabled.");
  });
}

function sendTestReminderNotification() {
  if (!("Notification" in window)) {
    window.alert("Notifications are not supported on this device/browser.");
    return;
  }
  if (Notification.permission !== "granted") {
    window.alert("Please tap Enable Notifications first.");
    return;
  }

  var tab = getCurrentTrackerTab();
  var title = "Peptide reminder test";
  var body = "This is a test reminder from your Home Screen app.";
  if (tab) {
    body = (tab.peptideName || tab.name || "Peptide") + " reminder test is working.";
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready.then(function(reg) {
      if (reg && reg.showNotification) {
        return reg.showNotification(title, {
          body: body,
          badge: "/favicon.ico",
          icon: "/favicon.ico",
          tag: "peptide-test-notification",
          data: { url: "/" }
        });
      }
      throw new Error("No active service worker registration.");
    }).catch(function() {
      try {
        new Notification(title, { body: body });
      } catch (e) {
        window.alert("Unable to show a test notification on this device.");
      }
    });
    return;
  }

  try {
    new Notification(title, { body: body });
  } catch (e) {
    window.alert("Unable to show a test notification on this device.");
  }
}

function scheduleReminderForTab(tab) {
  if (!tab || !tab.reminderEnabled) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  var next = computeNextShotForTab(tab);
  if (!next) return;
  var leadMin = Number(tab.reminderLeadMinutes || 0);
  var notifyAt = next.getTime() - (leadMin * 60000);
  var delay = notifyAt - Date.now();
  if (delay <= 0 || delay > 2147483647) return;
  if (tab._reminderTimer) window.clearTimeout(tab._reminderTimer);
  tab._reminderTimer = window.setTimeout(function() {
    try {
      new Notification("Upcoming peptide shot", {
        body: (tab.peptideName || tab.name || "Peptide") + " due at " + next.toLocaleTimeString()
      });
    } catch (e) {}
  }, delay);
}

function computeNextShotForTab(tab) {
  var everyDays = Number(tab.routineIntervalDays || 0);
  if (everyDays <= 0) return null;
  var t = parseTimeToParts(tab.routineTime || "08:00");
  var anchor = tab.routineAnchorAt ? new Date(tab.routineAnchorAt) : new Date();
  if (isNaN(anchor.getTime())) anchor = new Date();
  anchor.setHours(t.h, t.m, 0, 0);
  var next = new Date(anchor);
  var now = new Date();
  while (next <= now) next = new Date(next.getTime() + everyDays * 86400000);
  return next;
}

function renderNextShotCard() {
  var tab = getCurrentTrackerTab();
  var card = document.getElementById("next_shot_card");
  if (!tab || !card) return;
  var next = computeNextShotForTab(tab);
  if (!next) {
    card.innerHTML = "Set routine days + time to show your next shot.";
    return;
  }
  var diffMs = next.getTime() - Date.now();
  var hrs = Math.max(0, Math.floor(diffMs / 3600000));
  var days = Math.floor(hrs / 24);
  var remH = hrs % 24;
  card.innerHTML = "<strong>Next shot:</strong> " + next.toLocaleString() + "<br><span class=\"muted\">In " + days + "d " + remH + "h</span> <button class=\"inline-mini-btn\" onclick=\"logUpcomingShotNow()\">Log now</button>";
}

function saveRoutineSettings() {
  var tab = getCurrentTrackerTab();
  if (!tab) return;
  tab.routineIntervalDays = Number((document.getElementById("routine_interval_days") || {}).value || 0);
  tab.routineTime = ((document.getElementById("routine_time") || {}).value || "08:00");
  tab.reminderEnabled = !!((document.getElementById("routine_reminder_enabled") || {}).checked);
  tab.reminderLeadMinutes = Number((document.getElementById("routine_reminder_lead") || {}).value || 0);
  if (!tab.routineAnchorAt) tab.routineAnchorAt = new Date().toISOString();
  persistTrackerState();
  renderNextShotCard();
  scheduleReminderForTab(tab);
}

function logUpcomingShotNow() {
  var dt = document.getElementById("log_datetime");
  if (dt) {
    var n = new Date();
    var local = new Date(n.getTime() - (n.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    dt.value = local;
  }
  logAdministrationNow();
  var tab = getCurrentTrackerTab();
  if (tab) tab.routineAnchorAt = new Date().toISOString();
  persistTrackerState();
  renderNextShotCard();
  if (tab) scheduleReminderForTab(tab);
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
  var doseVal = Number((document.getElementById("log_dose_mg") || {}).value || tab.doseMg || 0);
  var peptideVal = ((document.getElementById("log_peptide_name") || {}).value || tab.peptideName || tab.name || "Peptide").trim();
  var dtInput = (document.getElementById("log_datetime") || {}).value;
  var logDate = dtInput ? new Date(dtInput) : new Date();
  if (isNaN(logDate.getTime())) logDate = new Date();
  var week = getWeekKey(logDate);
  if (!tab.logsByWeek[week]) tab.logsByWeek[week] = [];
  tab.logsByWeek[week].push({
    at: logDate.toISOString(),
    peptideName: peptideVal,
    doseMg: doseVal
  });
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

function clearAllLogsForCurrentTab() {
  var tab = getCurrentTrackerTab();
  if (!tab) return;
  var ok = window.confirm("Clear all logs for this peptide tab and restart cycle?");
  if (!ok) return;
  tab.logsByWeek = {};
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

function getHistoricalLogDates(tab) {
  var grouped = {};
  var logsByWeek = tab.logsByWeek || {};
  for (var week in logsByWeek) {
    if (Object.prototype.hasOwnProperty.call(logsByWeek, week) && logsByWeek[week] && logsByWeek[week].length) {
      var normalized = logsByWeek[week].map(function(item) { return normalizeLogEntry(item, tab); }).filter(Boolean);
      for (var i = 0; i < normalized.length; i++) {
        var rec = normalized[i];
        var dateKey = getDateKeyFromIso(rec.at);
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(rec);
      }
    }
  }

  var dateKeys = Object.keys(grouped).sort(function(a, b) { return a < b ? 1 : -1; });
  var dates = [];
  for (var k = 0; k < dateKeys.length; k++) {
    var key = dateKeys[k];
    grouped[key].sort(function(a, b) { return (b.at || "").localeCompare(a.at || ""); });
    dates.push({ dateKey: key, dateLabel: formatDateHeading(key), logs: grouped[key] });
  }
  return dates;
}

function renderLogsView() {
  var tab = getCurrentTrackerTab();
  if (!tab) return;

  var groupsRoot = document.getElementById("logs_groups");
  var totalCountEl = document.getElementById("logs_total_count");
  if (!groupsRoot || !totalCountEl) return;

  var dateGroups = getHistoricalLogDates(tab);
  var total = 0;
  var html = "";
  for (var i = 0; i < dateGroups.length; i++) {
    total += dateGroups[i].logs.length;
    html += "<details class=\"week-group\"" + (i === 0 ? " open" : "") + ">";
    html += "<summary><span class=\"date-heading\">" + escapeHtml(dateGroups[i].dateLabel) + "</span> <span class=\"badge\">" + dateGroups[i].logs.length + "</span></summary>";
    html += "<ul class=\"log-records\">";
    for (var j = 0; j < dateGroups[i].logs.length; j++) {
      var rec = dateGroups[i].logs[j];
      html += "<li class=\"log-record\">";
      html += "<div class=\"log-record-top\"><strong>" + escapeHtml(rec.peptideName || "Peptide") + "</strong> <em>" + Number(rec.doseMg || 0).toFixed(2) + " mg</em></div>";
      html += "<div class=\"log-record-time\">" + new Date(rec.at).toLocaleString() + "</div>";
      html += "</li>";
    }
    html += "</ul></details>";
  }

  totalCountEl.textContent = total + " total logs";
  groupsRoot.innerHTML = html || "<p class=\"muted\">No historical logs yet. Log your first administration from Home.</p>";
  renderLogsChart(dateGroups, tab);
}

function renderLogsChart(dateGroups, tab) {
  var canvas = document.getElementById("logs_chart");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var w = canvas.clientWidth || 800;
  var h = canvas.height || 180;
  canvas.width = w;
  ctx.clearRect(0, 0, w, h);

  var labels = dateGroups.slice(0, 12).reverse();
  var values = [];
  var maxY = 1;
  for (var i = 0; i < labels.length; i++) {
    var v = 0;
    for (var n = 0; n < labels[i].logs.length; n++) v += Number(labels[i].logs[n].doseMg || 0);
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

  ctx.strokeStyle = "#ff5a5a";
  ctx.fillStyle = "rgba(255,90,90,0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (var k = 0; k < values.length; k++) {
    var x = pad + (gx * (values.length === 1 ? 0.5 : k / (values.length - 1)));
    var y = h - pad - (gy * (values[k] / maxY));
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();

  var expected = (Number(tab.frequencyPerWeek) || 0) * (Number(tab.doseMg) || 0);
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
  var logPeptide = document.getElementById("log_peptide_name");
  var logDose = document.getElementById("log_dose_mg");
  if (logPeptide) logPeptide.value = tab.peptideName || tab.name || "";
  if (logDose) logDose.value = tab.doseMg || "";
  var intervalEl = document.getElementById("routine_interval_days");
  var timeEl = document.getElementById("routine_time");
  if (intervalEl) intervalEl.value = tab.routineIntervalDays || "";
  if (timeEl) timeEl.value = tab.routineTime || "08:00";
  var remEnabledEl = document.getElementById("routine_reminder_enabled");
  var remLeadEl = document.getElementById("routine_reminder_lead");
  if (remEnabledEl) remEnabledEl.checked = !!tab.reminderEnabled;
  if (remLeadEl) remLeadEl.value = Number(tab.reminderLeadMinutes || 0);
  renderTrackerWeeklyTotal();
  renderTrackerLogs();
  renderNextShotCard();
  scheduleReminderForTab(tab);
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
