var trackerState = {
  tabs: [],
  currentTabId: null
};

function getWeekKey(dateObj) {
  var d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()));
  var day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getUTCFullYear() + "-W" + String(weekNo).padStart(2, "0");
}

function trackerStorageKey() {
  return "peptide_tracker_state_v1";
}

function persistTrackerState() {
  localStorage.setItem(trackerStorageKey(), JSON.stringify(trackerState));
}

function getCurrentTrackerTab() {
  for (var i = 0; i < trackerState.tabs.length; i++) {
    if (trackerState.tabs[i].id === trackerState.currentTabId) {
      return trackerState.tabs[i];
    }
  }
  return null;
}

function loadTrackerState() {
  var raw = localStorage.getItem(trackerStorageKey());
  if (raw) {
    try {
      var parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tabs)) {
        trackerState = parsed;
      }
    } catch (e) {
      trackerState = { tabs: [], currentTabId: null };
    }
  }
  if (!trackerState.tabs.length) {
    var seedId = "tab_" + Date.now();
    trackerState.tabs = [{ id: seedId, name: "Peptide 1", peptideName: "", doseMg: 0, frequencyPerWeek: 1, logsByWeek: {} }];
    trackerState.currentTabId = seedId;
    persistTrackerState();
  }
  if (!trackerState.currentTabId || !getCurrentTrackerTab()) {
    trackerState.currentTabId = trackerState.tabs[0].id;
  }
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
  if (!root) {
    return;
  }
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
  if (!tab) {
    return;
  }
  var input = document.getElementById("rename_peptide_name");
  var name = (input.value || "").trim();
  if (!name) {
    return;
  }
  tab.name = name;
  input.value = "";
  persistTrackerState();
  renderTrackerTabs();
}

function saveTrackerDetails() {
  var tab = getCurrentTrackerTab();
  if (!tab) {
    return;
  }
  tab.peptideName = (document.getElementById("tracker_peptide_name").value || "").trim();
  tab.doseMg = Number(document.getElementById("tracker_dose_mg").value || 0);
  tab.frequencyPerWeek = Number(document.getElementById("tracker_frequency").value || 1);
  persistTrackerState();
  renderTrackerWeeklyTotal();
}

function renderTrackerWeeklyTotal() {
  var tab = getCurrentTrackerTab();
  if (!tab) {
    return;
  }
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
}

function logAdministrationNow() {
  var tab = getCurrentTrackerTab();
  if (!tab) {
    return;
  }
  var now = new Date();
  var week = getWeekKey(now);
  if (!tab.logsByWeek[week]) {
    tab.logsByWeek[week] = [];
  }
  tab.logsByWeek[week].push(now.toISOString());
  persistTrackerState();
  renderTrackerLogs();
}

function clearWeeklyLogs() {
  var tab = getCurrentTrackerTab();
  if (!tab) {
    return;
  }
  var week = getWeekKey(new Date());
  tab.logsByWeek[week] = [];
  persistTrackerState();
  renderTrackerLogs();
}

function renderTrackerLogs() {
  var tab = getCurrentTrackerTab();
  if (!tab) {
    return;
  }
  var week = getWeekKey(new Date());
  var logs = tab.logsByWeek[week] || [];
  document.getElementById("tracker_log_count").innerText = "This week administrations: " + logs.length;
  var html = "";
  for (var i = 0; i < logs.length; i++) {
    html += "<li>" + new Date(logs[i]).toLocaleString() + "</li>";
  }
  document.getElementById("tracker_logs").innerHTML = html || "<li>No doses logged this week.</li>";
}

function renderTrackerForm() {
  var tab = getCurrentTrackerTab();
  if (!tab) {
    return;
  }
  document.getElementById("tracker_peptide_name").value = tab.peptideName || "";
  document.getElementById("tracker_dose_mg").value = tab.doseMg || "";
  document.getElementById("tracker_frequency").value = tab.frequencyPerWeek || 1;
  renderTrackerWeeklyTotal();
  renderTrackerLogs();
}

function renderTracker() {
  renderTrackerTabs();
  renderTrackerForm();
}

function toggleTheme() {
  document.body.classList.toggle("theme-dark");
}

function attachBackgroundParallax() {
  var particles = document.getElementById("bg_particles");
  if (!particles) {
    return;
  }
  window.addEventListener("mousemove", function(e) {
    var x = (e.clientX / window.innerWidth - 0.5) * 8;
    var y = (e.clientY / window.innerHeight - 0.5) * 8;
    particles.style.transform = "translate(" + x.toFixed(2) + "px," + y.toFixed(2) + "px)";
  });
}

attachBackgroundParallax();
loadTrackerState();
renderTracker();
