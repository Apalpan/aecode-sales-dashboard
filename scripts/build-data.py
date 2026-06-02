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
HASH_SALT = "aecode-sales-dashboard-v3-private-salt"
TODAY = date_cls.today()


RISK_CATALOG = [
    {
        "id": "future_date",
        "label": "Fechas futuras",
        "severity": "high",
        "area": "Ventas",
        "action": "Separar preventa de venta realizada o corregir fecha.",
        "weight": 18,
    },
    {
        "id": "missing_id",
        "label": "Sin ID de programa",
        "severity": "high",
        "area": "Productos",
        "action": "Normalizar ID por curso, edicion y cohorte.",
        "weight": 14,
    },
    {
        "id": "missing_channel",
        "label": "Sin medio de pago",
        "severity": "medium",
        "area": "Pagos",
        "action": "Completar canal de pago para conciliacion y lectura de conversion.",
        "weight": 10,
    },
    {
        "id": "missing_contact",
        "label": "Sin contacto minimo",
        "severity": "high",
        "area": "Usuarios",
        "action": "Completar contacto para soporte, certificacion y recompra.",
        "weight": 13,
    },
    {
        "id": "paid_without_voucher",
        "label": "Pagado sin voucher",
        "severity": "medium",
        "area": "Cobranza",
        "action": "Validar pago contra banco antes de cerrar como cobrado.",
        "weight": 15,
    },
    {
        "id": "cancelled_with_amount",
        "label": "Anulado o retirado con monto",
        "severity": "medium",
        "area": "Cobranza",
        "action": "Marcar monto como no cobrable o registrar devolucion si aplica.",
        "weight": 11,
    },
    {
        "id": "unstructured_comment",
        "label": "Comentarios operativos sin estructura",
        "severity": "medium",
        "area": "Operacion",
        "action": "Convertir notas libres en campos: motivo, responsable, siguiente accion.",
        "weight": 8,
    },
    {
        "id": "possible_duplicate",
        "label": "Posibles duplicados",
        "severity": "medium",
        "area": "Datos",
        "action": "Revisar registros repetidos por usuario anonimo, curso, monto y estado.",
        "weight": 12,
    },
    {
        "id": "missing_date",
        "label": "Sin fecha",
        "severity": "medium",
        "area": "Ventas",
        "action": "Completar fecha para que el historico mensual sea confiable.",
        "weight": 9,
    },
    {
        "id": "missing_program",
        "label": "Sin curso o programa",
        "severity": "high",
        "area": "Productos",
        "action": "Asignar programa para medir traccion y pendientes por producto.",
        "weight": 16,
    },
    {
        "id": "zero_amount",
        "label": "Monto cero",
        "severity": "low",
        "area": "Ventas",
        "action": "Confirmar si es beca, error de digitacion o registro no comercial.",
        "weight": 5,
    },
    {
        "id": "missing_currency",
        "label": "Sin moneda",
        "severity": "medium",
        "area": "Ventas",
        "action": "Completar moneda para evitar lectura incorrecta de ingresos.",
        "weight": 8,
    },
    {
        "id": "pending_no_voucher",
        "label": "Pendiente sin voucher",
        "severity": "medium",
        "area": "Cobranza",
        "action": "Cerrar seguimiento comercial o descartar oportunidad vencida.",
        "weight": 7,
    },
]

RISK_META = {item["id"]: item for item in RISK_CATALOG}


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
    return round(float(match.group(0)), 2) if match else 0.0


def parse_date(value: object):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    parsed = pd.to_datetime(value, dayfirst=True, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.to_pydatetime().date()


def money_key(currency: str) -> str:
    currency_norm = norm(currency)
    if "USD" in currency_norm or "DOLAR" in currency_norm:
        return "USD"
    if "S/" in currency_norm or "PEN" in currency_norm or "SOL" in currency_norm:
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
    if "BIM" in value or "VDC" in value:
        return "BIM / VDC"
    if "IA" in value or "INTELIGENCIA" in value or "AI" in value:
        return "AI Construction"
    if "DYNAMO" in value or "PYTHON" in value or "AUTOMATIZACION" in value or "AUTOMATION" in value:
        return "Automatizacion"
    if "INVESTIGACION" in value or "METODOLOGIA" in value:
        return "Investigacion aplicada"
    return "Otros productos"


def cell(row, columns: dict[str, str], name: str):
    return row.get(columns.get(norm(name), name), "")


def anon_user_id(raw_key: str, fallback: str) -> str:
    digest = hashlib.sha256(f"{HASH_SALT}:{raw_key or fallback}".encode("utf-8")).hexdigest()
    letter_digest = digest.translate(str.maketrans("0123456789abcdef", "abcdefghijklmnop"))
    return f"u_{letter_digest[:12]}"


def add_money(bucket: dict, currency: str, amount: float):
    key = money_key(currency)
    bucket[key] = round(bucket.get(key, 0) + float(amount or 0), 2)


def top_items(counter: Counter, limit: int = 12):
    return [{"name": name or "Sin dato", "value": int(value)} for name, value in counter.most_common(limit)]


def row_has_data(parts: list[object]) -> bool:
    return any(bool(clean(part)) for part in parts)


def sample_rows(rows: list[dict], risk_id: str, limit: int = 6) -> list[int]:
    return [int(row["sourceRow"]) for row in rows if risk_id in row["riskTags"]][:limit]


def paid_value_bucket(rows: list[dict]) -> dict:
    bucket = {}
    for row in rows:
        if row["status"] == "PAGADO":
            add_money(bucket, row["currency"], row["amount"])
    return bucket


def build_quality(rows: list[dict]) -> dict:
    total = max(1, len(rows))
    issues = []
    total_issue_rows = {row["sourceRow"] for row in rows if row["riskTags"]}

    for item in RISK_CATALOG:
        count = sum(1 for row in rows if item["id"] in row["riskTags"])
        impact = round((count / total) * item["weight"] * 5, 2)
        issues.append(
            {
                "id": item["id"],
                "label": item["label"],
                "severity": item["severity"],
                "area": item["area"],
                "count": int(count),
                "impact": impact,
                "sampleRows": sample_rows(rows, item["id"]),
                "action": item["action"],
            }
        )

    weighted_penalty = sum(issue["impact"] for issue in issues)
    score = max(0, min(100, round(100 - weighted_penalty)))
    open_issues = sum(issue["count"] for issue in issues)
    top_issue = max(issues, key=lambda issue: (issue["impact"], issue["count"]), default=None)

    return {
        "score": score,
        "totalRows": len(rows),
        "rowsWithIssues": len(total_issue_rows),
        "openIssues": open_issues,
        "topIssueId": top_issue["id"] if top_issue else "",
        "topIssueLabel": top_issue["label"] if top_issue else "Sin riesgo critico",
        "issues": sorted(issues, key=lambda issue: (issue["impact"], issue["count"]), reverse=True),
    }


def build_action_queue(rows: list[dict], quality: dict) -> list[dict]:
    pending = [row for row in rows if row["status"] == "PENDIENTE"]
    pending_by_course: dict[str, dict] = defaultdict(lambda: {"course": "", "pending": {}, "count": 0})
    for row in pending:
        item = pending_by_course[row["course"]]
        item["course"] = row["course"]
        item["count"] += 1
        add_money(item["pending"], row["currency"], row["amount"])

    def score_money(bucket: dict) -> float:
        return float(bucket.get("PEN", 0)) + float(bucket.get("USD", 0)) * 3.7

    top_pending = max(pending_by_course.values(), key=lambda item: score_money(item["pending"]), default=None)
    issues = {issue["id"]: issue for issue in quality["issues"]}
    queue = []

    def push(issue_id: str, title: str, action: str, owner: str, priority: str):
        issue = issues.get(issue_id)
        if issue and issue["count"]:
            queue.append(
                {
                    "priority": priority,
                    "title": title,
                    "area": issue["area"],
                    "owner": owner,
                    "impact": issue["count"],
                    "action": action,
                    "riskId": issue_id,
                }
            )

    push(
        "missing_id",
        "Normalizar IDs de cursos y cohortes",
        "Crear catalogo de ID por programa, edicion y linea; aplicar a registros historicos.",
        "Ops + Academico",
        "Alta",
    )
    if top_pending:
        queue.append(
            {
                "priority": "Alta",
                "title": "Cerrar cobranza pendiente prioritaria",
                "area": "Cobranza",
                "owner": "Comercial",
                "impact": int(top_pending["count"]),
                "action": f"Atacar pendientes de {top_pending['course']} antes de abrir nuevas acciones masivas.",
                "riskId": "pending_no_voucher",
            }
        )
    push(
        "missing_channel",
        "Completar medios de pago faltantes",
        "Rellenar canal para leer conversion por BCP, Yape/Plin, PayPal, web u otros.",
        "Comercial",
        "Media",
    )
    push(
        "paid_without_voucher",
        "Auditar pagos marcados como cobrados",
        "Cruzar registros pagados sin voucher contra banco y dejar evidencia operativa.",
        "Cobranza",
        "Alta",
    )
    push(
        "future_date",
        "Separar preventas y fechas futuras",
        "Mover preventas a estado futuro o corregir fecha de venta real.",
        "Ops",
        "Alta",
    )
    push(
        "unstructured_comment",
        "Estructurar comentarios operativos",
        "Convertir notas libres en campos accionables: motivo, responsable y fecha de seguimiento.",
        "Ops",
        "Media",
    )

    priority_rank = {"Alta": 0, "Media": 1, "Baja": 2}
    return sorted(queue, key=lambda item: (priority_rank.get(item["priority"], 9), -item["impact"]))[:8]


def main():
    if not SOURCE.exists():
        raise FileNotFoundError(f"Missing source workbook: {SOURCE}")

    df = pd.read_excel(SOURCE, sheet_name=SHEET, dtype=object)
    df.columns = [clean(c) for c in df.columns]
    columns = {norm(c): c for c in df.columns}

    rows = []
    user_counts = Counter()
    user_courses: dict[str, set[str]] = defaultdict(set)

    raw_rows = []
    for idx, row in df.iterrows():
        source_row = int(idx) + 2
        program_raw = clean(cell(row, columns, "PROGRAMA"))
        offer_type_raw = clean(cell(row, columns, "TIPO"))
        module_raw = clean(cell(row, columns, "MODULO"))
        modality_raw = clean(cell(row, columns, "MODALIDAD"))
        amount = parse_amount(cell(row, columns, "INVERSION"))
        currency = money_key(clean(cell(row, columns, "MONEDA")))
        payment_type_raw = clean(cell(row, columns, "TIPO DE PAGO"))
        channel_raw = clean(cell(row, columns, "CANAL DE PAGO"))
        status = payment_state(clean(cell(row, columns, "PENDIENTE DE PAGO")))
        sale_date = parse_date(cell(row, columns, "FECHA"))
        voucher_raw = clean(cell(row, columns, "PAGOS EN SU TOTALIDAD")) or clean(cell(row, columns, "pago completo"))
        id_raw = clean(cell(row, columns, "ID"))
        bank_status = clean(cell(row, columns, "registro excel, registro formulario")) or clean(cell(row, columns, "status banca"))
        pending_note = clean(cell(row, columns, "PENDIENTES"))
        comment_note = clean(cell(row, columns, "Comentario"))
        client_raw = clean(cell(row, columns, "CLIENTE"))
        email = norm(cell(row, columns, "CORREO (ID)"))
        phone = re.sub(r"\D+", "", clean(cell(row, columns, "CONTACTO")))

        has_operational_data = row_has_data(
            [
                sale_date,
                client_raw,
                program_raw,
                offer_type_raw,
                module_raw,
                modality_raw,
                amount,
                currency if currency != "SIN_MONEDA" else "",
                payment_type_raw,
                channel_raw,
                status if status != "SIN_ESTADO" else "",
                email,
                phone,
                pending_note,
                comment_note,
                voucher_raw,
                id_raw,
            ]
        )
        if not has_operational_data:
            continue

        contact_key = email or phone
        user_id = anon_user_id(contact_key, f"row-{source_row}")
        program = program_raw or "Sin programa"
        offer_type = offer_type_raw or "Sin tipo"
        course = program
        line = product_line(program, offer_type)
        month = sale_date.strftime("%Y-%m") if sale_date else "Sin fecha"
        risk_tags = []

        if not id_raw:
            risk_tags.append("missing_id")
        if not channel_raw:
            risk_tags.append("missing_channel")
        if not contact_key:
            risk_tags.append("missing_contact")
        if status == "PAGADO" and not voucher_raw:
            risk_tags.append("paid_without_voucher")
        if status == "PENDIENTE" and not voucher_raw:
            risk_tags.append("pending_no_voucher")
        if status in {"ANULADO", "RETIRADO"} and amount > 0:
            risk_tags.append("cancelled_with_amount")
        if pending_note or comment_note:
            risk_tags.append("unstructured_comment")
        if not sale_date:
            risk_tags.append("missing_date")
        elif sale_date > TODAY:
            risk_tags.append("future_date")
        if not program_raw:
            risk_tags.append("missing_program")
        if amount <= 0:
            risk_tags.append("zero_amount")
        if currency == "SIN_MONEDA":
            risk_tags.append("missing_currency")

        duplicate_key = "|".join(
            [
                contact_key or f"row-{source_row}",
                norm(program_raw),
                f"{amount:.2f}",
                currency,
                status,
            ]
        )
        raw_rows.append(
            {
                "sourceRow": source_row,
                "date": sale_date.isoformat() if sale_date else "",
                "month": month,
                "program": program,
                "course": course,
                "productLine": line,
                "type": offer_type,
                "module": module_raw or "Sin modulo",
                "modality": modality_raw or "Sin modalidad",
                "amount": amount,
                "currency": currency,
                "paymentType": payment_type_raw or "Sin condicion",
                "channel": channel_raw or "Sin canal",
                "status": status,
                "bankStatus": bank_status or "Sin validar",
                "hasVoucher": bool(voucher_raw),
                "hasId": bool(id_raw),
                "hasContact": bool(contact_key),
                "userId": user_id,
                "riskTags": sorted(set(risk_tags)),
                "_duplicateKey": duplicate_key,
            }
        )

    duplicate_counts = Counter(row["_duplicateKey"] for row in raw_rows)
    for row in raw_rows:
        if duplicate_counts[row["_duplicateKey"]] > 1:
            row["riskTags"] = sorted(set([*row["riskTags"], "possible_duplicate"]))
        row.pop("_duplicateKey", None)
        user_counts[row["userId"]] += 1
        if row["course"] != "Sin programa":
            user_courses[row["userId"]].add(row["course"])
        rows.append(row)

    for row in rows:
        row["userSegment"] = "Recurrente" if user_counts[row["userId"]] > 1 else "Nuevo"

    valid_status = {"PAGADO", "PENDIENTE"}
    active = [row for row in rows if row["status"] in valid_status]
    paid = [row for row in rows if row["status"] == "PAGADO"]
    pending = [row for row in rows if row["status"] == "PENDIENTE"]
    cancelled = [row for row in rows if row["status"] in {"ANULADO", "RETIRADO"}]

    revenue_paid = {}
    revenue_pipeline = {}
    pending_amount = {}
    for row in rows:
        if row["status"] == "PAGADO":
            add_money(revenue_paid, row["currency"], row["amount"])
        if row["status"] in valid_status:
            add_money(revenue_pipeline, row["currency"], row["amount"])
        if row["status"] == "PENDIENTE":
            add_money(pending_amount, row["currency"], row["amount"])

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
            "riskRows": 0,
        }
    )
    channels = defaultdict(lambda: {"channel": "", "count": 0, "paidCount": 0, "pendingCount": 0, "paid": {}})
    payment_types = defaultdict(
        lambda: {"paymentType": "", "count": 0, "paidCount": 0, "pendingCount": 0, "paid": {}}
    )
    types = defaultdict(lambda: {"type": "", "activeEnrollments": 0, "uniqueUsers": set(), "paidCount": 0, "paid": {}})
    product_lines = defaultdict(lambda: {"productLine": "", "activeEnrollments": 0, "paidCount": 0, "paid": {}})

    for row in rows:
        if row["status"] in valid_status and row["month"] != "Sin fecha":
            item = monthly[row["month"]]
            item["month"] = row["month"]
            item["activeEnrollments"] += 1
            item["uniqueUsers"].add(row["userId"])
            if row["status"] == "PAGADO":
                item["paidCount"] += 1
                add_money(item["paid"], row["currency"], row["amount"])
            elif row["status"] == "PENDIENTE":
                item["pendingCount"] += 1
                add_money(item["pending"], row["currency"], row["amount"])

        program_item = programs[row["program"]]
        program_item["program"] = row["program"]
        program_item["course"] = row["course"]
        program_item["productLine"] = row["productLine"]
        if row["riskTags"]:
            program_item["riskRows"] += 1
        if row["status"] in valid_status:
            program_item["activeEnrollments"] += 1
            program_item["uniqueUsers"].add(row["userId"])
        if row["status"] == "PAGADO":
            program_item["paidCount"] += 1
            add_money(program_item["paid"], row["currency"], row["amount"])
        elif row["status"] == "PENDIENTE":
            program_item["pendingCount"] += 1
            add_money(program_item["pending"], row["currency"], row["amount"])
        elif row["status"] in {"ANULADO", "RETIRADO"}:
            program_item["cancelledCount"] += 1

        channel_item = channels[row["channel"]]
        channel_item["channel"] = row["channel"]
        channel_item["count"] += 1
        if row["status"] == "PAGADO":
            channel_item["paidCount"] += 1
            add_money(channel_item["paid"], row["currency"], row["amount"])
        elif row["status"] == "PENDIENTE":
            channel_item["pendingCount"] += 1

        payment_item = payment_types[row["paymentType"]]
        payment_item["paymentType"] = row["paymentType"]
        payment_item["count"] += 1
        if row["status"] == "PAGADO":
            payment_item["paidCount"] += 1
            add_money(payment_item["paid"], row["currency"], row["amount"])
        elif row["status"] == "PENDIENTE":
            payment_item["pendingCount"] += 1

        if row["status"] in valid_status:
            type_item = types[row["type"]]
            type_item["type"] = row["type"]
            type_item["activeEnrollments"] += 1
            type_item["uniqueUsers"].add(row["userId"])
            if row["status"] == "PAGADO":
                type_item["paidCount"] += 1
                add_money(type_item["paid"], row["currency"], row["amount"])

            line_item = product_lines[row["productLine"]]
            line_item["productLine"] = row["productLine"]
            line_item["activeEnrollments"] += 1
            if row["status"] == "PAGADO":
                line_item["paidCount"] += 1
                add_money(line_item["paid"], row["currency"], row["amount"])

    def finalize_users(items, user_key="uniqueUsers"):
        finalized = []
        for item in items:
            next_item = dict(item)
            if user_key in next_item:
                next_item[user_key] = len(next_item[user_key])
            finalized.append(next_item)
        return finalized

    status_counts = Counter(row["status"] for row in rows)
    channel_counts = Counter(row["channel"] for row in rows)
    payment_type_counts = Counter(row["paymentType"] for row in rows)
    modality_counts = Counter(row["modality"] for row in rows)
    type_counts = Counter(row["type"] for row in active)
    product_line_counts = Counter(row["productLine"] for row in active)
    user_segment_counts = Counter(row["userSegment"] for row in active)

    unique_users = len(user_counts)
    active_users = len({row["userId"] for row in active})
    paid_users = len({row["userId"] for row in paid})
    repeat_users = sum(1 for _, count in user_counts.items() if count > 1)
    active_courses = len({row["course"] for row in active if row["course"] != "Sin programa"})
    multi_course_users = sum(1 for courses in user_courses.values() if len(courses) > 1)
    avg_courses_per_user = round(sum(len(courses) for courses in user_courses.values()) / max(1, unique_users), 2)
    latest_date = max((row["date"] for row in rows if row["date"]), default="")
    collection_rate = round((len(paid) / max(1, len(active))) * 100, 1)

    quality = build_quality(rows)
    action_queue = build_action_queue(rows, quality)

    data = {
        "meta": {
            "sourceSheet": SHEET,
            "generatedAt": datetime.now().isoformat(timespec="seconds"),
            "snapshotDate": TODAY.isoformat(),
            "latestDate": latest_date,
            "rowCount": len(rows),
            "privacy": "Public safe: no names, contacts, notes, or links.",
        },
        "riskCatalog": [{key: value for key, value in item.items() if key != "weight"} for item in RISK_CATALOG],
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
            "multiCourseUsers": multi_course_users,
            "avgCoursesPerUser": avg_courses_per_user,
            "activeCourses": active_courses,
            "collectionRate": collection_rate,
            "revenuePaid": revenue_paid,
            "revenuePipeline": revenue_pipeline,
            "pendingAmount": pending_amount,
            "avgTicket": {
                "PEN": round(revenue_paid.get("PEN", 0) / max(1, sum(1 for row in paid if row["currency"] == "PEN")), 2),
                "USD": round(revenue_paid.get("USD", 0) / max(1, sum(1 for row in paid if row["currency"] == "USD")), 2),
            },
            "risk": {
                "missingChannel": sum(1 for row in rows if "missing_channel" in row["riskTags"]),
                "paidWithoutVoucher": sum(1 for row in rows if "paid_without_voucher" in row["riskTags"]),
                "missingId": sum(1 for row in rows if "missing_id" in row["riskTags"]),
                "missingContact": sum(1 for row in rows if "missing_contact" in row["riskTags"]),
                "futureDatedRows": sum(1 for row in rows if "future_date" in row["riskTags"]),
                "possibleDuplicates": sum(1 for row in rows if "possible_duplicate" in row["riskTags"]),
                "unstructuredComments": sum(1 for row in rows if "unstructured_comment" in row["riskTags"]),
            },
        },
        "dataQuality": {
            **quality,
            "actionQueue": action_queue,
        },
        "monthly": sorted(finalize_users(monthly.values()), key=lambda item: item["month"]),
        "programs": sorted(
            finalize_users(programs.values()),
            key=lambda item: (item["paid"].get("PEN", 0) + item["paid"].get("USD", 0) * 3.7, item["activeEnrollments"]),
            reverse=True,
        ),
        "channels": sorted(channels.values(), key=lambda item: item["paidCount"], reverse=True),
        "paymentTypes": sorted(payment_types.values(), key=lambda item: item["paidCount"], reverse=True),
        "types": sorted(finalize_users(types.values()), key=lambda item: item["activeEnrollments"], reverse=True),
        "productLines": sorted(product_lines.values(), key=lambda item: item["activeEnrollments"], reverse=True),
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
