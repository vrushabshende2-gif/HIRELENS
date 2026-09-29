"""Governed question catalog generation and tenant-safe seeding helpers."""

from django.db import transaction

from .models import Organization, Question


TRACKS = [
    "React", "Angular", "Vue", "Node.js", "Django", "FastAPI", "Java/Spring", "Go",
    ".NET", "SQL", "PostgreSQL", "MongoDB", "Redis", "Kafka", "Docker", "Kubernetes",
    "Terraform", "AWS", "Azure", "GCP", "Security", "Testing", "System Design",
    "Data Engineering", "Machine Learning", "Mobile", "TypeScript", "GraphQL", "Python",
    "Ruby/Rails", "PHP/Laravel", "Rust", "C/C++", "Swift/iOS", "Android/Kotlin", "CI/CD",
]

COMPETENCIES = [
    "fundamentals", "data modeling", "API design", "state and data flow",
    "async and concurrency", "errors and resilience", "testing strategy",
    "performance", "security", "observability", "deployment", "system design",
]

LEVELS = ["foundation", "junior", "intermediate", "senior", "expert"]
STYLES = ["explain", "implementation"]
LEVEL_DIFFICULTY = {"foundation": -1, "junior": -1, "intermediate": 0, "senior": 1, "expert": 1}
LEVEL_SECONDS = {"foundation": 90, "junior": 120, "intermediate": 150, "senior": 210, "expert": 270}
CATALOG_COUNT = len(TRACKS) * len(COMPETENCIES) * len(LEVELS) * len(STYLES)
_CANONICAL_TOPICS = {track.casefold(): track for track in TRACKS}
_TOPIC_ALIASES = {
    "ai/ml": "Machine Learning",
    "ai ml": "Machine Learning",
    "ai & ml": "Machine Learning",
    "artificial intelligence": "Machine Learning",
    "artificial intelligence / machine learning": "Machine Learning",
    "ml": "Machine Learning",
    "node": "Node.js",
    "nodejs": "Node.js",
    "postgres": "PostgreSQL",
    "postgres sql": "PostgreSQL",
    "dotnet": ".NET",
    "c sharp": ".NET",
    "k8s": "Kubernetes",
    "reactjs": "React",
    "typescript / javascript": "TypeScript",
}


def catalog_key(track, competency, level, style):
    return f"catalog-v1:{track}:{competency}:{level}:{style}"


def canonical_topic(value):
    normalized = " ".join(value.strip().casefold().split())
    return _TOPIC_ALIASES.get(normalized, _CANONICAL_TOPICS.get(normalized, value.strip()))


def make_question(track, competency, level, style):
    difficulty = LEVEL_DIFFICULTY[level]
    code = style == "implementation" and competency in {
        "state and data flow", "async and concurrency", "testing strategy"
    }
    title = f"{track} {level}: {competency}"
    if style == "explain":
        prompt = (
            f"Explain how you would apply {competency} in a production {track} system at {level} level. "
            "Describe the decision, the trade-offs, and one failure mode you would test for."
        )
        expected = (
            f"A strong {track} answer defines {competency}, names a concrete production approach, "
            "explains a trade-off, and connects the choice to testing, security, or operations. "
            "It should distinguish the chosen approach from at least one plausible alternative."
        )
    else:
        prompt = (
            f"You inherit a {track} service with a difficult {competency} incident. Propose a small, "
            f"reviewable solution suitable for a {level} engineer, explain how you would validate it, "
            "and state what you would monitor after release."
        )
        expected = (
            f"The response should turn the {track} scenario into an explicit implementation plan for "
            f"{competency}, including validation and a measurable operational signal. It should call out "
            "failure handling and avoid claiming that a single tool solves every case."
        )
    language = "python" if track in {"Django", "FastAPI", "Python", "Machine Learning", "Data Engineering"} else "typescript"
    return {
        "catalog_key": catalog_key(track, competency, level, style),
        "title": title,
        "track": track,
        "topic": track,
        "competency": competency,
        "level": level,
        "style": style,
        "difficulty": difficulty,
        "kind": "code" if code else "text",
        "language": language,
        "prompt": prompt,
        "expected_answer": expected,
        "concepts": [
            {"name": competency, "description": f"Core {competency} principle in {track}.", "weight": 1.2, "critical": True},
            {"name": "trade-offs", "description": "Names a meaningful engineering trade-off.", "weight": 1, "critical": False},
            {"name": "validation", "description": "Explains how the answer would be tested or observed.", "weight": 1, "critical": True},
        ],
        "reasoning_criteria": "Correctly frames the problem, makes a defensible choice, and supports it with validation and failure handling.",
        "code_checks": [{"kind": "return", "description": "Produces a clear, testable result."}] if code else [],
        "starter_code": "" if not code else "# Implement the smallest production-ready solution\n",
        "weight": 1,
        "expected_seconds": LEVEL_SECONDS[level],
        "version": 1,
        "archived": False,
        "calibration": {"difficulty_label": level, "seed_version": "catalog-v1", "target_score": 70},
        "role_tags": [track, competency, level],
        "misconceptions": [f"Treating {competency} as a one-tool problem", "Ignoring validation and failure behavior"],
        "quality_status": "active",
        "quality_issues": [],
    }


def quality_issues(question):
    issues = []
    if not question["title"].strip() or not question["prompt"].strip():
        issues.append("missing_prompt")
    if len(question["concepts"]) < 3:
        issues.append("rubric_needs_three_concepts")
    if not question["expected_answer"].strip() or not question["reasoning_criteria"].strip():
        issues.append("incomplete_rubric")
    if question["difficulty"] not in {-1, 0, 1}:
        issues.append("invalid_difficulty")
    return issues


def iter_catalog():
    for track in TRACKS:
        for competency in COMPETENCIES:
            for level in LEVELS:
                for style in STYLES:
                    yield make_question(track, competency, level, style)


def seed_catalog_batch(organization: Organization, limit=600):
    """Create a bounded batch so free web instances never block on all 4,320 rows."""
    with transaction.atomic():
        locked_org = Organization.objects.select_for_update().get(pk=organization.pk)
        existing = set(
            Question.objects.filter(
                organization=locked_org,
                catalog_key__startswith="catalog-v1:",
            ).values_list("catalog_key", flat=True)
        )
        created = 0
        for payload in iter_catalog():
            if payload["catalog_key"] in existing:
                continue
            issues = quality_issues(payload)
            if issues:
                raise ValueError(f"Catalog quality checks failed: {', '.join(issues)}")
            Question.objects.create(organization=locked_org, **payload)
            existing.add(payload["catalog_key"])
            created += 1
            if created >= limit:
                break
        total = Question.objects.filter(
            organization=locked_org,
            catalog_key__startswith="catalog-v1:",
            archived=False,
            quality_status="active",
        ).count()
    return {"created": created, "total": total, "expected": CATALOG_COUNT, "complete": total >= CATALOG_COUNT}
