import csv
import io
import math
from html import escape
from django.http import HttpResponse
from evaluation.adaptive import sigmoid, mean, uncertainty
from .models import Report


def build_report(interview):
    attempts = list(
        interview.attempts.filter(evaluation__isnull=False).select_related("evaluation")
    )
    skills = interview.invitation.drive.policy["skills"]
    topics = []
    for skill in skills:
        matching = [a for a in attempts if a.question["topic"] == skill["topic"]]
        total = sum(a.question["weight"] for a in matching)
        raw = (
            sum(a.evaluation.technical * a.question["weight"] for a in matching) / total
            if total
            else 0
        )
        adjusted = (
            100 * sigmoid(mean(interview.ability.get("technical:" + skill["topic"])))
            if matching
            else 0
        )
        topics.append(
            {
                "topic": skill["topic"],
                "score": round(adjusted, 1),
                "raw_score": round(raw, 1),
                "count": len(matching),
                "weight": skill["weight"],
                "minimum": skill.get("minimum", 40),
                "uncertainty": round(
                    uncertainty(interview.ability.get("technical:" + skill["topic"])), 2
                ),
            }
        )
    total_weight = sum(s["weight"] for s in skills)
    technical = sum(t["score"] * t["weight"] for t in topics) / total_weight
    qweight = sum(a.question["weight"] for a in attempts) or 1

    def average(field):
        return sum(getattr(a.evaluation, field) * a.question["weight"] for a in attempts) / qweight

    variance = sum(t["weight"] * (t["score"] - technical) ** 2 for t in topics) / total_weight
    consistency = max(0, 100 - math.sqrt(variance) * 4)
    parts = {
        "technical": technical,
        "reasoning": average("reasoning"),
        "communication": average("communication"),
        "efficiency": average("efficiency"),
        "consistency": consistency,
    }
    overall = (
        0.6 * technical
        + 0.2 * parts["reasoning"]
        + 0.1 * parts["communication"]
        + 0.05 * parts["efficiency"]
        + 0.05 * consistency
    )
    missing = any(t["count"] == 0 for t in topics)
    flags = any("review_recommended" in a.evaluation.flags for a in attempts)
    confidence = "low" if missing or len(attempts) < 6 or flags else "medium"
    recommendation = "hire" if overall >= 75 else "borderline" if overall >= 55 else "no_hire"
    if recommendation == "hire" and any(t["score"] < t["minimum"] for t in topics):
        recommendation = "borderline"
    if missing or flags or len(attempts) < len(skills) * 2:
        recommendation = "needs_review"
    report, _ = Report.objects.get_or_create(
        interview=interview,
        defaults={
            "overall": round(overall, 1),
            "recommendation": recommendation,
            "confidence": confidence,
            "components": {k: round(v, 1) for k, v in parts.items()},
            "topics": topics,
        },
    )
    return report, attempts


def report_data(report):
    interview = report.interview
    invite = interview.invitation
    attempts = list(interview.attempts.select_related("evaluation").order_by("ordinal"))
    transcript = []
    for a in attempts:
        ev = getattr(a, "evaluation", None)
        transcript.append(
            {
                "id": str(a.pk),
                "ordinal": a.ordinal,
                "question": a.question,
                "answer": a.answer,
                "elapsed_seconds": a.elapsed_seconds,
                "issued_at": a.issued_at,
                "submitted_at": a.submitted_at,
                "selection_reason": a.selection_reason,
                "clarification_count": a.clarification_count,
                "evaluation": {
                    k: getattr(ev, k)
                    for k in (
                        "score",
                        "technical",
                        "reasoning",
                        "communication",
                        "efficiency",
                        "semantic",
                        "coverage",
                        "code_structure",
                        "evidence",
                        "feedback",
                        "confidence",
                        "flags",
                        "model",
                        "rubric_version",
                    )
                }
                if ev
                else None,
            }
        )
    return {
        "id": str(report.pk),
        "interview_id": str(interview.pk),
        "drive_id": str(invite.drive_id),
        "candidate": {"name": invite.name, "email": invite.email},
        "position": invite.drive.policy.get("title", invite.drive.position.title),
        "drive": invite.drive.name,
        "overall": report.overall,
        "recommendation": report.recommendation,
        "confidence": report.confidence,
        "components": report.components,
        "topics": report.topics,
        "strengths": report.strengths,
        "weaknesses": report.weaknesses,
        "summary": report.summary,
        "narrative_status": report.narrative_status,
        "source": report.source,
        "answering_seconds": interview.answering_seconds,
        "completed_at": interview.completed_at,
        "stop_reason": interview.stop_reason,
        "integrity_events": interview.integrity_events,
        "transcript": transcript,
        "reviews": [
            {
                "decision": r.decision,
                "note": r.note,
                "reviewer": r.reviewer.first_name,
                "created_at": r.created_at,
            }
            for r in report.reviews.select_related("reviewer").order_by("-created_at")
        ],
    }


def csv_response(rows, filename):
    output = io.StringIO(newline="")
    writer = csv.writer(output)

    def safe(value):
        s = str(value) if value is not None else ""
        return "'" + s if s.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) else s

    for row in rows:
        writer.writerow([safe(v) for v in row])
    response = HttpResponse("\ufeff" + output.getvalue(), content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def pdf_response(data):
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (
        SimpleDocTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
        PageBreak,
    )
    from reportlab.lib.pagesizes import A4

    buffer = io.BytesIO()
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="Brand",
            fontSize=24,
            leading=28,
            textColor=colors.HexColor("#125d52"),
            spaceAfter=12,
        )
    )
    styles["BodyText"].fontSize = 9
    styles["BodyText"].leading = 14
    styles["Heading1"].keepWithNext = True
    styles["Heading2"].keepWithNext = True
    styles.add(
        ParagraphStyle(
            name="CodeAnswer",
            fontName="Courier",
            fontSize=8,
            leading=12,
            spaceBefore=6,
            spaceAfter=8,
        )
    )

    def p(text, style="BodyText"):
        content = escape(str(text)).replace("\n", "<br/>")
        if style == "CodeAnswer":
            content = content.replace(" ", "&nbsp;")
        return Paragraph(content, styles[style])

    story = [
        p("HireLens / Candidate scorecard", "Brand"),
        p(data["candidate"]["name"], "Heading1"),
        p(data["position"]),
        p(
            f"{data['overall']}/100 | {data['recommendation'].replace('_', ' ').title()} | Evidence confidence: {data['confidence']}"
        ),
        Spacer(1, 16),
    ]
    if data["source"] == "seed":
        story.append(p("ILLUSTRATIVE DEMO REPORT - fictional candidate and sample scores."))
    story.extend(
        [
            p("Assessment summary", "Heading2"),
            p(data["summary"] or "Evidence summary is awaiting processing."),
            p("Topic performance", "Heading2"),
        ]
    )
    table = Table(
        [[p("Topic"), p("Adjusted"), p("Raw accuracy"), p("Questions")]]
        + [
            [p(t["topic"]), p(t["score"]), p(t["raw_score"]), p(t["count"])] for t in data["topics"]
        ],
        colWidths=[220, 75, 95, 65],
        repeatRows=1,
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e6f0e9")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor("#dddddd")),
            ]
        )
    )
    story.append(table)
    story.extend(
        [
            p("Assessment details", "Heading2"),
            p(
                f"Answering time: {round(data['answering_seconds'] / 60, 1)} minutes | Questions: {len(data['transcript'])} | Stopped: {data['stop_reason'].replace('_', ' ')}"
            ),
            p(
                " | ".join(
                    f"{key.title()}: {value}/100" for key, value in data["components"].items()
                )
            ),
        ]
    )
    ordinals = {a["id"]: a["ordinal"] for a in data["transcript"]}
    for title, key in [("Strengths", "strengths"), ("Development areas", "weaknesses")]:
        story.append(p(title, "Heading2"))
        for item in data[key]:
            story.extend(
                [
                    p(item["observation"]),
                    p(
                        f"Evidence, question {ordinals.get(item['attempt_id'], '?')}: "
                        + item["quote"]
                    ),
                    Spacer(1, 8),
                ]
            )
    story.extend(
        [
            p("Scoring method", "Heading2"),
            p(
                "Technical 60%, reasoning 20%, communication 10%, time efficiency 5%, topic consistency 5%. Ability adjustment is an uncalibrated heuristic. Code is assessed statically, not execution-verified. The recommendation supports a human hiring decision."
            ),
        ]
    )
    for review in data.get("reviews", []):
        story.extend(
            [
                p(
                    "Recruiter review: " + review["decision"].replace("_", " "),
                    "Heading2",
                ),
                p(review["note"]),
                p("Reviewed by " + review["reviewer"]),
            ]
        )
    story.extend([PageBreak(), p("Full interview transcript", "Heading1")])
    for a in data["transcript"]:
        story.extend(
            [
                p(f"{a['ordinal']}. {a['question']['title']}", "Heading2"),
                p(a["question"]["prompt"]),
                p(
                    f"Time: {round(a['elapsed_seconds'])} seconds | Score: {a['evaluation']['score'] if a['evaluation'] else 'Pending'}"
                ),
                Spacer(1, 8),
                p(
                    a["answer"] or "(No answer)",
                    "CodeAnswer" if a["question"]["kind"] == "code" else "BodyText",
                ),
                Spacer(1, 8),
            ]
        )
        if a["evaluation"]:
            story.append(p(a["evaluation"]["feedback"]))
            for e in a["evaluation"]["evidence"]:
                story.append(
                    p(
                        f"{e['concept']} ({round(e['coverage'] * 100)}%): {e['explanation']} Evidence: {e['quote'] or 'No supporting passage'}"
                    )
                )

    def footer(canvas, doc):
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#66756c"))
        canvas.drawString(42, 25, "HireLens · Confidential candidate assessment")
        canvas.drawRightString(A4[0] - 42, 25, str(doc.page))

    SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=42,
        leftMargin=42,
        topMargin=40,
        bottomMargin=45,
        title="HireLens candidate scorecard",
    ).build(story, onFirstPage=footer, onLaterPages=footer)
    response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
    response["Content-Disposition"] = 'attachment; filename="hirelens-scorecard.pdf"'
    return response
