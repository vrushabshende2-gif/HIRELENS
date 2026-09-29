from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from backend.core.models import Question, User


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


def catalog_key(track, competency, level, style):
    return "catalog-v1:{}:{}:{}:{}".format(track, competency, level, style)


def make_question(track, competency, level, style):
    difficulty = LEVEL_DIFFICULTY[level]
    code = style == "implementation" and competency in {"state and data flow", "async and concurrency", "testing strategy"}
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


class Command(BaseCommand):
    help = "Create the governed 4,320-question HireLens catalog for a recruiter workspace."

    def add_arguments(self, parser):
        parser.add_argument("--email", default="recruiter@example.com")
        parser.add_argument("--organization", default="")
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        user = User.objects.filter(email=options["email"], role="recruiter").first()
        if not user:
            raise CommandError(f"Recruiter {options['email']} was not found.")
        organization = user.organization
        if options["organization"] and organization.name != options["organization"]:
            raise CommandError("The recruiter does not own the requested organization.")
        expected = len(TRACKS) * len(COMPETENCIES) * len(LEVELS) * len(STYLES)
        if options["dry_run"]:
            self.stdout.write(f"Would validate and seed {expected} governed questions.")
            return
        created = 0
        seen_prompts = set()
        with transaction.atomic():
            for track in TRACKS:
                for competency in COMPETENCIES:
                    for level in LEVELS:
                        for style in STYLES:
                            key = catalog_key(track, competency, level, style)
                            if Question.objects.filter(catalog_key=key).exists():
                                continue
                            payload = make_question(track, competency, level, style)
                            normalized = " ".join(payload["prompt"].lower().split())
                            if normalized in seen_prompts:
                                raise CommandError(f"Duplicate catalog prompt: {key}")
                            seen_prompts.add(normalized)
                            issues = quality_issues(payload)
                            if issues:
                                raise CommandError(f"Quality checks failed for {key}: {', '.join(issues)}")
                            Question.objects.create(organization=organization, **payload)
                            created += 1
        total = Question.objects.filter(organization=organization, catalog_key__startswith="catalog-v1:").count()
        self.stdout.write(self.style.SUCCESS(f"Catalog ready: {total}/{expected} active questions ({created} new)."))
