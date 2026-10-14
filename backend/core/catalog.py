"""Governed, versioned question catalog and tenant-safe seeding helpers.

Catalog v2 is deliberately generated from explicit skill tracks and competency
rubrics so new workspaces have consistent coverage without a runtime LLM call.
"""

from django.db import transaction

from .models import Organization, Question


# 66 independently selectable skill tracks, including the HTML/CSS skills that
# used to be silently absent from the library. Each track has 12 competencies,
# five calibrated levels, and an explanation plus an implementation prompt.
TRACKS = [
    "HTML", "CSS", "JavaScript", "React", "Angular", "Vue", "Svelte", "Next.js",
    "TypeScript", "Tailwind CSS", "Web Accessibility", "Web Performance",
    "Node.js", "Express.js", "NestJS", "Python", "Django", "Flask", "FastAPI",
    "Java/Spring", "Spring Boot", "Go", ".NET", "C#", "Ruby/Rails", "PHP/Laravel",
    "Rust", "C/C++", "Swift/iOS", "Android/Kotlin", "Kotlin", "Flutter", "React Native",
    "SQL", "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "Elasticsearch",
    "DynamoDB", "Firebase", "Supabase", "Kafka", "GraphQL", "gRPC", "Docker",
    "Kubernetes", "Terraform", "AWS", "Azure", "GCP", "CI/CD", "Git", "Linux",
    "Security", "OAuth/OIDC", "Testing", "Playwright", "Jest/Vitest", "System Design",
    "Data Engineering", "Machine Learning", "AI Engineering", "LLM Applications",
    "Prompt Engineering",
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
CATALOG_VERSION = "v2"
CATALOG_PREFIX = f"catalog-{CATALOG_VERSION}:"
CATALOG_COUNT = len(TRACKS) * len(COMPETENCIES) * len(LEVELS) * len(STYLES)

_CANONICAL_TOPICS = {track.casefold(): track for track in TRACKS}
_TOPIC_ALIASES = {
    "ai/ml": "Machine Learning", "ai ml": "Machine Learning", "ai & ml": "Machine Learning",
    "artificial intelligence": "Machine Learning", "ml": "Machine Learning",
    "node": "Node.js", "nodejs": "Node.js", "postgres": "PostgreSQL",
    "postgres sql": "PostgreSQL", "dotnet": ".NET", "c sharp": "C#",
    "k8s": "Kubernetes", "reactjs": "React", "nextjs": "Next.js",
    "tailwind": "Tailwind CSS", "html5": "HTML", "css3": "CSS",
    "js": "JavaScript", "javascript es6": "JavaScript", "golang": "Go",
    "c++": "C/C++", "cpp": "C/C++", "c#/.net": "C#", "asp.net": ".NET",
    "spring": "Java/Spring", "springboot": "Spring Boot", "ruby on rails": "Ruby/Rails",
    "laravel": "PHP/Laravel", "mlops": "Machine Learning", "llm": "LLM Applications",
    "large language models": "LLM Applications", "web a11y": "Web Accessibility",
    "accessibility": "Web Accessibility", "web performance": "Web Performance",
    "playwright testing": "Playwright", "jest": "Jest/Vitest", "vitest": "Jest/Vitest",
    "oidc": "OAuth/OIDC", "oauth": "OAuth/OIDC", "gcp": "GCP",
}
SUGGESTION_GROUPS = {
    "front": ["HTML", "CSS", "JavaScript", "TypeScript", "React", "Angular", "Vue", "Svelte", "Next.js", "Tailwind CSS", "Web Accessibility", "Web Performance"],
    "frontend": ["HTML", "CSS", "JavaScript", "TypeScript", "React", "Angular", "Vue", "Svelte", "Next.js", "Tailwind CSS", "Web Accessibility", "Web Performance"],
    "web": ["HTML", "CSS", "JavaScript", "TypeScript", "React", "Angular", "Vue", "Svelte", "Next.js", "Tailwind CSS", "Web Accessibility", "Web Performance"],
    "backend": ["Node.js", "Express.js", "NestJS", "Python", "Django", "Flask", "FastAPI", "Java/Spring", "Spring Boot", "Go", ".NET", "C#", "Ruby/Rails", "PHP/Laravel", "Rust"],
    "cloud": ["AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "CI/CD", "Linux"],
    "database": ["SQL", "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "Elasticsearch", "DynamoDB", "Firebase", "Supabase"],
    "data": ["SQL", "PostgreSQL", "Kafka", "Data Engineering", "Machine Learning", "AI Engineering", "LLM Applications"],
    "mobile": ["Swift/iOS", "Android/Kotlin", "Kotlin", "Flutter", "React Native"],
    "ai": ["Machine Learning", "AI Engineering", "LLM Applications", "Prompt Engineering"],
    "security": ["Security", "OAuth/OIDC"],
    "qa": ["Testing", "Playwright", "Jest/Vitest"],
    "test": ["Testing", "Playwright", "Jest/Vitest"],
}

TRACK_COMPETENCIES = {
    "HTML": ["semantic structure", "forms and validation", "accessibility", "responsive media", "progressive enhancement", "SEO metadata", "security boundaries", "browser compatibility", "rendering performance", "testing", "content architecture", "deployment"],
    "CSS": ["cascade and specificity", "layout", "responsive design", "design tokens", "accessibility", "browser compatibility", "rendering performance", "stylesheet architecture", "visual testing", "animation and motion", "theming", "maintainability"],
    "JavaScript": ["language fundamentals", "DOM and events", "asynchronous JavaScript", "state and data flow", "error handling", "testing strategy", "performance", "security", "browser APIs", "module design", "accessibility", "maintainability"],
}

TRACK_CONTEXT = {
    "HTML": ("accessible product page", "html", "semantic landmarks, labels, form semantics, and progressive enhancement"),
    "CSS": ("responsive product layout", "css", "cascade, layout constraints, responsive behavior, and maintainable tokens"),
    "JavaScript": ("browser interaction", "javascript", "DOM behavior, event lifecycle, state, and resilient browser APIs"),
    "React": ("React interface", "typescript", "component boundaries, state ownership, rendering, and accessible interaction"),
    "Angular": ("Angular feature", "typescript", "dependency boundaries, templates, RxJS lifecycle, and change detection"),
    "Vue": ("Vue interface", "typescript", "component contracts, reactivity, composables, and lifecycle cleanup"),
    "Svelte": ("Svelte interface", "typescript", "reactivity, component contracts, accessibility, and lifecycle cleanup"),
    "Next.js": ("Next.js route", "typescript", "server/client boundaries, data loading, caching, and navigation"),
    "TypeScript": ("typed application module", "typescript", "inference, safe boundaries, discriminated unions, and maintainable APIs"),
    "Tailwind CSS": ("design-system component", "html", "responsive utilities, semantic markup, variants, and visual consistency"),
    "Web Accessibility": ("keyboard-accessible interaction", "html", "semantic structure, focus order, accessible names, and assistive technology behavior"),
    "Web Performance": ("slow-loading web route", "typescript", "Core Web Vitals, payload costs, rendering work, and measured improvement"),
    "Node.js": ("Node.js service", "typescript", "event-loop behavior, bounded concurrency, input validation, and operational safety"),
    "Express.js": ("Express API route", "javascript", "middleware ordering, validation, error flow, and request lifecycle"),
    "NestJS": ("NestJS application module", "typescript", "providers, guards, pipes, module boundaries, and testability"),
    "Python": ("Python application module", "python", "data structures, clear interfaces, exceptions, and resource handling"),
    "Django": ("Django application feature", "python", "ORM boundaries, validation, transactions, permissions, and query efficiency"),
    "Flask": ("Flask API endpoint", "python", "request validation, app context, error handling, and testable composition"),
    "FastAPI": ("FastAPI endpoint", "python", "typed schemas, async boundaries, dependency injection, and status semantics"),
    "Java/Spring": ("Spring service", "java", "dependency injection, transaction boundaries, typed errors, and service contracts"),
    "Spring Boot": ("Spring Boot API", "java", "configuration, validation, transactions, observability, and production defaults"),
    "Go": ("Go service", "go", "explicit errors, context cancellation, goroutine ownership, and simple interfaces"),
    ".NET": (".NET API service", "csharp", "dependency injection, async flow, validation, and reliable service boundaries"),
    "C#": ("C# application module", "csharp", "type safety, async behavior, resource disposal, and clear contracts"),
    "Ruby/Rails": ("Rails application feature", "ruby", "convention boundaries, Active Record queries, validation, and background work"),
    "PHP/Laravel": ("Laravel application feature", "php", "request validation, Eloquent query shape, authorization, and queue behavior"),
    "Rust": ("Rust service module", "rust", "ownership, error types, lifetimes, and predictable resource use"),
    "C/C++": ("C/C++ program", "cpp", "memory safety, ownership, undefined behavior, and testable interfaces"),
    "Swift/iOS": ("Swift iOS feature", "swift", "value semantics, concurrency, lifecycle, and accessible native interaction"),
    "Android/Kotlin": ("Android feature", "kotlin", "lifecycle-aware state, coroutines, persistence, and accessible native UI"),
    "Kotlin": ("Kotlin service", "kotlin", "null safety, coroutine scope, data modeling, and clear APIs"),
    "Flutter": ("Flutter feature", "dart", "widget boundaries, state ownership, async UI, and accessibility"),
    "React Native": ("React Native screen", "typescript", "native lifecycle, rendering, platform differences, and accessible controls"),
    "SQL": ("relational data query", "sql", "relational semantics, constraints, query plans, and safe parameterization"),
    "PostgreSQL": ("PostgreSQL-backed feature", "sql", "indexes, transactions, isolation, query plans, and operational maintenance"),
    "MySQL": ("MySQL-backed feature", "sql", "indexes, transaction semantics, query plans, and schema evolution"),
    "SQLite": ("SQLite-backed feature", "sql", "transaction scope, locking, indexes, migrations, and embedded deployment"),
    "MongoDB": ("MongoDB-backed feature", "javascript", "document shape, indexes, atomic updates, and bounded aggregation"),
    "Redis": ("Redis-backed feature", "javascript", "key design, TTL, atomicity, eviction, and cache failure behavior"),
    "Elasticsearch": ("search indexing pipeline", "python", "mapping, analyzers, relevance, pagination, and refresh behavior"),
    "DynamoDB": ("DynamoDB access pattern", "python", "partition keys, access patterns, conditional writes, and hot-key control"),
    "Firebase": ("Firebase-backed feature", "typescript", "security rules, offline state, indexes, and client trust boundaries"),
    "Supabase": ("Supabase application feature", "typescript", "row-level security, Postgres access, auth boundaries, and realtime lifecycle"),
    "Kafka": ("Kafka consumer", "java", "partition ordering, idempotency, backpressure, and replay safety"),
    "GraphQL": ("GraphQL API", "typescript", "schema evolution, authorization, resolver cost, and batching"),
    "gRPC": ("gRPC service", "go", "protobuf contracts, deadlines, status codes, and backward compatibility"),
    "Docker": ("container image", "dockerfile", "minimal base images, build caching, user permissions, and reproducibility"),
    "Kubernetes": ("Kubernetes workload", "yaml", "probes, resource requests, rollout safety, and least privilege"),
    "Terraform": ("Terraform module", "hcl", "state safety, reusable inputs, plan review, and drift management"),
    "AWS": ("AWS workload", "typescript", "IAM boundaries, failure domains, cost controls, and managed-service trade-offs"),
    "Azure": ("Azure workload", "typescript", "identity boundaries, resilient services, cost controls, and observability"),
    "GCP": ("GCP workload", "typescript", "service identity, failure domains, cost controls, and managed-service trade-offs"),
    "CI/CD": ("deployment pipeline", "yaml", "reproducible builds, protected secrets, test gates, and rollback"),
    "Git": ("shared Git workflow", "bash", "small commits, safe history repair, conflict resolution, and reviewability"),
    "Linux": ("Linux-hosted service", "bash", "process lifecycle, permissions, resource limits, and useful diagnostics"),
    "Security": ("production application boundary", "typescript", "threat modeling, least privilege, validation, and defense in depth"),
    "OAuth/OIDC": ("OAuth/OIDC login flow", "typescript", "state and nonce, redirect validation, token audience, and PKCE"),
    "Testing": ("application test suite", "typescript", "test isolation, meaningful assertions, failure reproduction, and maintainability"),
    "Playwright": ("Playwright browser test", "typescript", "stable locators, isolation, user-visible assertions, and trace diagnostics"),
    "Jest/Vitest": ("unit test suite", "typescript", "deterministic tests, mocks at boundaries, coverage of behavior, and speed"),
    "System Design": ("high-traffic product service", "typescript", "capacity assumptions, data flow, failure modes, and measured trade-offs"),
    "Data Engineering": ("data ingestion pipeline", "python", "schema contracts, idempotency, late data, and data quality"),
    "Machine Learning": ("ML inference service", "python", "data leakage, evaluation, drift, latency, and reproducibility"),
    "AI Engineering": ("AI-enabled product feature", "python", "retrieval boundaries, evaluation, latency, privacy, and graceful fallback"),
    "LLM Applications": ("LLM-backed application", "python", "structured output, grounding, injection defense, and deterministic fallbacks"),
    "Prompt Engineering": ("versioned prompt workflow", "python", "task framing, constraints, examples, evaluation sets, and regression control"),
}

COMPETENCY_TASKS = {
    "fundamentals": "implement a small, well-named example that demonstrates the core behavior",
    "data modeling": "design the data shape and implement validation for malformed and boundary inputs",
    "API design": "implement the smallest useful interface and handle invalid requests explicitly",
    "state and data flow": "implement the state transition and prevent stale or inconsistent updates",
    "async and concurrency": "implement the asynchronous flow with cancellation, ordering, and bounded work in mind",
    "errors and resilience": "implement error handling with a safe fallback and a clear retry boundary",
    "testing strategy": "write a focused test for the important success path and one meaningful failure case",
    "performance": "implement a measured improvement while preserving correctness and a bounded resource cost",
    "security": "implement input and permission checks at the trust boundary; reject unsafe cases by default",
    "observability": "implement a useful signal or structured event without exposing secrets or personal data",
    "deployment": "write the small configuration or automation change needed for a safe, repeatable release",
    "system design": "write a small interface or pseudocode slice that makes the key scaling and failure boundary explicit",
    "semantic structure": "write semantic HTML for a page section and include accessible names and a meaningful landmark structure",
    "forms and validation": "build a semantic form with native constraints and explain how invalid and server-side input are handled",
    "accessibility": "implement a keyboard- and screen-reader-friendly interaction without relying on color or pointer input alone",
    "responsive media": "write markup that serves appropriately sized responsive media with a sensible fallback",
    "progressive enhancement": "build the essential experience so it remains usable before optional scripts or styles load",
    "SEO metadata": "write the relevant document metadata and semantic content structure for a shareable page",
    "security boundaries": "implement safe content handling and explain which values must never be inserted as trusted markup",
    "browser compatibility": "write a progressive implementation with a feature fallback for older or constrained browsers",
    "rendering performance": "make a small markup or style change that reduces rendering work while preserving usability",
    "content architecture": "structure a content section with clear hierarchy that remains understandable when styling is unavailable",
    "cascade and specificity": "write a small set of maintainable rules that avoid accidental specificity escalation",
    "layout": "implement a resilient layout that handles variable content and narrow viewports",
    "responsive design": "write responsive styles for narrow and wide viewports without fixed-width overflow",
    "design tokens": "define and apply a small token set that keeps spacing and color changes consistent",
    "stylesheet architecture": "organize component styles so variants remain understandable and isolated",
    "visual testing": "describe and implement a focused visual check for the key responsive state",
    "animation and motion": "implement a purposeful transition that respects reduced-motion preferences",
    "theming": "implement a theme variant using shared tokens without duplicating the component stylesheet",
    "language fundamentals": "write a small JavaScript function with clear inputs, outputs, and boundary behavior",
    "DOM and events": "implement an event-driven interaction and remove listeners when the owning view is disposed",
    "asynchronous JavaScript": "implement an asynchronous browser flow that handles cancellation, ordering, and rejected promises",
    "browser APIs": "use a browser API behind feature detection and provide a graceful fallback",
    "module design": "extract a small module with an explicit contract and no accidental global state",
}

def competencies_for_track(track):
    return TRACK_COMPETENCIES.get(track, COMPETENCIES)


def catalog_key(track, competency, level, style):
    return f"{CATALOG_PREFIX}{track}:{competency}:{level}:{style}"


def canonical_topic(value):
    normalized = " ".join(value.strip().casefold().split())
    return _TOPIC_ALIASES.get(normalized, _CANONICAL_TOPICS.get(normalized, value.strip()))


def make_question(track, competency, level, style):
    difficulty = LEVEL_DIFFICULTY[level]
    artifact, language, principles = TRACK_CONTEXT[track]
    code = style == "implementation"
    title = f"{track} {level}: {competency}"
    if style == "explain":
        prompt = (
            f"A team is building a {artifact} and encounters a realistic {competency} challenge. "
            f"At {level} level, explain how you would address it using {track}. Include the key decision, "
            "a trade-off, how you would validate the result, and one failure mode you would watch for."
        )
    else:
        task = COMPETENCY_TASKS.get(
            competency,
            f"implement a focused {competency} solution with clear behavior and a testable edge case",
        )
        prompt = (
            f"For a {artifact}, {task}. Use {language} where code is appropriate. "
            f"Briefly explain how your solution applies {principles}, how you would test it, and one "
            f"trade-off appropriate for a {level} engineer."
        )
    expected = (
        f"A strong {track} response to {competency} should demonstrate {principles}. It should give a "
        f"concrete approach for a {artifact}, explain why it fits the stated constraints, and identify "
        "an acceptable alternative or trade-off. Award credit for equivalent technically sound approaches."
    )
    starter_code = _starter(language, track, competency) if code else ""
    checks = _checks(language, competency) if code else []
    concepts = [
        {"name": competency, "description": f"Applies {principles} to a concrete {track} problem.", "weight": 1.4, "critical": True},
        {"name": "validation", "description": "Uses a test, measurement, or review method that can verify the result.", "weight": 1.1, "critical": True},
        {"name": "trade-offs", "description": "Recognizes constraints, alternatives, or a meaningful failure case.", "weight": 1, "critical": False},
        {"name": "production judgment", "description": "Keeps the solution maintainable, safe, and appropriate to the stated scope.", "weight": 0.8, "critical": False},
    ]
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
        "language": language if code else "typescript",
        "prompt": prompt,
        "expected_answer": expected,
        "concepts": concepts,
        "reasoning_criteria": f"Assess technical correctness, explicit assumptions, {principles}, validation, and explanation of trade-offs. Accept equivalent approaches.",
        "code_checks": checks,
        "starter_code": starter_code,
        "weight": 1,
        "expected_seconds": LEVEL_SECONDS[level],
        "version": 2,
        "archived": False,
        "calibration": {"difficulty_label": level, "seed_version": CATALOG_VERSION, "target_score": 70},
        "role_tags": [track, competency, level],
        "misconceptions": [f"Ignoring {principles}", "Choosing a tool before stating constraints", "Providing an answer without a way to validate it"],
        "quality_status": "active",
        "quality_issues": [],
    }


def _starter(language, track, competency):
    starters = {
        "javascript": "export function solve(input) {\n  // TODO: implement and explain edge cases\n}\n",
        "typescript": "export function solve(input: unknown): unknown {\n  // TODO: define safe inputs, behavior, and edge cases\n}\n",
        "python": "def solve(value):\n    # TODO: implement and explain edge cases\n    raise NotImplementedError\n",
        "html": "<main>\n  <!-- TODO: build semantic, accessible markup -->\n</main>\n",
        "css": ".component {\n  /* TODO: implement responsive styles */\n}\n",
        "sql": "-- TODO: write a safe, readable query\nSELECT 1;\n",
        "java": "class Solution {\n  // TODO: implement the requested behavior\n}\n",
        "go": "package main\n\n// TODO: implement the requested behavior\n",
        "csharp": "public static class Solution\n{\n    // TODO: implement the requested behavior\n}\n",
        "rust": "fn solve(input: &str) -> Result<String, String> {\n    // TODO: implement the requested behavior\n    todo!()\n}\n",
        "swift": "func solve(_ input: String) -> String {\n    // TODO: implement the requested behavior\n    return \"\"\n}\n",
        "kotlin": "fun solve(input: String): String {\n    // TODO: implement the requested behavior\n    return \"\"\n}\n",
        "dart": "String solve(String input) {\n  // TODO: implement the requested behavior\n  return '';\n}\n",
        "ruby": "def solve(input)\n  # TODO: implement the requested behavior\nend\n",
        "php": "<?php\nfunction solve($input) {\n    // TODO: implement the requested behavior\n}\n",
        "cpp": "#include <string>\n\nstd::string solve(const std::string& input) {\n    // TODO: implement the requested behavior\n    return {};\n}\n",
        "dockerfile": "# TODO: create a small, reproducible, non-root image\n",
        "yaml": "# TODO: define a safe, reviewable configuration\n",
        "hcl": "# TODO: declare typed inputs and least-privilege resources\n",
        "bash": "#!/usr/bin/env bash\nset -euo pipefail\n# TODO: implement safely\n",
    }
    return starters.get(language, f"// {track} · {competency}\n// TODO: implement a testable solution\n")


def _checks(language, competency):
    if language in {"html", "css", "sql", "dockerfile", "yaml", "hcl", "bash"}:
        return []
    kinds = ["function", "return"]
    if competency in {"async and concurrency", "errors and resilience"}:
        kinds.append("exception" if competency == "errors and resilience" else "async")
    elif competency in {"testing strategy", "performance", "data modeling"}:
        kinds.append("conditional")
    return [{"kind": kind, "description": f"Uses a {kind} construct where it supports the requested behavior."} for kind in kinds]


def quality_issues(question):
    issues = []
    if not question["title"].strip() or len(question["prompt"].strip()) < 80:
        issues.append("missing_or_vague_prompt")
    if len(question["concepts"]) < 3:
        issues.append("rubric_needs_three_concepts")
    if not question["expected_answer"].strip() or not question["reasoning_criteria"].strip():
        issues.append("incomplete_rubric")
    if question["difficulty"] not in {-1, 0, 1}:
        issues.append("invalid_difficulty")
    if question["style"] == "implementation" and question["kind"] != "code":
        issues.append("implementation_must_be_code")
    if question["track"] not in TRACK_CONTEXT:
        issues.append("missing_track_context")
    return issues


def iter_catalog():
    for track in TRACKS:
        for competency in competencies_for_track(track):
            for level in LEVELS:
                for style in STYLES:
                    yield make_question(track, competency, level, style)


def seed_catalog_batch(organization: Organization, limit=300):
    """Create a bounded idempotent batch so free web instances stay responsive."""
    limit = max(1, min(int(limit), 300))
    with transaction.atomic():
        locked_org = Organization.objects.select_for_update().get(pk=organization.pk)
        existing = set(
            Question.objects.filter(organization=locked_org, catalog_key__startswith=CATALOG_PREFIX)
            .values_list("catalog_key", flat=True)
        )
        pending = []
        for payload in iter_catalog():
            if payload["catalog_key"] in existing:
                continue
            issues = quality_issues(payload)
            if issues:
                raise ValueError(f"Catalog quality checks failed: {', '.join(issues)}")
            pending.append(Question(organization=locked_org, **payload))
            existing.add(payload["catalog_key"])
            if len(pending) >= limit:
                break
        if pending:
            Question.objects.bulk_create(pending, batch_size=100)
        total = Question.objects.filter(
            organization=locked_org, catalog_key__startswith=CATALOG_PREFIX,
            archived=False, quality_status="active",
        ).count()
        # Once the replacement is complete, retire generated v1 questions. Frozen
        # published drives retain their immutable snapshots.
        if total >= CATALOG_COUNT:
            Question.objects.filter(
                organization=locked_org, catalog_key__startswith="catalog-v1:", archived=False
            ).update(archived=True)
    return {"created": len(pending), "total": total, "expected": CATALOG_COUNT, "complete": total >= CATALOG_COUNT}
