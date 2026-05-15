var vialModel = document.getElementById("vial_model");
var vialLabel = document.getElementById("vial_label");
var isDragging = false;
var startX = 0;
var startY = 0;
var rotY = -18;
var rotX = 10;
var currentTrials = [];
var lastData = null;
var searching = false;
var orderCatalog = [];
var currentMode = "research";
var stackData = null;
var selectedStackIndex = -1;
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

function getCurrentTrackerTab() {
  for (var i = 0; i < trackerState.tabs.length; i++) {
    if (trackerState.tabs[i].id === trackerState.currentTabId) {
      return trackerState.tabs[i];
    }
  }
  return null;
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

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function humanizeStatus(status) {
  var map = {
    COMPLETED: "Completed",
    RECRUITING: "Recruiting",
    ACTIVE_NOT_RECRUITING: "Active, not recruiting",
    NOT_YET_RECRUITING: "Not yet recruiting",
    TERMINATED: "Terminated",
    WITHDRAWN: "Withdrawn",
    SUSPENDED: "Suspended"
  };
  return map[status] || (status || "Not specified");
}

function humanizeMethods(methods) {
  if (!methods) {
    return "No method details available.";
  }
  return methods
    .replace(/PHASE(\d+)/g, "Phase $1")
    .replace(/BASIC_SCIENCE/g, "Basic science")
    .replace(/ACTIVE_NOT_RECRUITING/g, "Active, not recruiting")
    .replace(/RANDOMIZED/g, "Randomized")
    .replace(/Not specified/g, "Not specified");
}

function compactSummary(text, maxLen) {
  var clean = (text || "").trim();
  if (clean.length <= maxLen) {
    return { short: clean, full: "", truncated: false };
  }
  var shortText = clean.slice(0, maxLen);
  var cut = shortText.lastIndexOf(" ");
  if (cut > 80) {
    shortText = shortText.slice(0, cut);
  }
  return { short: shortText + "...", full: clean, truncated: true };
}

function cleanRiskLine(text) {
  var value = (text || "").trim();
  if (!value) {
    return "";
  }
  if (value.toLowerCase().indexOf("for external use only") >= 0) {
    return "Some label safety notes may not be peptide-specific and should be interpreted carefully.";
  }
  return value;
}

function applyVialTransform() {
  vialModel.style.transform = "rotateX(" + rotX + "deg) rotateY(" + rotY + "deg)";
}

function beginDrag(event) {
  isDragging = true;
  startX = event.clientX;
  startY = event.clientY;
}

function dragMove(event) {
  if (!isDragging) {
    return;
  }
  var dx = event.clientX - startX;
  var dy = event.clientY - startY;
  rotY += dx * 0.4;
  rotX -= dy * 0.25;
  if (rotX > 35) {
    rotX = 35;
  }
  if (rotX < -35) {
    rotX = -35;
  }
  startX = event.clientX;
  startY = event.clientY;
  applyVialTransform();
}

function endDrag() {
  isDragging = false;
}

function touchToMouse(touchEvent) {
  var touch = touchEvent.touches[0] || touchEvent.changedTouches[0];
  return { clientX: touch.clientX, clientY: touch.clientY };
}

function attachVialControls() {
  var vialScene = document.getElementById("vial_scene");
  vialScene.addEventListener("mousedown", beginDrag);
  window.addEventListener("mousemove", dragMove);
  window.addEventListener("mouseup", endDrag);
  vialScene.addEventListener("touchstart", function(e) {
    var pt = touchToMouse(e);
    beginDrag(pt);
  });
  window.addEventListener("touchmove", function(e) {
    if (!isDragging) {
      return;
    }
    var pt = touchToMouse(e);
    dragMove(pt);
  });
  window.addEventListener("touchend", endDrag);
  vialScene.addEventListener("mouseleave", endDrag);
  applyVialTransform();
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

function listToItems(items) {
  if (!items || items.length === 0) {
    return "<li>No entries available.</li>";
  }
  var out = "";
  for (var i = 0; i < items.length; i++) {
    var cleaned = cleanRiskLine(items[i]);
    if (cleaned) {
      out += "<li>" + escapeHtml(cleaned) + "</li>";
    }
  }
  if (!out) {
    return "<li>No entries available.</li>";
  }
  return out;
}

function confidenceForSource(label) {
  var lower = label.toLowerCase();
  if (lower.indexOf("clinicaltrials") >= 0 || lower.indexOf("pubmed") >= 0 || lower.indexOf("fda") >= 0) {
    return "high";
  }
  if (lower.indexOf("nih") >= 0) {
    return "medium";
  }
  return "context";
}

function renderTrials(trials) {
  var filter = document.getElementById("trial_filter").value;
  var scoped = [];
  for (var i = 0; i < trials.length; i++) {
    if (filter === "ALL" || trials[i].status === filter) {
      scoped.push(trials[i]);
    }
  }
  var trialsHtml = "<h3>Clinical Trials</h3>";
  if (scoped.length > 0) {
    for (var j = 0; j < scoped.length; j++) {
      var trial = scoped[j];
      var compact = compactSummary(trial.lay_summary, 320);
      var statusText = humanizeStatus(trial.status);
      var methodsText = humanizeMethods(trial.methods);
      trialsHtml += "<div class=\"trial-card\">" +
        "<p><strong>" + escapeHtml(trial.title) + "</strong></p>" +
        "<p><strong>Trial ID:</strong> " + escapeHtml(trial.nct_id) + "</p>" +
        "<p><strong>Status:</strong> " + escapeHtml(statusText) + "</p>" +
        "<p><strong>Summary:</strong> " + escapeHtml(compact.short) + "</p>" +
        (compact.truncated ? "<details><summary>Show full summary</summary><p>" + escapeHtml(compact.full) + "</p></details>" : "") +
        "<p><strong>Methods:</strong> " + escapeHtml(methodsText) + "</p>" +
        "</div>";
    }
  } else {
    trialsHtml += "<p>No clinical trials match the selected status filter.</p>";
  }
  document.getElementById("trials_section").innerHTML = trialsHtml;
}

function applyTrialFilter() {
  renderTrials(currentTrials || []);
}

function renderCompare(compareData) {
  var compareSection = document.getElementById("compare_section");
  if (!compareData) {
    compareSection.innerHTML = "";
    return;
  }
  var html = "<h3>Compare Peptide</h3>" +
    "<div class=\"trial-card\">" +
    "<p><strong>" + compareData.peptide_name + "</strong></p>" +
    "<p><strong>Medical definition:</strong> " + compareData.medical_definition + "</p>" +
    "<p><strong>Top method profile:</strong> " + compareData.methods + "</p>" +
    "<p><strong>Trials:</strong> " + (compareData.clinical_trials ? compareData.clinical_trials.length : 0) + " | <strong>PubMed:</strong> " + (compareData.pubmed_articles ? compareData.pubmed_articles.length : 0) + "</p>" +
    "</div>";
  compareSection.innerHTML = html;
}

function renderEvidenceClaims(claims) {
  var evidenceSection = document.getElementById("evidence_section");
  if (!claims || claims.length === 0) {
    evidenceSection.innerHTML = "";
    return;
  }
  var html = "<h3>Evidence Claims</h3>";
  for (var i = 0; i < claims.length; i++) {
    var claim = claims[i];
    var badgeClass = claim.confidence === "HIGH" ? "badge-high" : (claim.confidence === "MEDIUM" ? "badge-medium" : "badge-context");
    html += "<div class=\"paper-card\">" +
      "<p><span class=\"confidence-badge " + badgeClass + "\">" + claim.confidence + "</span> " + claim.claim + "</p>" +
      "<p><a href=\"" + claim.source_url + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + claim.source_label + " source</a></p>" +
      "</div>";
  }
  evidenceSection.innerHTML = html;
}

function renderEvidenceScore(data) {
  var evidenceSection = document.getElementById("evidence_section");
  if (!evidenceSection) {
    return;
  }
  var score = (data && data.evidence_score) || null;
  if (!score) {
    return;
  }
  var tierClass = score.tier === "HIGH" ? "badge-high" : (score.tier === "MEDIUM" ? "badge-medium" : "badge-context");
  var breakdown = score.breakdown || {};
  var html = "<h3>Evidence Strength</h3>" +
    "<div class=\"paper-card\">" +
    "<p><span class=\"confidence-badge " + tierClass + "\">" + escapeHtml(score.tier) + "</span> Evidence score: <strong>" + escapeHtml(String(score.score || 0)) + "/100</strong></p>" +
    "<p>Trials: " + escapeHtml(String(breakdown.trials || 0)) + " • PubMed: " + escapeHtml(String(breakdown.pubmed || 0)) + " • FDA: " + escapeHtml(String(breakdown.fda || 0)) + " • Encyclopedia: " + escapeHtml(String(breakdown.encyclopedia || 0)) + "</p>" +
    "</div>";
  evidenceSection.innerHTML = html + evidenceSection.innerHTML;
}

function renderTimeline(timeline) {
  var timelineSection = document.getElementById("timeline_section");
  if (!timeline) {
    timelineSection.innerHTML = "";
    return;
  }
  var statuses = ["COMPLETED", "RECRUITING", "ACTIVE_NOT_RECRUITING", "OTHER"];
  var max = 1;
  for (var i = 0; i < statuses.length; i++) {
    var v = timeline[statuses[i]] || 0;
    if (v > max) {
      max = v;
    }
  }
  var html = "<h3>Trial Status Timeline</h3><div class=\"timeline-bars\">";
  for (var j = 0; j < statuses.length; j++) {
    var s = statuses[j];
    var count = timeline[s] || 0;
    var width = Math.round((count / max) * 100);
    html += "<div class=\"timeline-row\"><span>" + s + "</span><div class=\"timeline-track\"><div class=\"timeline-fill\" style=\"width:" + width + "%\"></div></div><strong>" + count + "</strong></div>";
  }
  html += "</div>";
  timelineSection.innerHTML = html;
}

function renderFreshness(lastUpdated) {
  var freshness = document.getElementById("freshness_info");
  if (!lastUpdated) {
    freshness.innerText = "";
    return;
  }
  freshness.innerText = "Last synced (UTC): " + lastUpdated;
}

function renderQuickSummary(data) {
  var section = document.getElementById("quick_summary");
  if (!section) {
    return;
  }
  var trialCount = data.clinical_trials ? data.clinical_trials.length : 0;
  var pubmedCount = data.pubmed_articles ? data.pubmed_articles.length : 0;
  var reliability = data.reliability || "LOW";
  var quick = "<div class=\"quick-pill\"><span>Peptide</span><strong>" + escapeHtml(data.peptide_name || "N/A") + "</strong></div>" +
    "<div class=\"quick-pill\"><span>Trials</span><strong>" + trialCount + "</strong></div>" +
    "<div class=\"quick-pill\"><span>PubMed</span><strong>" + pubmedCount + "</strong></div>" +
    "<div class=\"quick-pill\"><span>Reliability</span><strong>" + escapeHtml(reliability) + "</strong></div>";
  section.innerHTML = quick;
}

function renderClinicalSnapshot(data) {
  var section = document.getElementById("clinical_snapshot");
  if (!section) {
    return;
  }
  var shot = data.clinical_snapshot || {};
  var what = shot.primary_effect || "Clinical effect summary is limited from available sources.";
  var how = shot.mechanism_pathway || "Mechanism summary is limited from available sources.";
  var outcomes = shot.expected_body_outcomes || "Expected body outcomes are limited from available sources.";
  var context = shot.clinical_context || "Clinical context is limited from available sources.";
  var evidence = shot.evidence_strength || "LIMITED";
  section.innerHTML =
    "<h3>Clinical Snapshot</h3>" +
    "<div class=\"snapshot-grid\">" +
    "<div class=\"snapshot-card\"><span>What it does</span><p>" + escapeHtml(what) + "</p></div>" +
    "<div class=\"snapshot-card\"><span>How it works</span><p>" + escapeHtml(how) + "</p></div>" +
    "<div class=\"snapshot-card\"><span>Expected body outcomes</span><p>" + escapeHtml(outcomes) + "</p></div>" +
    "<div class=\"snapshot-card\"><span>Clinical context</span><p>" + escapeHtml(context) + "</p></div>" +
    "<div class=\"snapshot-card\"><span>Evidence strength</span><p>" + escapeHtml(evidence) + "</p></div>" +
    "</div>";
}

function setTab(tabName) {
  var tabs = ["overview", "trials", "sources"];
  for (var i = 0; i < tabs.length; i++) {
    var name = tabs[i];
    var btn = document.getElementById("tab_" + name);
    var content = document.getElementById("tab_content_" + name);
    if (name === tabName) {
      btn.classList.add("active");
      content.classList.add("active");
    } else {
      btn.classList.remove("active");
      content.classList.remove("active");
    }
  }
}

function setSearchLoading(isLoading) {
  var btn = document.getElementById("search_btn");
  if (!btn) {
    return;
  }
  searching = isLoading;
  btn.disabled = isLoading;
  btn.innerText = isLoading ? "Searching..." : "Search";
}

function renderReliability(data) {
  var aliasInfo = document.getElementById("alias_info");
  var reliability = data.reliability || "LOW";
  var partial = data.partial_data ? "Partial source response" : "All core sources responded";
  aliasInfo.innerText = "Search: " + data.search_input + "  •  Normalized: " + data.normalized_term + "  •  Reliability: " + reliability + "  •  " + partial;
}

function toggleTheme() {
  document.body.classList.toggle("theme-dark");
}

function setMode(mode) {
  currentMode = mode;
  var researchBtn = document.getElementById("mode_research");
  var orderBtn = document.getElementById("mode_order");
  var stackBtn = document.getElementById("mode_stack");
  var researchMode = document.getElementById("research_mode");
  var orderMode = document.getElementById("order_mode");
  var stackMode = document.getElementById("stack_mode");
  var trackerBtn = document.getElementById("mode_tracker");
  var trackerMode = document.getElementById("tracker_mode");
  if (mode === "order") {
    orderBtn.classList.add("active");
    researchBtn.classList.remove("active");
    stackBtn.classList.remove("active");
    trackerBtn.classList.remove("active");
    orderMode.classList.remove("mode-hidden");
    researchMode.classList.add("mode-hidden");
    stackMode.classList.add("mode-hidden");
    trackerMode.classList.add("mode-hidden");
  } else if (mode === "stack") {
    stackBtn.classList.add("active");
    researchBtn.classList.remove("active");
    orderBtn.classList.remove("active");
    trackerBtn.classList.remove("active");
    stackMode.classList.remove("mode-hidden");
    researchMode.classList.add("mode-hidden");
    orderMode.classList.add("mode-hidden");
    trackerMode.classList.add("mode-hidden");
  } else if (mode === "tracker") {
    trackerBtn.classList.add("active");
    researchBtn.classList.remove("active");
    orderBtn.classList.remove("active");
    stackBtn.classList.remove("active");
    trackerMode.classList.remove("mode-hidden");
    researchMode.classList.add("mode-hidden");
    orderMode.classList.add("mode-hidden");
    stackMode.classList.add("mode-hidden");
  } else {
    researchBtn.classList.add("active");
    orderBtn.classList.remove("active");
    stackBtn.classList.remove("active");
    trackerBtn.classList.remove("active");
    researchMode.classList.remove("mode-hidden");
    orderMode.classList.add("mode-hidden");
    stackMode.classList.add("mode-hidden");
    trackerMode.classList.add("mode-hidden");
  }
}

function renderStackResults(data) {
  stackData = data;
  var root = document.getElementById("stack_results");
  if (!data || !data.recommendations || !data.recommendations.length) {
    root.innerHTML = "<p>No stack recommendations found for this goal/priority.</p>";
    return;
  }
  var html = "";
  for (var i = 0; i < data.recommendations.length; i++) {
    var row = data.recommendations[i];
    var badgeClass = row.evidence_tier === "HIGH" ? "badge-high" : (row.evidence_tier === "MEDIUM" ? "badge-medium" : "badge-context");
    var stackLabel = (row.stack || []).map(function(x) { return x.toUpperCase(); }).join(" + ");
    var rationale = row.rationale && row.rationale.length ? row.rationale.map(function(r) { return "<li>" + escapeHtml(r) + "</li>"; }).join("") : "<li>Limited direct overlap signals.</li>";
    var tierTags = (row.tier_tags || []).map(function(t) {
      return "<span class=\"tier-chip\">" + escapeHtml(t.peptide) + " (" + escapeHtml(t.tier) + ")</span>";
    }).join(" ");
    var evidenceRows = (row.peptide_evidence || []).map(function(ev) {
      return "<div class=\"stack-evidence-row\">" +
        "<p><strong>" + escapeHtml(ev.peptide || "") + "</strong> <span class=\"tier-mini\">Tier " + escapeHtml(ev.tier || "D") + "</span></p>" +
        "<p>" + escapeHtml(ev.summary || "") + "</p>" +
        "<p><a href=\"" + escapeHtml(ev.clinicaltrials_url || "https://clinicaltrials.gov/") + "\" target=\"_blank\" rel=\"noopener noreferrer\">ClinicalTrials results</a> • <a href=\"" + escapeHtml(ev.pubmed_url || "https://pubmed.ncbi.nlm.nih.gov/") + "\" target=\"_blank\" rel=\"noopener noreferrer\">PubMed results</a></p>" +
      "</div>";
    }).join("");
    html += "<div class=\"stack-card\">" +
      "<details class=\"stack-expand\">" +
      "<summary><span class=\"stack-title\">" + escapeHtml(stackLabel) + "</span><span class=\"stack-summary-meta\"><span class=\"confidence-badge " + badgeClass + "\">" + escapeHtml(row.evidence_tier) + "</span> Score: <strong>" + escapeHtml(String(row.score || 0)) + "/100</strong></span></summary>" +
      "<div class=\"stack-expanded-content\">" +
      "<p><strong>Objective rationale</strong></p><ul>" + rationale + "</ul>" +
      "<p><strong>Evidence tier tags:</strong> " + tierTags + "</p>" +
      "<p><strong>Phase note:</strong> " + escapeHtml(row.phase_note || "") + "</p>" +
      (row.community_signal && row.community_signal.present ? "<p><strong>Community signal:</strong> " + escapeHtml(row.community_signal.classification) + " — " + escapeHtml(row.community_signal.note || "") + "</p>" : "") +
      "<div class=\"stack-evidence-panel\"><p><strong>Peptide-level supporting evidence</strong></p>" + evidenceRows + "</div>" +
      "<button class=\"stack-open-modal\" onclick=\"openStackModal(" + i + ")\">Open Full Research View</button>" +
      "<p><a href=\"https://clinicaltrials.gov/\" target=\"_blank\" rel=\"noopener noreferrer\">ClinicalTrials.gov</a> • <a href=\"https://pubmed.ncbi.nlm.nih.gov/\" target=\"_blank\" rel=\"noopener noreferrer\">PubMed</a></p>" +
      "</div></details>" +
      "</div>";
  }
  root.innerHTML = html;
}

function openStackModal(index) {
  if (!stackData || !stackData.recommendations || index < 0 || index >= stackData.recommendations.length) {
    return;
  }
  selectedStackIndex = index;
  var row = stackData.recommendations[index];
  var stackLabel = (row.stack || []).map(function(x) { return x.toUpperCase(); }).join(" + ");
  var badgeClass = row.evidence_tier === "HIGH" ? "badge-high" : (row.evidence_tier === "MEDIUM" ? "badge-medium" : "badge-context");
  var rationale = row.rationale && row.rationale.length ? row.rationale.map(function(r) { return "<li>" + escapeHtml(r) + "</li>"; }).join("") : "<li>Limited direct overlap signals.</li>";
  var tierTags = (row.tier_tags || []).map(function(t) {
    return "<span class=\"tier-chip\">" + escapeHtml(t.peptide) + " (" + escapeHtml(t.tier) + ")</span>";
  }).join(" ");
  var evidenceRows = (row.peptide_evidence || []).map(function(ev) {
    return "<div class=\"stack-evidence-row\">" +
      "<p><strong>" + escapeHtml(ev.peptide || "") + "</strong> <span class=\"tier-mini\">Tier " + escapeHtml(ev.tier || "D") + "</span></p>" +
      "<p>" + escapeHtml(ev.summary || "") + "</p>" +
      "<p><a href=\"" + escapeHtml(ev.clinicaltrials_url || "https://clinicaltrials.gov/") + "\" target=\"_blank\" rel=\"noopener noreferrer\">ClinicalTrials results</a> • <a href=\"" + escapeHtml(ev.pubmed_url || "https://pubmed.ncbi.nlm.nih.gov/") + "\" target=\"_blank\" rel=\"noopener noreferrer\">PubMed results</a></p>" +
    "</div>";
  }).join("");
  var deep = row.deep_research || {};
  var mechanismRows = (deep.mechanism_map || []).map(function(m) {
    var targets = (m.targets || []).map(function(t) { return "<span class=\"tier-chip\">" + escapeHtml(t) + "</span>"; }).join(" ");
    var pathways = (m.pathways || []).map(function(p) { return "<span class=\"tier-mini\">" + escapeHtml(p) + "</span>"; }).join(" ");
    return "<div class=\"stack-deep-card\">" +
      "<h4>" + escapeHtml((m.peptide || "").toUpperCase()) + "</h4>" +
      "<p><strong>Mechanistic role:</strong> " + escapeHtml(m.what_it_does || "") + "</p>" +
      "<p><strong>Targets:</strong> " + targets + "</p>" +
      "<p><strong>Pathways:</strong> " + pathways + "</p>" +
      "</div>";
  }).join("");
  var synergyRows = (deep.synergy_analysis || []).map(function(s) {
    var pair = (s.pair || []).map(function(p) { return String(p || "").toUpperCase(); }).join(" + ");
    var shared = (s.shared_targets || []).join(", ");
    var left = (s.left_unique_targets || []).join(", ");
    var right = (s.right_unique_targets || []).join(", ");
    return "<div class=\"stack-deep-card\">" +
      "<h4>Synergy Pair: " + escapeHtml(pair) + "</h4>" +
      "<p><strong>Why complementary:</strong> " + escapeHtml(s.why_complementary || "") + "</p>" +
      "<p><strong>Shared targets:</strong> " + escapeHtml(shared || "None") + "</p>" +
      "<p><strong>Unique contribution A:</strong> " + escapeHtml(left || "None") + "</p>" +
      "<p><strong>Unique contribution B:</strong> " + escapeHtml(right || "None") + "</p>" +
      "<p><strong>Pathway reasoning:</strong> " + escapeHtml(s.pathway_reasoning || "") + "</p>" +
      "</div>";
  }).join("");
  var neuroRows = (deep.neuroplasticity_notes || []).map(function(n) {
    return "<div class=\"stack-deep-card\">" +
      "<h4>" + escapeHtml((n.peptide || "stack").toUpperCase()) + "</h4>" +
      "<p>" + escapeHtml(n.note || "") + "</p>" +
      "<p><strong>Confidence:</strong> " + escapeHtml(n.confidence || "LIMITED") + "</p>" +
      "</div>";
  }).join("");
  var riskRows = (deep.risk_profile || []).map(function(r) {
    return "<div class=\"stack-deep-card stack-risk-card\">" +
      "<h4>" + escapeHtml((r.peptide || "stack").toUpperCase()) + " — " + escapeHtml(r.risk_type || "Risk") + "</h4>" +
      "<p>" + escapeHtml(r.detail || "") + "</p>" +
      "<p><strong>Severity:</strong> " + escapeHtml(r.severity || "MODERATE") + "</p>" +
      "</div>";
  }).join("");
  var gapRows = (deep.evidence_gaps || []).map(function(g) {
    return "<li><strong>" + escapeHtml((g.peptide || "stack").toUpperCase()) + ":</strong> " + escapeHtml(g.gap || "") + "</li>";
  }).join("");
  var ghAxisWarning = (deep.risk_flags || []).indexOf("gh_axis") >= 0
    ? "<div class=\"stack-risk-banner\"><strong>GH-axis caution:</strong> This stack includes growth-hormone-axis signaling components. Overuse or prolonged aggressive exposure can increase concern for insulin resistance trajectory, glycemic dysregulation, and theoretical pro-growth/tumor-signaling risk in predisposed contexts.</div>"
    : "";
  var coreNarrative = "<p><strong>What it does:</strong> " + escapeHtml(deep.what_it_does || "") + "</p>" +
    "<p><strong>How it does it:</strong> " + escapeHtml(deep.how_it_does_it || "") + "</p>" +
    "<p><strong>Why it does what it does:</strong> " + escapeHtml(deep.why_it_does_it || "") + "</p>";
  var content = "<h2>" + escapeHtml(stackLabel) + "</h2>" +
    "<p><span class=\"confidence-badge " + badgeClass + "\">" + escapeHtml(row.evidence_tier) + "</span> Score: <strong>" + escapeHtml(String(row.score || 0)) + "/100</strong></p>" +
    "<p><strong>Goal:</strong> " + escapeHtml(row.goal_label || stackData.goal_label || "") + "</p>" +
    "<p><strong>Objective rationale</strong></p><ul>" + rationale + "</ul>" +
    "<p><strong>Evidence tier tags:</strong> " + tierTags + "</p>" +
    "<p><strong>Phase note:</strong> " + escapeHtml(row.phase_note || "") + "</p>" +
    (row.community_signal && row.community_signal.present ? "<p><strong>Community signal:</strong> " + escapeHtml(row.community_signal.classification) + " — " + escapeHtml(row.community_signal.note || "") + "</p>" : "") +
    "<div class=\"stack-evidence-panel\"><p><strong>Peptide-level supporting evidence</strong></p>" + evidenceRows + "</div>" +
    "<div class=\"stack-deep-section\"><h3>Core mechanism narrative</h3>" + coreNarrative + "</div>" +
    "<div class=\"stack-deep-section\"><h3>Integrated pathway and synergy analysis</h3>" + mechanismRows + synergyRows + "</div>" +
    "<div class=\"stack-deep-section\"><h3>Neuroplasticity angle</h3>" + neuroRows + "</div>" +
    ghAxisWarning +
    "<div class=\"stack-deep-section\"><h3>Risk profile and abuse concerns</h3>" + riskRows + "</div>" +
    "<div class=\"stack-deep-section\"><h3>Evidence gaps</h3><ul>" + (gapRows || "<li>No major evidence gaps captured.</li>") + "</ul></div>";
  document.getElementById("stack_modal_content").innerHTML = content;
  document.getElementById("stack_modal").classList.remove("mode-hidden");
}

function closeStackModal() {
  selectedStackIndex = -1;
  document.getElementById("stack_modal").classList.add("mode-hidden");
  document.getElementById("stack_modal_content").innerHTML = "";
}

function loadStackRecommendations() {
  var goalEl = document.getElementById("stack_goal");
  var priorityEl = document.getElementById("stack_priority");
  var status = document.getElementById("stack_status");
  var btn = document.getElementById("stack_btn");
  var goal = goalEl.value;
  var priority = priorityEl.value;
  btn.disabled = true;
  btn.innerText = "Generating...";
  status.innerText = "Building evidence-ranked stack suggestions...";
  fetch("/stack-recommend?goal=" + encodeURIComponent(goal) + "&priority=" + encodeURIComponent(priority))
    .then(function(response) {
      return response.json().then(function(data) {
        return { ok: response.ok, data: data };
      });
    })
    .then(function(result) {
      if (!result.ok || result.data.error) {
        status.innerText = result.data.error || "Unable to generate stack right now.";
        document.getElementById("stack_results").innerHTML = "";
        return;
      }
      status.innerText = "Goal: " + result.data.goal_label + " • Priority: " + result.data.priority;
      renderStackResults(result.data);
    })
    .catch(function() {
      status.innerText = "Unable to load stack recommendations right now.";
      document.getElementById("stack_results").innerHTML = "";
    })
    .finally(function() {
      btn.disabled = false;
      btn.innerText = "Generate Stack";
    });
}

function setDensity(mode) {
  document.body.classList.remove("density-compact", "density-clinical", "density-deep");
  document.body.classList.add("density-" + mode);
}

function getWatchlist() {
  var raw = localStorage.getItem("peptide_watchlist") || "[]";
  try {
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveWatchlist(items) {
  localStorage.setItem("peptide_watchlist", JSON.stringify(items));
}

function renderWatchlist() {
  var section = document.getElementById("watchlist_section");
  var list = getWatchlist();
  if (list.length === 0) {
    section.innerHTML = "<h3>Saved Peptides</h3><p>No saved peptides yet.</p>";
    return;
  }
  var html = "<h3>Saved Peptides</h3><ul>";
  for (var i = 0; i < list.length; i++) {
    html += "<li><button class=\"linkish\" onclick=\"quickSearch('" + list[i] + "')\">" + list[i] + "</button></li>";
  }
  html += "</ul>";
  section.innerHTML = html;
}

function saveCurrentPeptide() {
  if (!lastData || !lastData.peptide_name) {
    return;
  }
  var list = getWatchlist();
  if (list.indexOf(lastData.peptide_name) === -1) {
    list.push(lastData.peptide_name);
    saveWatchlist(list);
    renderWatchlist();
  }
}

function quickSearch(name) {
  document.getElementById("search_term").value = name;
  searchPeptide();
}

function searchPeptide() {
  if (searching) {
    return;
  }
  var searchTerm = document.getElementById("search_term").value.trim();
  var statusMessage = document.getElementById("status_message");
  var aliasInfo = document.getElementById("alias_info");
  var peptideName = document.getElementById("peptide_name");
  var medicalDefinition = document.getElementById("medical_definition");
  var research = document.getElementById("research");
  var methods = document.getElementById("methods");
  var benefitsList = document.getElementById("benefits_list");
  var consList = document.getElementById("cons_list");
  var trialsSection = document.getElementById("trials_section");
  var pubmedSection = document.getElementById("pubmed_section");
  var sourcesSection = document.getElementById("sources_section");
  var compareTerm = document.getElementById("compare_term").value.trim();

  if (!searchTerm) {
    statusMessage.innerText = "Please type a peptide name first.";
    return;
  }

  setSearchLoading(true);
  statusMessage.innerText = "Searching trusted sources...";
  aliasInfo.innerText = "";
  peptideName.innerText = "";
  medicalDefinition.innerText = "";
  research.innerText = "";
  methods.innerText = "";
  benefitsList.innerHTML = "";
  consList.innerHTML = "";
  trialsSection.innerHTML = "";
  pubmedSection.innerHTML = "";
  sourcesSection.innerHTML = "";

  fetch("/search?term=" + encodeURIComponent(searchTerm))
    .then(function(response) {
      return response.json().then(function(data) {
        return { ok: response.ok, data: data };
      });
    })
    .then(function(result) {
      if (!result.ok || result.data.error) {
        statusMessage.innerText = result.data.error || "No information found.";
        setSearchLoading(false);
        return;
      }

      var data = result.data;
      lastData = data;
      statusMessage.innerText = "";
      renderReliability(data);
      peptideName.innerText = data.peptide_name;
      vialLabel.innerText = data.peptide_name.toUpperCase().slice(0, 14);
      medicalDefinition.innerText = data.medical_definition;
      research.innerText = data.plain_summary;
      methods.innerText = humanizeMethods(data.methods);
      benefitsList.innerHTML = listToItems(data.benefits);
      consList.innerHTML = listToItems(data.cons);
      renderClinicalSnapshot(data);
      renderQuickSummary(data);
      currentTrials = data.clinical_trials || [];
      renderTrials(currentTrials);
      renderEvidenceClaims(data.evidence_claims || []);
      renderEvidenceScore(data);
      renderTimeline(data.trial_timeline || null);
      renderFreshness(data.last_updated_utc || "");

      var pubmedHtml = "<h3>PubMed Literature</h3>";
      var topPapers = data.top_pubmed_articles || data.pubmed_articles || [];
      if (topPapers && topPapers.length > 0) {
        pubmedHtml += "<p><strong>Top strongest papers</strong> ranked by trial wording + recency signals.</p>";
        pubmedHtml += "<div class=\"paper-list\">";
        for (var p = 0; p < topPapers.length; p++) {
          var paper = topPapers[p];
          pubmedHtml += "<div class=\"paper-card\">" +
            "<p><strong>" + paper.title + "</strong></p>" +
            "<p>PMID: " + paper.pmid + " | " + paper.source + " | " + paper.pubdate + (paper.strength ? " | Strength: " + paper.strength + "/100" : "") + "</p>" +
            "<p><a href=\"" + paper.link + "\" target=\"_blank\" rel=\"noopener noreferrer\">Open PubMed record</a></p>" +
            "</div>";
        }
        pubmedHtml += "</div>";
      } else {
        pubmedHtml += "<p>No PubMed records were found for this term.</p>";
      }
      pubmedSection.innerHTML = pubmedHtml;

      var sourcesHtml = "<h3>Sources and Citations</h3><ul>";
      if (data.sources && data.sources.length > 0) {
        for (var j = 0; j < data.sources.length; j++) {
          var src = data.sources[j];
          var conf = confidenceForSource(src.label);
          sourcesHtml += "<li><span class=\"confidence-badge badge-" + conf + "\">" + conf.toUpperCase() + "</span> <a href=\"" + src.url + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + src.label + "</a></li>";
        }
      }
      if (data.clinical_trials && data.clinical_trials.length > 0) {
        sourcesHtml += "</ul><h3>Clinical Trial Citations</h3><ul>";
        for (var t = 0; t < data.clinical_trials.length; t++) {
          var ct = data.clinical_trials[t];
          sourcesHtml += "<li><a href=\"" + ct.link + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + escapeHtml(ct.nct_id + " — " + ct.title) + "</a></li>";
        }
      }
      sourcesHtml += "</ul>";
      sourcesSection.innerHTML = sourcesHtml;

      var overview = document.getElementById("tab_content_overview");
      overview.innerHTML = "<div class=\"trial-card\"><p><strong>Overview</strong></p><p>Use the tabs below to switch between summarized trial research and complete source citations.</p></div>";

      if (compareTerm) {
        fetch("/search?term=" + encodeURIComponent(compareTerm))
          .then(function(response) {
            return response.json().then(function(data2) {
              return { ok: response.ok, data: data2 };
            });
          })
          .then(function(compareResult) {
            if (!compareResult.ok || compareResult.data.error) {
              renderCompare(null);
              return;
            }
            renderCompare(compareResult.data);
          })
          .catch(function() {
            renderCompare(null);
          })
          .finally(function() {
            setSearchLoading(false);
          });
      } else {
        renderCompare(null);
        setSearchLoading(false);
      }
    })
    .catch(function() {
      statusMessage.innerText = "Unable to fetch data right now. Please try again.";
      setSearchLoading(false);
    });
}

function getOrderSelections() {
  var selections = [];
  for (var i = 0; i < orderCatalog.length; i++) {
    var item = orderCatalog[i];
    var input = document.getElementById("qty_" + item.id);
    var qty = parseInt((input && input.value) || "0", 10);
    if (qty > 0) {
      selections.push({ id: item.id, qty: qty, name: item.name, variant: item.variant, price: item.price });
    }
  }
  return selections;
}

function renderOrderTotal() {
  var totalEl = document.getElementById("order_total");
  var selected = getOrderSelections();
  var total = 0;
  for (var i = 0; i < selected.length; i++) {
    total += selected[i].qty * selected[i].price;
  }
  totalEl.innerHTML = "<strong>Total:</strong> $" + total.toFixed(2) + " USD";
}

function renderOrderCatalog(items) {
  orderCatalog = items || [];
  var root = document.getElementById("order_catalog");
  if (!orderCatalog.length) {
    root.innerHTML = "<p>No products available right now.</p>";
    return;
  }
  var html = "<div class=\"order-grid\">";
  for (var i = 0; i < orderCatalog.length; i++) {
    var item = orderCatalog[i];
    var disabled = item.in_stock ? "" : " disabled";
    html += "<div class=\"order-vial-card\">" +
      "<div class=\"order-vial-name\">" + escapeHtml(item.name) + "</div>" +
      "<div class=\"order-vial-variant\">" + escapeHtml(item.variant) + "</div>" +
      "<div class=\"order-vial-graphic\">" +
      "<div class=\"order-vial-cap\"></div>" +
      "<div class=\"order-vial-body\"><span>VIAL</span></div>" +
      "</div>" +
      "<div class=\"qty-stepper\">" +
      "<button type=\"button\" class=\"qty-btn\" onclick=\"adjustQty('" + escapeHtml(item.id) + "', -1)\"" + disabled + ">−</button>" +
      "<input class=\"qty-input\" id=\"qty_" + escapeHtml(item.id) + "\" type=\"number\" min=\"0\" step=\"1\" value=\"0\" oninput=\"renderOrderTotal()\"" + disabled + ">" +
      "<button type=\"button\" class=\"qty-btn\" onclick=\"adjustQty('" + escapeHtml(item.id) + "', 1)\"" + disabled + ">+</button>" +
      "</div>" +
      "<div class=\"order-vial-price\">$" + Number(item.price).toFixed(2) + " " + escapeHtml(item.currency || "USD") + "</div>" +
      "</div>";
  }
  html += "</div>";
  root.innerHTML = html;
  renderOrderTotal();
}

function adjustQty(itemId, delta) {
  var input = document.getElementById("qty_" + itemId);
  if (!input || input.disabled) {
    return;
  }
  var current = parseInt(input.value || "0", 10);
  if (isNaN(current)) {
    current = 0;
  }
  var next = current + delta;
  if (next < 0) {
    next = 0;
  }
  input.value = String(next);
  renderOrderTotal();
}

function loadCatalog() {
  fetch("/catalog")
    .then(function(response) {
      return response.json();
    })
    .then(function(data) {
      renderOrderCatalog(data.items || []);
    })
    .catch(function() {
      document.getElementById("order_catalog").innerHTML = "<p>Unable to load catalog right now.</p>";
    });
}

function submitOrderRequest() {
  var status = document.getElementById("order_status");
  var customerName = document.getElementById("order_customer_name").value.trim();
  var contact = document.getElementById("order_contact").value.trim();
  var notes = document.getElementById("order_notes").value.trim();
  var items = getOrderSelections().map(function(it) {
    return { id: it.id, qty: it.qty };
  });

  if (!customerName || !contact) {
    status.innerText = "Please add your name and contact.";
    return;
  }
  if (!items.length) {
    status.innerText = "Please select at least one peptide quantity.";
    return;
  }

  status.innerText = "Submitting order request...";
  fetch("/order-request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customer_name: customerName, contact: contact, notes: notes, items: items })
  })
    .then(function(response) {
      return response.json().then(function(data) {
        return { ok: response.ok, data: data };
      });
    })
    .then(function(result) {
      if (!result.ok || !result.data.ok) {
        status.innerText = (result.data && result.data.error) ? result.data.error : "Order request failed.";
        return;
      }
      status.innerText = "Order request submitted successfully. We will contact you soon.";
    })
    .catch(function() {
      status.innerText = "Unable to submit request right now.";
    });
}

document.getElementById("search_term").addEventListener("keydown", function(e) {
  if (e.key === "Enter") {
    searchPeptide();
  }
});

document.getElementById("compare_term").addEventListener("keydown", function(e) {
  if (e.key === "Enter") {
    searchPeptide();
  }
});

attachVialControls();
attachBackgroundParallax();
loadTrackerState();
renderTracker();
renderWatchlist();
setTab("overview");
setMode("research");
loadCatalog();
loadStackRecommendations();
