from flask import Flask, render_template, jsonify, request
import os
import json
import threading
import time
from datetime import datetime, timedelta, timezone

from pywebpush import webpush, WebPushException

app = Flask(__name__, static_url_path="", static_folder=".")

DATA_FILE = os.environ.get("REMINDER_DATA_FILE", "reminder_data.json")
VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_CLAIMS_SUB = os.environ.get("VAPID_CLAIMS_SUB", "mailto:admin@example.com")
LOCK = threading.Lock()


def _read_data():
    if not os.path.exists(DATA_FILE):
        return {"subscriptions": []}
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            parsed = json.load(f)
        if not isinstance(parsed, dict):
            return {"subscriptions": []}
        if "subscriptions" not in parsed or not isinstance(parsed["subscriptions"], list):
            parsed["subscriptions"] = []
        return parsed
    except Exception:
        return {"subscriptions": []}


def _write_data(data):
    tmp_path = DATA_FILE + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(tmp_path, DATA_FILE)


def _next_due_utc(every_days, routine_time, lead_minutes):
    now = datetime.now(timezone.utc)
    try:
        hh, mm = [int(x) for x in str(routine_time or "08:00").split(":")[:2]]
    except Exception:
        hh, mm = 8, 0
    candidate = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
    while candidate <= now:
        candidate = candidate + timedelta(days=max(1, int(every_days or 1)))
    return candidate - timedelta(minutes=max(0, int(lead_minutes or 0)))


def _send_web_push(subscription_info, title, body):
    if not VAPID_PUBLIC_KEY or not VAPID_PRIVATE_KEY:
        return False
    payload = json.dumps({
        "title": title,
        "body": body,
        "url": "/",
        "tag": "peptide-reminder"
    })
    try:
        webpush(
            subscription_info=subscription_info,
            data=payload,
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_CLAIMS_SUB}
        )
        return True
    except WebPushException:
        return False


def _scheduler_loop():
    while True:
        with LOCK:
            data = _read_data()
            now = datetime.now(timezone.utc)
            dirty = False
            kept = []
            for rec in data.get("subscriptions", []):
                if not rec.get("enabled"):
                    kept.append(rec)
                    continue
                due_at_raw = rec.get("next_due_at")
                if not due_at_raw:
                    rec["next_due_at"] = _next_due_utc(rec.get("every_days", 1), rec.get("routine_time", "08:00"), rec.get("lead_minutes", 0)).isoformat()
                    dirty = True
                    kept.append(rec)
                    continue
                try:
                    due_at = datetime.fromisoformat(due_at_raw)
                    if due_at.tzinfo is None:
                        due_at = due_at.replace(tzinfo=timezone.utc)
                except Exception:
                    rec["next_due_at"] = _next_due_utc(rec.get("every_days", 1), rec.get("routine_time", "08:00"), rec.get("lead_minutes", 0)).isoformat()
                    dirty = True
                    kept.append(rec)
                    continue

                if due_at <= now:
                    ok = _send_web_push(
                        rec.get("subscription"),
                        "Upcoming peptide shot",
                        f"{rec.get('peptide_name', 'Peptide')} reminder"
                    )
                    rec["next_due_at"] = _next_due_utc(rec.get("every_days", 1), rec.get("routine_time", "08:00"), rec.get("lead_minutes", 0)).isoformat()
                    dirty = True
                    if ok:
                        kept.append(rec)
                else:
                    kept.append(rec)
            data["subscriptions"] = kept
            if dirty:
                _write_data(data)
        time.sleep(30)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/healthz')
def healthz():
    return jsonify({"status": "ok"}), 200


@app.route('/api/push/public-key')
def push_public_key():
    return jsonify({"publicKey": VAPID_PUBLIC_KEY}), 200


@app.route('/api/push/subscribe', methods=['POST'])
def push_subscribe():
    payload = request.get_json(silent=True) or {}
    subscription = payload.get("subscription")
    if not subscription:
        return jsonify({"error": "Missing subscription"}), 400

    record = {
        "tab_id": str(payload.get("tabId") or "default"),
        "peptide_name": str(payload.get("peptideName") or "Peptide"),
        "every_days": int(payload.get("everyDays") or 1),
        "routine_time": str(payload.get("routineTime") or "08:00"),
        "lead_minutes": int(payload.get("leadMinutes") or 0),
        "enabled": bool(payload.get("enabled", True)),
        "subscription": subscription,
    }
    record["next_due_at"] = _next_due_utc(record["every_days"], record["routine_time"], record["lead_minutes"]).isoformat()

    with LOCK:
        data = _read_data()
        subscriptions = data.get("subscriptions", [])
        endpoint = (subscription or {}).get("endpoint")
        replaced = False
        for i, rec in enumerate(subscriptions):
            if (rec.get("subscription") or {}).get("endpoint") == endpoint:
                subscriptions[i] = record
                replaced = True
                break
        if not replaced:
            subscriptions.append(record)
        data["subscriptions"] = subscriptions
        _write_data(data)

    return jsonify({"ok": True, "nextDueAt": record["next_due_at"]}), 200


if __name__ == '__main__':
    t = threading.Thread(target=_scheduler_loop, daemon=True)
    t.start()
    port = int(os.environ.get("PORT", "8000"))
    app.run(host="0.0.0.0", port=port)
