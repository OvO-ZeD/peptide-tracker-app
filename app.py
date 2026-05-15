from flask import Flask, render_template, request, jsonify
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
import json
from datetime import datetime, timezone
import os
import re

app = Flask(__name__, static_url_path="", static_folder=".")

ALIASES = {
    "reta": "retatrutide",
    "ret": "retatrutide",
    "tesa": "tesamorelin",
    "sema": "semaglutide",
    "tirz": "tirzepatide",
    "bpc": "bpc-157",
    "cjc": "cjc-1295",
}

SNAPSHOT_LIBRARY = {
    "tesamorelin": {
        "primary_effect": "Primarily investigated to reduce excess visceral abdominal fat and improve selected metabolic markers in specific clinical populations.",
        "mechanism_pathway": "Mimics growth hormone-releasing hormone signaling and increases endogenous GH with downstream IGF-1 activity, a pathway associated with lipid mobilization and visceral fat metabolism.",
        "expected_body_outcomes": "May reduce central abdominal fat burden and support improvements in metabolic risk signals in studied groups.",
        "clinical_context": "Most established in HIV-associated lipodystrophy studies and related metabolic research settings.",
    },
    "retatrutide": {
        "primary_effect": "Investigated for clinically meaningful body-weight reduction and glycemic improvement in obesity and type 2 diabetes programs.",
        "mechanism_pathway": "Acts as a multi-receptor agonist across glucagon, GLP-1, and GIP pathways, influencing appetite signaling, energy expenditure balance, gastric dynamics, and glucose regulation.",
        "expected_body_outcomes": "Can be associated with reduced calorie intake, improved metabolic control, and substantial fat-mass reduction in responsive trial populations.",
        "clinical_context": "Large interventional programs are ongoing to define long-term efficacy and safety across metabolic phenotypes.",
    },
    "semaglutide": {
        "primary_effect": "Used for glycemic control and weight management depending on indication and formulation.",
        "mechanism_pathway": "GLP-1 receptor agonism supports glucose-dependent insulin signaling, lowers glucagon tone, delays gastric emptying, and enhances satiety signaling.",
        "expected_body_outcomes": "Often linked with improved glucose metrics and progressive weight reduction through appetite and intake modulation.",
        "clinical_context": "Supported by large randomized trial programs in diabetes, obesity, and cardiometabolic outcomes.",
    },
    "tirzepatide": {
        "primary_effect": "Used or investigated for strong glycemic improvement and weight reduction in metabolic disease care.",
        "mechanism_pathway": "Dual GIP and GLP-1 receptor agonism modulates insulin dynamics, satiety pathways, and postprandial metabolic responses.",
        "expected_body_outcomes": "Can lead to significant HbA1c reduction and body-weight decline in eligible patient populations.",
        "clinical_context": "Evidence base includes major phase programs in type 2 diabetes and obesity-related metabolic disease.",
    },
    "bpc-157": {
        "primary_effect": "Discussed mainly in experimental contexts for tissue-repair and inflammation-related hypotheses.",
        "mechanism_pathway": "Proposed pathways are still investigational and not fully established in rigorous human therapeutic frameworks.",
        "expected_body_outcomes": "Potential effects remain uncertain in high-quality human evidence contexts.",
        "clinical_context": "Human interventional evidence is comparatively limited versus approved metabolic therapeutics.",
    },
    "cjc-1295": {
        "primary_effect": "Investigated in growth-hormone-axis research and endocrine signaling contexts.",
        "mechanism_pathway": "Acts as a growth hormone-releasing hormone analog designed to prolong GH-axis stimulation.",
        "expected_body_outcomes": "May increase GH/IGF-1 signaling activity, with downstream effects dependent on dose, population, and treatment context.",
        "clinical_context": "Evidence remains more limited than established approved therapies and requires careful contextual interpretation.",
    },
}

ORDER_CATALOG = [
    {"id": "tesamorelin-5mg", "name": "Tesamorelin", "variant": "5mg vial", "price": 120.0, "currency": "USD", "in_stock": True},
    {"id": "retatrutide-10mg", "name": "Retatrutide", "variant": "10mg vial", "price": 120.0, "currency": "USD", "in_stock": True},
    {"id": "semaglutide-5mg", "name": "Semaglutide", "variant": "5mg vial", "price": 120.0, "currency": "USD", "in_stock": True},
    {"id": "tirzepatide-10mg", "name": "Tirzepatide", "variant": "10mg vial", "price": 120.0, "currency": "USD", "in_stock": True},
    {"id": "cjc1295-5mg", "name": "CJC-1295", "variant": "5mg vial", "price": 120.0, "currency": "USD", "in_stock": True},
    {"id": "bpc157-5mg", "name": "BPC-157", "variant": "5mg vial", "price": 120.0, "currency": "USD", "in_stock": True},
]

STACK_KNOWLEDGE = {
    "retatrutide": {
        "effects": ["fat_loss", "glycemic_support", "appetite_modulation"],
        "tier": "A",
        "summary": "Multi-receptor incretin agonist with strong obesity and metabolic trial signals.",
    },
    "tesamorelin": {
        "effects": ["visceral_fat", "gh_axis", "body_composition"],
        "tier": "A",
        "summary": "GHRH analog with established data in visceral fat-focused populations.",
    },
    "ipamorelin": {
        "effects": ["gh_axis", "recovery", "lean_mass_support"],
        "tier": "C",
        "summary": "GH-axis support signal is mostly mechanistic and smaller-study weighted.",
    },
    "mots-c": {
        "effects": ["metabolic_flexibility", "exercise_tolerance", "fat_loss_support"],
        "tier": "C",
        "summary": "Early-stage metabolic signaling peptide with limited human evidence depth.",
    },
    "semaglutide": {
        "effects": ["fat_loss", "glycemic_support", "appetite_modulation"],
        "tier": "A",
        "summary": "GLP-1 agonist with extensive high-quality obesity and diabetes evidence.",
    },
    "tirzepatide": {
        "effects": ["fat_loss", "glycemic_support", "appetite_modulation"],
        "tier": "A",
        "summary": "Dual GIP/GLP-1 agonist with strong outcomes in weight and glycemic endpoints.",
    },
    "cjc-1295": {
        "effects": ["gh_axis", "recovery", "lean_mass_support"],
        "tier": "C",
        "summary": "Long-acting GHRH analog context with limited high-quality human outcomes.",
    },
    "bpc-157": {
        "effects": ["recovery", "inflammation_hypothesis"],
        "tier": "D",
        "summary": "Evidence is mostly preclinical or anecdotal and should be treated as uncertain.",
    },
    "semax": {
        "effects": ["focus", "stress_response"],
        "tier": "C",
        "summary": "Neurocognitive-related signals are present but broad clinical evidence is limited.",
    },
    "selank": {
        "effects": ["calm", "anxiety_support", "focus"],
        "tier": "C",
        "summary": "Anxiolytic/focus hypotheses exist with limited large-trial evidence depth.",
    },
    "melanotan-2": {
        "effects": ["tanning_support", "uv_response"],
        "tier": "D",
        "summary": "Primarily discussed in aesthetic tanning contexts with limited controlled human evidence depth.",
    },
    "ghk-cu": {
        "effects": ["skin_quality", "recovery", "healing_support"],
        "tier": "C",
        "summary": "Skin and repair related signals are mostly early-stage or mixed-evidence in human settings.",
    },
    "tb-500": {
        "effects": ["recovery", "healing_support", "connective_tissue_support"],
        "tier": "D",
        "summary": "Often discussed for repair/recovery protocols, but controlled human evidence remains limited.",
    },
    "aod-9604": {
        "effects": ["fat_loss_support", "metabolic_flexibility"],
        "tier": "C",
        "summary": "Fat-metabolism focused peptide with narrower and less mature human evidence than incretin agents.",
    },
    "dsip": {
        "effects": ["sleep_support", "stress_response"],
        "tier": "D",
        "summary": "Sleep-focused discussions are common, though high-quality contemporary clinical evidence is limited.",
    },
    "ss-31": {
        "effects": ["mitochondrial_support", "exercise_tolerance", "recovery"],
        "tier": "C",
        "summary": "Mitochondrial-targeted candidate with translational potential and evolving human evidence.",
    },
}

GOAL_BLUEPRINTS = {
    "fat_loss": {
        "label": "Fat Loss",
        "primary_targets": ["fat_loss", "appetite_modulation", "visceral_fat", "glycemic_support"],
        "optional_support": ["gh_axis", "metabolic_flexibility"],
        "default_priority": ["retatrutide", "tesamorelin"],
        "phase_note": "Research scenario: prioritize core metabolic/weight peptide first, then consider adjunct support signals in later phase if rationale remains strong.",
    },
    "lean_mass": {
        "label": "Lean Mass Support",
        "primary_targets": ["lean_mass_support", "gh_axis", "recovery"],
        "optional_support": ["glycemic_support"],
        "default_priority": ["tesamorelin", "ipamorelin"],
        "phase_note": "Research scenario: start with strongest GH-axis signal, then evaluate additive recovery-related candidates where evidence supports complementarity.",
    },
    "focus_calm": {
        "label": "Focus / Calm",
        "primary_targets": ["focus", "calm", "stress_response", "anxiety_support"],
        "optional_support": [],
        "default_priority": ["semax", "selank"],
        "phase_note": "Research scenario: prioritize cognitive/anxiolytic objective alignment and avoid over-stacking when evidence certainty is limited.",
    },
    "tanning": {
        "label": "Tanning / UV Response",
        "primary_targets": ["tanning_support", "uv_response", "skin_quality"],
        "optional_support": ["recovery"],
        "default_priority": ["melanotan-2", "ghk-cu"],
        "phase_note": "Research scenario: center on pigmentation-focused signal first, then consider skin-repair support as secondary context.",
    },
    "recovery_healing": {
        "label": "Recovery / Healing Support",
        "primary_targets": ["recovery", "healing_support", "connective_tissue_support"],
        "optional_support": ["gh_axis", "inflammation_hypothesis"],
        "default_priority": ["ghk-cu", "tb-500"],
        "phase_note": "Research scenario: prioritize direct recovery/healing signal candidates and treat broader inflammation claims as lower-certainty adjuncts.",
    },
    "sleep_stress": {
        "label": "Sleep / Stress Regulation",
        "primary_targets": ["sleep_support", "stress_response", "calm"],
        "optional_support": ["anxiety_support"],
        "default_priority": ["dsip", "selank"],
        "phase_note": "Research scenario: limit stack complexity and prioritize clear sleep or stress endpoints over broad mixed-goal combinations.",
    },
    "endurance_performance": {
        "label": "Endurance / Performance",
        "primary_targets": ["exercise_tolerance", "mitochondrial_support", "metabolic_flexibility"],
        "optional_support": ["recovery", "lean_mass_support"],
        "default_priority": ["ss-31", "mots-c"],
        "phase_note": "Research scenario: prioritize exercise and mitochondrial objective fit, then test recovery adjuncts if rationale remains coherent.",
    },
    "metabolic_health": {
        "label": "Metabolic Health",
        "primary_targets": ["glycemic_support", "appetite_modulation", "metabolic_flexibility"],
        "optional_support": ["visceral_fat", "fat_loss_support"],
        "default_priority": ["retatrutide", "semaglutide"],
        "phase_note": "Research scenario: prioritize strongest glycemic and appetite evidence first, then evaluate narrower metabolic adjuncts.",
    },
}

COMMUNITY_NOTES = {
    "retatrutide+tesamorelin": "Community discussions often pair incretin-based fat-loss signals with GH-axis body-composition goals; this is anecdotal and must be validated against trial evidence.",
    "retatrutide+tesamorelin+ipamorelin": "Forum protocols sometimes phase GH-axis adjuncts after initial response period; evidence quality is lower than controlled trials.",
    "semax+selank": "Community reports commonly describe focus/calm pairing; classify as anecdotal unless stronger controlled evidence is available.",
    "melanotan-2+ghk-cu": "Community discussions often pair tanning-focused protocols with skin-quality support peptides; this remains anecdotal.",
    "ghk-cu+tb-500": "Repair-focused communities frequently combine these as a recovery protocol, with limited controlled clinical validation.",
    "dsip+selank": "Sleep and calm pairings are discussed in anecdotal protocol threads and should be weighted below trial-grade evidence.",
    "ss-31+mots-c": "Performance communities may combine mitochondrial and metabolic flexibility signals; controlled comparative evidence is limited.",
}


def normalize_term(term):
    key = term.strip().lower()
    return ALIASES.get(key, key)


def fetch_json(url, headers=None):
    try:
        req = Request(url, headers=headers or {"User-Agent": "peptide-wiki/1.0"})
        with urlopen(req, timeout=18) as response:
            return json.loads(response.read().decode("utf-8"))
    except (URLError, HTTPError, TimeoutError, json.JSONDecodeError):
        return None


def source_status(wiki, trials, pubmed, fda_data):
    return {
        "wikipedia": bool(wiki and wiki.get("summary")),
        "clinicaltrials": bool(trials),
        "pubmed": bool(pubmed),
        "openfda": bool(fda_data),
    }


def fetch_wikipedia_summary(term):
    wiki_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{quote(term)}"
    data = fetch_json(wiki_url)
    if not data:
        return {
            "title": term,
            "summary": "No encyclopedia summary was found for this peptide.",
            "url": f"https://en.wikipedia.org/wiki/{quote(term)}",
        }
    title = data.get("title") or term
    summary = data.get("extract") or "No summary text was returned."
    wiki_page = data.get("content_urls", {}).get("desktop", {}).get("page")
    if not wiki_page:
        wiki_page = f"https://en.wikipedia.org/wiki/{quote(term)}"
    return {"title": title, "summary": summary, "url": wiki_page}


def fetch_clinical_trials(term):
    endpoint = f"https://clinicaltrials.gov/api/v2/studies?query.term={quote(term)}&pageSize=20"
    data = fetch_json(endpoint)
    if not data:
        return []
    studies = data.get("studies", [])
    results = []
    for study in studies:
        protocol = study.get("protocolSection", {})
        ident = protocol.get("identificationModule", {})
        desc = protocol.get("descriptionModule", {})
        design = protocol.get("designModule", {})
        arms = protocol.get("armsInterventionsModule", {})
        status = protocol.get("statusModule", {})

        nct_id = ident.get("nctId", "N/A")
        title = ident.get("briefTitle") or ident.get("officialTitle") or "Untitled Study"
        brief = desc.get("briefSummary") or "No brief summary available."
        phase_list = design.get("phases", [])
        phase = ", ".join(phase_list) if phase_list else "Not specified"
        model = design.get("designInfo", {}).get("interventionModelDescription") or "Not specified"
        purpose = design.get("designInfo", {}).get("primaryPurpose") or "Not specified"
        allocation = design.get("designInfo", {}).get("allocation") or "Not specified"
        status_text = status.get("overallStatus") or "Not specified"

        interventions = []
        for item in arms.get("interventions", []):
            name = item.get("name")
            int_type = item.get("type")
            if name and int_type:
                interventions.append(f"{int_type}: {name}")
            elif name:
                interventions.append(name)

        methods = (
            f"Phase: {phase}. Primary purpose: {purpose}. Allocation: {allocation}. "
            f"Intervention model: {model}. Interventions: {('; '.join(interventions) if interventions else 'Not listed')}."
        )

        results.append(
            {
                "nct_id": nct_id,
                "title": title,
                "status": status_text,
                "lay_summary": brief,
                "methods": methods,
                "link": f"https://clinicaltrials.gov/study/{nct_id}" if nct_id != "N/A" else "https://clinicaltrials.gov",
            }
        )
    return results


def fetch_pubmed(term):
    query = f"({term}[Title/Abstract]) OR ({term}[MeSH Terms]) OR ({term}[All Fields])"
    search_url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=12&sort=relevance&term={quote(query)}"
    search_data = fetch_json(search_url)
    if not search_data:
        return []
    ids = search_data.get("esearchresult", {}).get("idlist", [])
    papers = []
    for pmid in ids:
        sum_url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id={pmid}"
        sum_data = fetch_json(sum_url)
        if not sum_data:
            continue
        record = sum_data.get("result", {}).get(str(pmid), {})
        if not record:
            continue
        papers.append(
            {
                "pmid": str(pmid),
                "title": record.get("title", "Untitled"),
                "pubdate": record.get("pubdate", "Unknown"),
                "source": record.get("source", "PubMed"),
                "authors": record.get("authors", []),
                "link": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
            }
        )
    return papers


def parse_year(pubdate):
    if not pubdate:
        return None
    match = re.search(r"(19|20)\d{2}", str(pubdate))
    if not match:
        return None
    return int(match.group(0))


def paper_strength(title, pubdate):
    score = 20
    t = (title or "").lower()
    if any(k in t for k in ["randomized", "double-blind", "placebo", "controlled", "phase 3", "phase iii"]):
        score += 28
    elif any(k in t for k in ["phase 2", "phase ii", "clinical trial"]):
        score += 20
    elif any(k in t for k in ["meta-analysis", "systematic review"]):
        score += 24
    elif any(k in t for k in ["case report", "protocol", "letter"]):
        score -= 8
    year = parse_year(pubdate)
    current_year = datetime.now(timezone.utc).year
    if year:
        age = current_year - year
        if age <= 2:
            score += 18
        elif age <= 5:
            score += 12
        elif age <= 10:
            score += 6
    return max(0, min(100, score))


def rank_pubmed(papers):
    ranked = []
    for paper in papers:
        strength = paper_strength(paper.get("title"), paper.get("pubdate"))
        copy = dict(paper)
        copy["strength"] = strength
        ranked.append(copy)
    ranked.sort(key=lambda p: p.get("strength", 0), reverse=True)
    return ranked


def build_evidence_score(trials, pubmed, fda_data, wiki):
    trial_points = min(45, len(trials) * 4)
    completed_trials = sum(1 for t in trials if (t.get("status") or "") == "COMPLETED")
    trial_points += min(20, completed_trials * 3)
    top_paper = pubmed[0].get("strength", 0) if pubmed else 0
    pubmed_points = min(25, int(top_paper * 0.25))
    fda_points = 10 if fda_data else 0
    wiki_points = 5 if wiki and wiki.get("summary") else 0
    total = min(100, trial_points + pubmed_points + fda_points + wiki_points)
    tier = "HIGH" if total >= 75 else "MEDIUM" if total >= 45 else "LOW"
    return {
        "score": total,
        "tier": tier,
        "breakdown": {
            "trials": trial_points,
            "pubmed": pubmed_points,
            "fda": fda_points,
            "encyclopedia": wiki_points,
        },
    }


def tier_points(tier):
    return {"A": 24, "B": 18, "C": 10, "D": 4}.get(tier, 2)


def build_peptide_evidence(pep):
    term = quote(pep)
    return {
        "peptide": pep,
        "clinicaltrials_url": f"https://clinicaltrials.gov/search?term={term}",
        "pubmed_url": f"https://pubmed.ncbi.nlm.nih.gov/?term={term}",
    }


def describe_effect(effect):
    labels = {
        "fat_loss": "fat-mass reduction pressure",
        "glycemic_support": "glucose-control and insulin-signaling support",
        "appetite_modulation": "central appetite modulation",
        "visceral_fat": "visceral adiposity targeting",
        "gh_axis": "growth-hormone and IGF-1 axis signaling",
        "body_composition": "body-composition repartitioning",
        "lean_mass_support": "lean-mass retention and support",
        "recovery": "recovery and tissue-repair support",
        "metabolic_flexibility": "substrate-use and metabolic flexibility",
        "focus": "attentional focus signaling",
        "stress_response": "stress-response regulation",
        "calm": "calm/anxiolytic signaling",
        "anxiety_support": "anxiety-load reduction support",
        "tanning_support": "melanocortin-linked pigmentation signaling",
        "uv_response": "UV-response adaptation",
        "skin_quality": "skin remodeling support",
        "healing_support": "healing cascade support",
        "connective_tissue_support": "connective tissue remodeling support",
        "fat_loss_support": "adjunct fat-loss signaling",
        "sleep_support": "sleep architecture support",
        "mitochondrial_support": "mitochondrial energetic support",
        "exercise_tolerance": "exercise tolerance signaling",
        "inflammation_hypothesis": "inflammation-related exploratory signaling",
    }
    return labels.get(effect, effect.replace("_", " "))


def build_stack_deep_research(goal, unique_stack):
    pathways = []
    mechanism_map = []
    synergy_analysis = []
    neuroplasticity_notes = []
    risk_profile = []
    evidence_gaps = []
    risk_flags = []

    for pep in unique_stack:
        meta = STACK_KNOWLEDGE.get(pep, {})
        effects = meta.get("effects", [])
        tier = meta.get("tier", "D")
        pathways.append(
            {
                "peptide": pep,
                "targets": [describe_effect(e) for e in effects],
                "pathway_focus": [e for e in effects],
            }
        )
        mechanism_map.append(
            {
                "peptide": pep,
                "what_it_does": meta.get("summary", "No summary available."),
                "how_it_does_it": "Primary action is inferred from effect-cluster alignment and current evidence tier.",
                "why_it_does_it": "Expected outcomes are driven by receptor-level or signaling-pathway modulation represented by the mapped effect set.",
                "targets": [describe_effect(e) for e in effects],
                "pathways": effects,
                "evidence_tier": tier,
            }
        )
        if "focus" in effects or "stress_response" in effects or "calm" in effects or "sleep_support" in effects:
            neuroplasticity_notes.append(
                {
                    "peptide": pep,
                    "note": "Neurocognitive and stress-regulation hypotheses may involve synaptic signaling adaptation and neurotrophic-pathway interaction, but certainty is limited by trial depth.",
                    "confidence": "LIMITED" if tier in ["C", "D"] else "MODERATE",
                }
            )
        if "gh_axis" in effects:
            risk_flags.append("gh_axis")
            risk_profile.append(
                {
                    "peptide": pep,
                    "risk_type": "GH-axis caution",
                    "detail": "Excessive or prolonged GH/IGF-1 pathway stimulation can increase concern for insulin resistance trajectory, glucose dysregulation, and growth signaling load in susceptible individuals.",
                    "severity": "ELEVATED",
                }
            )
            risk_profile.append(
                {
                    "peptide": pep,
                    "risk_type": "Predisposition concerns",
                    "detail": "In predisposed contexts, intensified anabolic signaling may raise concern about pro-growth environments, including theoretical tumor-growth signal amplification pathways.",
                    "severity": "ELEVATED",
                }
            )
        if tier in ["C", "D"]:
            evidence_gaps.append(
                {
                    "peptide": pep,
                    "gap": "Needs stronger randomized human outcome data and longer-horizon safety characterization.",
                }
            )

    for i in range(len(unique_stack)):
        for j in range(i + 1, len(unique_stack)):
            left = unique_stack[i]
            right = unique_stack[j]
            left_meta = STACK_KNOWLEDGE.get(left, {})
            right_meta = STACK_KNOWLEDGE.get(right, {})
            left_effects = set(left_meta.get("effects", []))
            right_effects = set(right_meta.get("effects", []))
            overlap = sorted(left_effects.intersection(right_effects))
            left_unique = sorted(left_effects - right_effects)
            right_unique = sorted(right_effects - left_effects)
            synergy_analysis.append(
                {
                    "pair": [left, right],
                    "why_complementary": "One component may broaden pathway coverage while the other deepens target intensity, creating a layered objective fit.",
                    "shared_targets": [describe_effect(x) for x in overlap],
                    "left_unique_targets": [describe_effect(x) for x in left_unique],
                    "right_unique_targets": [describe_effect(x) for x in right_unique],
                    "pathway_reasoning": "Overlap can reinforce core goal biology while non-overlap can extend support to adjacent physiological constraints.",
                }
            )

    if not neuroplasticity_notes:
        neuroplasticity_notes.append(
            {
                "peptide": "stack",
                "note": "This stack is not primarily neuroplasticity-targeted, though systemic metabolic and stress-load changes can still indirectly affect brain plasticity context.",
                "confidence": "LIMITED",
            }
        )

    if not risk_profile:
        risk_profile.append(
            {
                "peptide": "stack",
                "risk_type": "General caution",
                "detail": "Stacking increases complexity and confounding. Misuse can magnify adverse-response uncertainty and should be interpreted within controlled evidence limitations.",
                "severity": "MODERATE",
            }
        )

    return {
        "goal_label": goal.get("label"),
        "what_it_does": "Stack objective is to combine high-overlap primary target coverage with selective adjunct pathways to improve goal-aligned response probability.",
        "how_it_does_it": "Mechanistically, each peptide contributes effect-cluster pressure across metabolic, endocrine, recovery, neurocognitive, or pigmentation pathways depending on composition.",
        "why_it_does_it": "Complementary pathway coverage can reduce single-path dependence and support multi-node biology relevant to the selected goal.",
        "mechanism_map": mechanism_map,
        "pathway_targets": pathways,
        "synergy_analysis": synergy_analysis,
        "neuroplasticity_notes": neuroplasticity_notes,
        "risk_profile": risk_profile,
        "risk_flags": sorted(list(set(risk_flags))),
        "evidence_gaps": evidence_gaps,
    }


def build_stack_candidates(goal_key, priority_peptide):
    goal = GOAL_BLUEPRINTS.get(goal_key)
    if not goal:
        return []
    priority = normalize_term(priority_peptide or "")
    known_priority = priority if priority in STACK_KNOWLEDGE else None
    candidates = []
    base_pool = [
        ["retatrutide", "tesamorelin"],
        ["retatrutide", "tesamorelin", "ipamorelin"],
        ["retatrutide", "tesamorelin", "mots-c"],
        ["semaglutide", "tesamorelin"],
        ["tirzepatide", "tesamorelin"],
        ["tesamorelin", "ipamorelin"],
        ["semax", "selank"],
        ["melanotan-2", "ghk-cu"],
        ["ghk-cu", "tb-500"],
        ["dsip", "selank"],
        ["ss-31", "mots-c"],
        ["semaglutide", "aod-9604"],
        ["tirzepatide", "mots-c", "ss-31"],
    ]
    for stack in base_pool:
        if known_priority and known_priority not in stack:
            continue
        score = 0
        reasons = []
        tier_tags = []
        for pep in stack:
            meta = STACK_KNOWLEDGE.get(pep)
            if not meta:
                continue
            tier = meta.get("tier", "D")
            tier_tags.append({"peptide": pep, "tier": tier})
            score += tier_points(tier)
            effects = set(meta.get("effects", []))
            overlaps = [x for x in goal.get("primary_targets", []) if x in effects]
            if overlaps:
                score += len(overlaps) * 7
                reasons.append(f"{pep} aligns with {', '.join(overlaps)}")
            optional = [x for x in goal.get("optional_support", []) if x in effects]
            if optional:
                score += len(optional) * 3
        unique_stack = list(dict.fromkeys(stack))
        if len(unique_stack) >= 2:
            score += 5
        stack_key = "+".join(unique_stack)
        community_note = COMMUNITY_NOTES.get(stack_key)
        evidence_tier = "HIGH" if score >= 70 else "MEDIUM" if score >= 50 else "LIMITED"
        peptide_evidence = []
        for pep in unique_stack:
            meta = STACK_KNOWLEDGE.get(pep, {})
            evidence_row = build_peptide_evidence(pep)
            evidence_row["tier"] = meta.get("tier", "D")
            evidence_row["summary"] = meta.get("summary", "No summary available.")
            peptide_evidence.append(evidence_row)
        deep_research = build_stack_deep_research(goal, unique_stack)
        candidates.append(
            {
                "goal": goal_key,
                "goal_label": goal.get("label"),
                "priority_peptide": known_priority,
                "stack": unique_stack,
                "score": min(100, score),
                "evidence_tier": evidence_tier,
                "rationale": reasons[:5],
                "phase_note": goal.get("phase_note"),
                "tier_tags": tier_tags,
                "community_signal": {
                    "present": bool(community_note),
                    "note": community_note,
                    "classification": "ANECDOTAL" if community_note else "NONE",
                },
                "peptide_evidence": peptide_evidence,
                "deep_research": deep_research,
                "sources": [
                    {"label": "ClinicalTrials.gov", "url": "https://clinicaltrials.gov/"},
                    {"label": "PubMed", "url": "https://pubmed.ncbi.nlm.nih.gov/"},
                ],
            }
        )
    candidates.sort(key=lambda x: x.get("score", 0), reverse=True)
    return candidates[:5]


def fetch_openfda(term):
    endpoint = f"https://api.fda.gov/drug/label.json?search={quote(term)}&limit=1"
    data = fetch_json(endpoint)
    if not data:
        return None
    results = data.get("results", [])
    if not results:
        return None
    item = results[0]
    indications = item.get("indications_and_usage", [""])
    warnings = item.get("warnings", [""])
    reactions = item.get("adverse_reactions", [""])
    return {
        "indications": indications[0][:500] if indications and indications[0] else "No FDA indication text available.",
        "warnings": warnings[0][:500] if warnings and warnings[0] else "No FDA warnings text available.",
        "adverse": reactions[0][:500] if reactions and reactions[0] else "No FDA adverse reaction text available.",
    }


def build_medical_definition(name, trials, fda_data, wiki_summary):
    if trials:
        phase = trials[0].get("methods", "")
        return (
            f"{name} is a bioactive peptide under clinical evaluation with evidence from interventional studies. "
            f"Current trial metadata indicates structured therapeutic investigation parameters. {phase}"
        )
    if fda_data:
        return (
            f"{name} is a peptide-associated therapeutic entity with publicly indexed regulatory labeling context. "
            f"Indications include: {fda_data['indications']}"
        )
    return f"{name} is a peptide with publicly indexed biomedical literature. Core context: {wiki_summary}"


def build_plain_summary(wiki_summary, trials):
    if trials:
        first = trials[0]
        return (
            f"In simple terms, this peptide has human studies. One key trial is '{first['title']}' ({first['nct_id']}) "
            f"with status {first['status']}. The study summary says: {first['lay_summary']}"
        )
    return f"In simple terms: {wiki_summary}"


def build_benefits_and_cons(trials, fda_data):
    benefits = []
    cons = []
    if trials:
        statuses = {t.get("status", "") for t in trials}
        if "COMPLETED" in statuses:
            benefits.append("Multiple completed clinical studies suggest meaningful evidence accumulation.")
        benefits.append("Clinical trial programs define dose, intervention model, and treatment objective.")
        cons.append("Some data may still be investigational and not yet definitive for broad real-world use.")
        cons.append("Trial populations can differ from general populations, limiting direct generalization.")
    if fda_data:
        if fda_data.get("indications"):
            benefits.append(f"Regulatory context: {fda_data['indications']}")
        if fda_data.get("warnings"):
            cons.append(f"Safety warnings: {fda_data['warnings']}")
        if fda_data.get("adverse"):
            cons.append(f"Adverse reactions noted in labeling: {fda_data['adverse']}")
    if not benefits:
        benefits.append("Public biomedical sources describe ongoing scientific interest.")
    if not cons:
        cons.append("Risk profile is not fully characterized from currently indexed sources alone.")
    return benefits[:5], cons[:5]


def build_timeline(trials):
    timeline = {"COMPLETED": 0, "RECRUITING": 0, "ACTIVE_NOT_RECRUITING": 0, "OTHER": 0}
    for trial in trials:
        status = trial.get("status", "OTHER")
        if status in timeline:
            timeline[status] += 1
        else:
            timeline["OTHER"] += 1
    return timeline


def build_evidence_claims(trials, pubmed, fda_data):
    claims = []
    if trials:
        top_trial = trials[0]
        claims.append(
            {
                "claim": f"Human interventional evidence exists, including trial {top_trial['nct_id']}.",
                "confidence": "HIGH",
                "source_label": "ClinicalTrials.gov",
                "source_url": top_trial.get("link", "https://clinicaltrials.gov"),
            }
        )
    if pubmed:
        paper = pubmed[0]
        claims.append(
            {
                "claim": "Peer-reviewed biomedical literature is indexed for this peptide.",
                "confidence": "HIGH",
                "source_label": "PubMed",
                "source_url": paper.get("link", "https://pubmed.ncbi.nlm.nih.gov/"),
            }
        )
    if fda_data:
        claims.append(
            {
                "claim": "Regulatory safety or indication text is available in drug labeling sources.",
                "confidence": "HIGH",
                "source_label": "OpenFDA",
                "source_url": "https://open.fda.gov/apis/drug/label/",
            }
        )
    return claims


def build_clinical_snapshot(term, trials, pubmed, fda_data, wiki_summary):
    base = SNAPSHOT_LIBRARY.get(term, {})
    primary_effect = base.get("primary_effect")
    mechanism_pathway = base.get("mechanism_pathway")
    expected_body_outcomes = base.get("expected_body_outcomes")
    clinical_context = base.get("clinical_context")

    if not primary_effect:
        if trials:
            top = trials[0]
            primary_effect = (
                f"Under clinical investigation with human-study signals, including trial {top.get('nct_id', 'N/A')} "
                f"currently listed as {top.get('status', 'Not specified').replace('_', ' ').title()}."
            )
        elif fda_data:
            primary_effect = "Linked to publicly indexed regulatory labeling context, with therapeutic use and safety text available."
        else:
            primary_effect = "Public biomedical sources indicate scientific interest, but high-quality clinical characterization may be limited."

    if not mechanism_pathway:
        if trials:
            methods = trials[0].get("methods", "")
            mechanism_pathway = f"Current mechanism context is inferred from trial design metadata: {methods}"
        else:
            mechanism_pathway = f"Mechanism details are not consistently established in available public records. Context summary: {wiki_summary}"

    if not expected_body_outcomes:
        expected_body_outcomes = "Body-level outcomes depend on indication, patient profile, dosing strategy, and duration of exposure in controlled studies."

    if not clinical_context:
        clinical_context = "Interpretation should be anchored to trial population, study design quality, and regulatory status."

    evidence_points = int(bool(trials)) + int(bool(pubmed)) + int(bool(fda_data))
    evidence_strength = "HIGH" if evidence_points >= 2 else "MODERATE" if evidence_points == 1 else "LIMITED"

    return {
        "primary_effect": primary_effect,
        "mechanism_pathway": mechanism_pathway,
        "expected_body_outcomes": expected_body_outcomes,
        "clinical_context": clinical_context,
        "evidence_strength": evidence_strength,
    }

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/healthz')
def healthz():
    return jsonify({"status": "ok"}), 200


@app.route('/catalog')
def catalog():
    return jsonify({"items": ORDER_CATALOG}), 200

@app.route('/search')
def search():
    raw_term = (request.args.get("term") or "").strip()
    if not raw_term:
        return jsonify({"error": "Please enter a peptide name."}), 400

    term = normalize_term(raw_term)
    wiki = fetch_wikipedia_summary(term)
    trials = fetch_clinical_trials(term)
    pubmed = rank_pubmed(fetch_pubmed(term))
    fda_data = fetch_openfda(term)
    medical_definition = build_medical_definition(wiki["title"], trials, fda_data, wiki["summary"])
    plain_summary = build_plain_summary(wiki["summary"], trials)
    benefits, cons = build_benefits_and_cons(trials, fda_data)
    timeline = build_timeline(trials)
    claims = build_evidence_claims(trials, pubmed, fda_data)
    snapshot = build_clinical_snapshot(term, trials, pubmed, fda_data, wiki["summary"])
    evidence_score = build_evidence_score(trials, pubmed, fda_data, wiki)
    source_ok = source_status(wiki, trials, pubmed, fda_data)
    healthy_sources = sum(1 for ok in source_ok.values() if ok)
    reliability = "HIGH" if healthy_sources >= 3 else ("MEDIUM" if healthy_sources >= 2 else "LOW")

    method_block = trials[0]["methods"] if trials else "No trial method details available."

    response = {
        "search_input": raw_term,
        "normalized_term": term,
        "peptide_name": wiki["title"],
        "medical_definition": medical_definition,
        "plain_summary": plain_summary,
        "research": plain_summary,
        "methods": method_block,
        "benefits": benefits,
        "cons": cons,
        "clinical_trials": trials,
        "pubmed_articles": pubmed,
        "top_pubmed_articles": pubmed[:5],
        "trial_timeline": timeline,
        "evidence_claims": claims,
        "evidence_score": evidence_score,
        "clinical_snapshot": snapshot,
        "source_status": source_ok,
        "reliability": reliability,
        "partial_data": healthy_sources < 4,
        "last_updated_utc": datetime.now(timezone.utc).isoformat(),
        "sources": [
            {"label": "Wikipedia", "url": wiki["url"]},
            {"label": "ClinicalTrials.gov search", "url": f"https://clinicaltrials.gov/search?term={quote(term)}"},
            {"label": "PubMed search", "url": f"https://pubmed.ncbi.nlm.nih.gov/?term={quote(term)}"},
            {"label": "OpenFDA drug labels", "url": f"https://api.fda.gov/drug/label.json?search={quote(term)}&limit=1"},
        ],
    }
    return jsonify(response)


@app.route('/order-request', methods=['POST'])
def order_request():
    payload = request.get_json(silent=True) or {}
    customer_name = (payload.get("customer_name") or "").strip()
    contact = (payload.get("contact") or "").strip()
    items = payload.get("items") or []
    notes = (payload.get("notes") or "").strip()

    if not customer_name or not contact:
        return jsonify({"error": "Customer name and contact are required."}), 400
    if not isinstance(items, list) or len(items) == 0:
        return jsonify({"error": "At least one item is required."}), 400

    catalog_index = {item["id"]: item for item in ORDER_CATALOG}
    normalized_items = []
    total = 0.0

    for row in items:
        item_id = row.get("id")
        qty = int(row.get("qty") or 0)
        if qty <= 0 or item_id not in catalog_index:
            continue
        base = catalog_index[item_id]
        line_total = qty * float(base["price"])
        total += line_total
        normalized_items.append(
            {
                "id": base["id"],
                "name": base["name"],
                "variant": base["variant"],
                "qty": qty,
                "unit_price": base["price"],
                "line_total": round(line_total, 2),
            }
        )

    if len(normalized_items) == 0:
        return jsonify({"error": "No valid order items were submitted."}), 400

    order_record = {
        "submitted_at_utc": datetime.now(timezone.utc).isoformat(),
        "customer_name": customer_name,
        "contact": contact,
        "notes": notes,
        "items": normalized_items,
        "total": round(total, 2),
        "currency": "USD",
        "status": "REQUEST_RECEIVED",
    }

    with open("order_requests.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(order_record) + "\n")

    return jsonify({"ok": True, "order": order_record}), 200


@app.route('/stack-recommend')
def stack_recommend():
    goal = (request.args.get("goal") or "fat_loss").strip().lower()
    priority = (request.args.get("priority") or "retatrutide").strip().lower()
    if goal not in GOAL_BLUEPRINTS:
        return jsonify({"error": "Unsupported goal."}), 400
    candidates = build_stack_candidates(goal, priority)
    return jsonify(
        {
            "goal": goal,
            "goal_label": GOAL_BLUEPRINTS[goal]["label"],
            "priority": normalize_term(priority),
            "recommendations": candidates,
            "policy": {
                "research_only": True,
                "medical_note": "Educational research context only. Not medical advice.",
                "evidence_tiers": {
                    "A": "Human trial-heavy",
                    "B": "Observational/review-weighted",
                    "C": "Mechanistic or limited human evidence",
                    "D": "Mostly anecdotal/preclinical",
                },
            },
        }
    ), 200

if __name__ == '__main__':
    port = int(os.environ.get("PORT", "8000"))
    app.run(host="0.0.0.0", port=port)
