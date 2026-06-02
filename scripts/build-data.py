from __future__ import annotations

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
    date = pd.to_datetime(value, dayfirst=True, errors="coerce")
    if pd.isna(date):
        return None
    return date.to_pydatetime().date()


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


def add_money(bucket: dict, currency: str, amount: float):
    key = money_key(currency)
    bucket[key] = round(bucket.get(key, 0) + amount, 2)


def top_items(counter: Counter, limit: int = 12):
    return [{"name": name or "Sin dato", "value": int(value)} for name, value in counter.most_common(limit)]


def main():
    df = pd.read_excel(SOURCE, sheet_name=SHEET, dtype=object)
    df.columns = [clean(c) for c in df.columns]

    rows = []
    contacts = Counter()
    for _, row in df.iterrows():
        program = clean(row.get("PROGRAMA"))
        amount = parse_amount(row.get("INVERSIÓN"))
        status = payment_state(clean(row.get("PENDIENTE DE PAGO")))
        sale_date = parse_date(row.get("FECHA"))
        has_core_data = bool(program or amount or sale_date)
        if not has_core_data:
            continue

        email = norm(row.get("CORREO\n(ID)"))
        phone = re.sub(r"\D+", "", clean(row.get("CONTACTO")))
        contact_key = email or phone
        if contact_key:
            contacts[contact_key] += 1

        rows.append(
            {
                "date": sale_date.isoformat() if sale_date else "",
                "month": sale_date.strftime("%Y-%m") if sale_date else "Sin fecha",
                "program": program or "Sin programa",
                "type": clean(row.get("TIPO")) or "Sin tipo",
                "module": clean(row.get("MODULO")) or "Sin modulo",
                "modality": clean(row.get("MODALIDAD")) or "Sin modalidad",
                "amount": amount,
                "currency": money_key(clean(row.get("MONEDA"))),
                "paymentType": clean(row.get("TIPO DE PAGO")) or "Sin dato",
                "channel": clean(row.get("CANAL DE PAGO")) or "Sin canal",
                "status": status,
                "bankStatus": clean(row.get("registro excel, registro formulario")) or "Sin validar",
                "hasVoucher": bool(clean(row.get("PAGOS EN SU TOTALIDAD"))),
                "hasId": bool(clean(row.get("ID"))),
            }
        )

    valid_status = {"PAGADO", "PENDIENTE"}
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

    monthly = defaultdict(lambda: {"month": "", "paidCount": 0, "pendingCount": 0, "paid": {}, "pending": {}})
    programs = defaultdict(lambda: {"program": "", "paidCount": 0, "pendingCount": 0, "cancelledCount": 0, "paid": {}, "pending": {}})
    channels = defaultdict(lambda: {"channel": "", "count": 0, "paidCount": 0, "pendingCount": 0, "paid": {}})
    types = defaultdict(lambda: {"type": "", "paidCount": 0, "paid": {}})

    for r in rows:
        if r["status"] in valid_status and r["month"] != "Sin fecha":
            m = monthly[r["month"]]
            m["month"] = r["month"]
            if r["status"] == "PAGADO":
                m["paidCount"] += 1
                add_money(m["paid"], r["currency"], r["amount"])
            elif r["status"] == "PENDIENTE":
                m["pendingCount"] += 1
                add_money(m["pending"], r["currency"], r["amount"])

        p = programs[r["program"]]
        p["program"] = r["program"]
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

        if r["status"] == "PAGADO":
            t = types[r["type"]]
            t["type"] = r["type"]
            t["paidCount"] += 1
            add_money(t["paid"], r["currency"], r["amount"])

    status_counts = Counter(r["status"] for r in rows)
    channel_counts = Counter(r["channel"] for r in rows)
    payment_type_counts = Counter(r["paymentType"] for r in rows)
    modality_counts = Counter(r["modality"] for r in rows)

    missing_channel = sum(1 for r in rows if r["channel"] == "Sin canal")
    paid_without_voucher = sum(1 for r in paid if not r["hasVoucher"])
    missing_id = sum(1 for r in rows if not r["hasId"])
    future_rows = sum(1 for r in rows if r["date"] and datetime.fromisoformat(r["date"]).date() > date_cls.today())
    repeat_contacts = sum(1 for _, count in contacts.items() if count > 1)

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
            "activeTransactions": len(paid) + len(pending),
            "revenuePaid": revenue_paid,
            "revenuePipeline": revenue_pipeline,
            "pendingAmount": pending_amount,
            "avgTicket": {
                "PEN": round(revenue_paid.get("PEN", 0) / max(1, sum(1 for r in paid if r["currency"] == "PEN")), 2),
                "USD": round(revenue_paid.get("USD", 0) / max(1, sum(1 for r in paid if r["currency"] == "USD")), 2),
            },
            "repeatContacts": repeat_contacts,
            "risk": {
                "missingChannel": missing_channel,
                "paidWithoutVoucher": paid_without_voucher,
                "missingId": missing_id,
                "futureDatedRows": future_rows,
            },
        },
        "monthly": sorted(monthly.values(), key=lambda x: x["month"]),
        "programs": sorted(programs.values(), key=lambda x: (x["paid"].get("PEN", 0) + x["paid"].get("USD", 0), x["paidCount"]), reverse=True),
        "channels": sorted(channels.values(), key=lambda x: x["paidCount"], reverse=True),
        "types": sorted(types.values(), key=lambda x: x["paidCount"], reverse=True),
        "distributions": {
            "status": top_items(status_counts),
            "channels": top_items(channel_counts, 14),
            "paymentTypes": top_items(payment_type_counts, 10),
            "modalities": top_items(modality_counts, 8),
        },
        "records": rows,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT} with {len(rows)} sanitized rows")


if __name__ == "__main__":
    main()
