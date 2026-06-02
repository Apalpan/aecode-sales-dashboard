from __future__ import annotations

import hashlib
import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date as date_cls, datetime
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parents[1]
SOURCE = WORKSPACE / "outputs" / "bbdd-ventas-general-source.xlsx"
OUTPUT = ROOT / "data" / "dashboard-data.json"
SHEET = "BBDD Ventas General"
HASH_SALT = "aecode-sales-dashboard-v2"


def clean(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return str(value).strip()


def norm(value: object) -> str:
    text = clean(value).upper()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def parse_amount(value: object) -> float:
    text = clean(value).replace(",", "")
    if not text:
        return 0.0
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    return float(match.group(0)) if match else 0.0


def parse_date(value: object):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    parsed = pd.to_datetime(value, dayfirst=True, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.to_pydatetime().date()


def money_key(currency: str) -> str:
    currency_norm = norm(currency)
    if "USD" in currency_norm:
        return "USD"
    if "S/" in currency_norm or "PEN" in currency_norm or "SOLES" in currency_norm:
        return "PEN"
    return "SIN_MONEDA"


def payment_state(raw: str) -> str:
    value = norm(raw)
    if "PAGADO" in value:
        return "PAGADO"
    if "PENDIENTE" in value:
        return "PENDIENTE"
    if "ANULADO" in value:
        return "ANULADO"
    if "RETIRADO" in value:
        return "RETIRADO"
    return "SIN_ESTADO"


def product_line(program: str, offer_type: str) -> str:
    value = norm(f"{program} {offer_type}")
    if "BIM" in value:
        return "BIM / VDC"
    if "IA" in value or "INTELIGENCIA" in value:
        return "AI Construction"
    if "DYNAMO" in value or "PYTHON" in value or "AUTOMATIZACION" in value:
        return "Automatizacion"
    if "INVESTIGACION" in value or "METODOLOGIA" in value:
        return "Investigacion aplicada"
    return "Otros productos"


def cell(row, columns: dict[str, str], name: str):
    return row.get(columns.get(norm(name), name), "")


def anon_user_id(raw_key: str, fallback: str) -> str:
    key = raw_key or fallback
    digest = hashlib.sha256(f"{HASH_SALT}:{key}".encode("utf-8")).hexdigest()
    return f"u_{digest[:12]}"


def add_money(bucket: dict, currency: str, amount: float):
    key = money_key(currency)
    bucket[key] = round(bucket.get(key, 0) + amount, 2)


def top_items(counter: Counter, limit: int = 12):
    return [{"name": name or "Sin dato", "value": int(value)} for name, value in counter.most_common(limit)]


def main():
    df = pd.read_excel(SOURCE, sheet_name=SHEET, dtype=object)
    df.columns = [clean(c) for c in df.columns]
    columns = {norm(c): c for c in df.columns}

    rows = []
    user_counts = Counter()
    contactless_rows = 0

    for idx, row in df.iterrows():
        program = clean(cell(row, columns, "PROGRAMA"))
        offer_type = clean(cell(row, columns, "TIPO")) or "Sin tipo"
        amount = parse_amount(cell(row, columns, "INVERSION"))
        status = payment_state(clean(cell(row, columns, "PENDIENTE DE PAGO")))
        sale_date = parse_date(cell(row, columns, "FECHA"))
        has_core_data = bool(program or amount or sale_date)
        if not has_core_data:
            continue

        email = norm(cell(row, columns, "CORREO (ID)"))
        phone = re.sub(r"\D+", "", clean(cell(row, columns, "CONTACTO")))
        contact_key = email or phone
        if not contact_key:
            contactless_rows += 1

        user_id = anon_user_id(contact_key, f"row-{idx}")
        user_counts[user_id] += 1
        currency = money_key(clean(cell(row, columns, "MONEDA")))
        line = product_line(program, offer_type)

        rows.append(
            {
                "date": sale_date.isoformat() if sale_date else "",
                "month": sale_date.strftime("%Y-%m") if sale_date else "Sin fecha",
                "program": program or "Sin programa",
                "course": program or "Sin programa",
                "productLine": line,
                "type": offer_type,
                "module": clean(cell(row, columns, "MODULO")) or "Sin modulo",
                "modality": clean(cell(row, columns, "MODALIDAD")) or "Sin modalidad",
                "amount": amount,
                "currency": currency,
                "paymentType": clean(cell(row, columns, "TIPO DE PAGO")) or "Sin dato",
                "channel": clean(cell(row, columns, "CANAL DE PAGO")) or "Sin canal",
                "status": status,
                "bankStatus": clean(cell(row, columns, "registro excel, registro formulario")) or "Sin validar",
                "hasVoucher": bool(clean(cell(row, columns, "PAGOS EN SU TOTALIDAD"))),
                "hasId": bool(clean(cell(row, columns, "ID"))),
                "hasContact": bool(contact_key),
                "userId": user_id,
            }
        )

    for r in rows:
        r["userSegment"] = "Recurrente" if user_counts[r["userId"]] > 1 else "Nuevo"

    valid_status = {"PAGADO", "PENDIENTE"}
    active = [r for r in rows if r["status"] in valid_status]
    paid = [r for r in rows if r["status"] == "PAGADO"]
    pending = [r for r in rows if r["status"] == "PENDIENTE"]
    cancelled = [r for r in rows if r["status"] in {"ANULADO", "RETIRADO"}]

    revenue_paid = {}
    revenue_pipeline = {}
    pending_amount = {}
    for r in rows:
        if r["status"] == "PAGADO":
            add_money(revenue_paid, r["currency"], r["amount"])
        if r["status"] in valid_status:
            add_money(revenue_pipeline, r["currency"], r["amount"])
        if r["status"] == "PENDIENTE":
            add_money(pending_amount, r["currency"], r["amount"])

    monthly = defaultdict(
        lambda: {
            "month": "",
            "paidCount": 0,
            "pendingCount": 0,
            "activeEnrollments": 0,
            "uniqueUsers": set(),
            "paid": {},
            "pending": {},
        }
    )
    programs = defaultdict(
        lambda: {
            "program": "",
            "course": "",
            "productLine": "",
            "paidCount": 0,
            "pendingCount": 0,
            "cancelledCount": 0,
            "activeEnrollments": 0,
            "uniqueUsers": set(),
            "paid": {},
            "pending": {},
        }
    )
    channels = defaultdict(lambda: {"channel": "", "count": 0, "paidCount": 0, "pendingCount": 0, "paid": {}})
    payment_types = defaultdict(lambda: {"paymentType": "", "count": 0, "paidCount": 0, "pendingCount": 0, "paid": {}})
    types = defaultdict(lambda: {"type": "", "activeEnrollments": 0, "uniqueUsers": set(), "paidCount": 0, "paid": {}})
    product_lines = defaultdict(lambda: {"productLine": "", "activeEnrollments": 0, "paidCount": 0, "paid": {}})

    for r in rows:
        if r["status"] in valid_status and r["month"] != "Sin fecha":
            m = monthly[r["month"]]
            m["month"] = r["month"]
            m["activeEnrollments"] += 1
            m["uniqueUsers"].add(r["userId"])
            if r["status"] == "PAGADO":
                m["paidCount"] += 1
                add_money(m["paid"], r["currency"], r["amount"])
            elif r["status"] == "PENDIENTE":
                m["pendingCount"] += 1
                add_money(m["pending"], r["currency"], r["amount"])

        p = programs[r["program"]]
        p["program"] = r["program"]
        p["course"] = r["course"]
        p["productLine"] = r["productLine"]
        if r["status"] in valid_status:
            p["activeEnrollments"] += 1
            p["uniqueUsers"].add(r["userId"])
        if r["status"] == "PAGADO":
            p["paidCount"] += 1
            add_money(p["paid"], r["currency"], r["amount"])
        elif r["status"] == "PENDIENTE":
            p["pendingCount"] += 1
            add_money(p["pending"], r["currency"], r["amount"])
        elif r["status"] in {"ANULADO", "RETIRADO"}:
            p["cancelledCount"] += 1

        c = channels[r["channel"]]
        c["channel"] = r["channel"]
        c["count"] += 1
        if r["status"] == "PAGADO":
            c["paidCount"] += 1
            add_money(c["paid"], r["currency"], r["amount"])
        elif r["status"] == "PENDIENTE":
            c["pendingCount"] += 1

        pay = payment_types[r["paymentType"]]
        pay["paymentType"] = r["paymentType"]
        pay["count"] += 1
        if r["status"] == "PAGADO":
            pay["paidCount"] += 1
            add_money(pay["paid"], r["currency"], r["amount"])
        elif r["status"] == "PENDIENTE":
            pay["pendingCount"] += 1

        if r["status"] in valid_status:
            t = types[r["type"]]
            t["type"] = r["type"]
            t["activeEnrollments"] += 1
            t["uniqueUsers"].add(r["userId"])
            if r["status"] == "PAGADO":
                t["paidCount"] += 1
                add_money(t["paid"], r["currency"], r["amount"])

            line = product_lines[r["productLine"]]
            line["productLine"] = r["productLine"]
            line["activeEnrollments"] += 1
            if r["status"] == "PAGADO":
                line["paidCount"] += 1
                add_money(line["paid"], r["currency"], r["amount"])

    def finalize_users(items, user_key="uniqueUsers"):
        finalized = []
        for item in items:
            next_item = dict(item)
            if user_key in next_item:
                next_item[user_key] = len(next_item[user_key])
            finalized.append(next_item)
        return finalized

    status_counts = Counter(r["status"] for r in rows)
    channel_counts = Counter(r["channel"] for r in rows)
    payment_type_counts = Counter(r["paymentType"] for r in rows)
    modality_counts = Counter(r["modality"] for r in rows)
    type_counts = Counter(r["type"] for r in active)
    product_line_counts = Counter(r["productLine"] for r in active)
    user_segment_counts = Counter(r["userSegment"] for r in active)

    missing_channel = sum(1 for r in rows if r["channel"] == "Sin canal")
    paid_without_voucher = sum(1 for r in paid if not r["hasVoucher"])
    missing_id = sum(1 for r in rows if not r["hasId"])
    missing_contact = sum(1 for r in rows if not r["hasContact"])
    future_rows = sum(1 for r in rows if r["date"] and datetime.fromisoformat(r["date"]).date() > date_cls.today())
    repeat_users = sum(1 for _, count in user_counts.items() if count > 1)
    unique_users = len(user_counts)
    active_users = len({r["userId"] for r in active})
    paid_users = len({r["userId"] for r in paid})
    active_courses = len({r["course"] for r in active})

    latest_date = max((r["date"] for r in rows if r["date"]), default="")

    data = {
        "meta": {
            "sourceSheet": SHEET,
            "generatedAt": datetime.now().isoformat(timespec="seconds"),
            "latestDate": latest_date,
            "rowCount": len(rows),
            "privacy": "Sanitized aggregate dashboard. No names, emails, phones, comments, or voucher links.",
        },
        "summary": {
            "paidTransactions": len(paid),
            "pendingTransactions": len(pending),
            "cancelledTransactions": len(cancelled),
            "activeTransactions": len(active),
            "activeEnrollments": len(active),
            "uniqueUsers": unique_users,
            "activeUsers": active_users,
            "paidUsers": paid_users,
            "repeatUsers": repeat_users,
            "activeCourses": active_courses,
            "revenuePaid": revenue_paid,
            "revenuePipeline": revenue_pipeline,
            "pendingAmount": pending_amount,
            "avgTicket": {
                "PEN": round(revenue_paid.get("PEN", 0) / max(1, sum(1 for r in paid if r["currency"] == "PEN")), 2),
                "USD": round(revenue_paid.get("USD", 0) / max(1, sum(1 for r in paid if r["currency"] == "USD")), 2),
            },
            "risk": {
                "missingChannel": missing_channel,
                "paidWithoutVoucher": paid_without_voucher,
                "missingId": missing_id,
                "missingContact": missing_contact,
                "contactlessRows": contactless_rows,
                "futureDatedRows": future_rows,
            },
        },
        "monthly": sorted(finalize_users(monthly.values()), key=lambda x: x["month"]),
        "programs": sorted(
            finalize_users(programs.values()),
            key=lambda x: (x["paid"].get("PEN", 0) + x["paid"].get("USD", 0), x["activeEnrollments"]),
            reverse=True,
        ),
        "channels": sorted(channels.values(), key=lambda x: x["paidCount"], reverse=True),
        "paymentTypes": sorted(payment_types.values(), key=lambda x: x["paidCount"], reverse=True),
        "types": sorted(finalize_users(types.values()), key=lambda x: x["activeEnrollments"], reverse=True),
        "productLines": sorted(product_lines.values(), key=lambda x: x["activeEnrollments"], reverse=True),
        "distributions": {
            "status": top_items(status_counts),
            "channels": top_items(channel_counts, 14),
            "paymentTypes": top_items(payment_type_counts, 10),
            "modalities": top_items(modality_counts, 8),
            "types": top_items(type_counts, 8),
            "productLines": top_items(product_line_counts, 8),
            "userSegments": top_items(user_segment_counts, 4),
        },
        "records": rows,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT} with {len(rows)} sanitized rows")


if __name__ == "__main__":
    main()
