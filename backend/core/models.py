import uuid
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.db.models.functions import Lower
from django.utils import timezone


class Record(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        abstract = True


class User(AbstractUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    role = models.CharField(
        max_length=20,
        choices=[("candidate", "Candidate"), ("recruiter", "Recruiter")],
        default="candidate",
    )
    verified = models.BooleanField(default=False)
    phone = models.CharField(max_length=30, blank=True, default="")
    timezone = models.CharField(max_length=80, blank=True, default="UTC")
    resume_url = models.URLField(max_length=500, blank=True, default="")
    portfolio_url = models.URLField(max_length=500, blank=True, default="")
    github_url = models.URLField(max_length=500, blank=True, default="")
    linkedin_url = models.URLField(max_length=500, blank=True, default="")
    accommodation_preferences = models.TextField(max_length=2000, blank=True, default="")
    notification_preferences = models.JSONField(default=dict)
    interview_consent = models.BooleanField(default=False)
    transcript_retention_days = models.PositiveIntegerField(default=180)
    mfa_secret = models.CharField(max_length=64, blank=True, default="")
    mfa_enabled = models.BooleanField(default=False)
    mfa_recovery_codes = models.JSONField(default=list)

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower("email"), name="unique_email_case_insensitive")
        ]


class Organization(Record):
    name = models.CharField(max_length=120)
    owner = models.OneToOneField(User, on_delete=models.CASCADE, related_name="organization")


class OrganizationMembership(Record):
    ROLE_CHOICES = [("admin", "Admin"), ("recruiter", "Recruiter"), ("reviewer", "Reviewer"), ("auditor", "Read-only auditor")]
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="workspace_memberships")
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default="recruiter")

    class Meta:
        constraints = [models.UniqueConstraint(fields=["organization", "user"], name="unique_workspace_membership")]


class PrivacyRequest(Record):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="privacy_requests")
    kind = models.CharField(max_length=20, choices=[("export", "Export"), ("deletion", "Deletion")])
    status = models.CharField(max_length=20, default="requested")
    completed_at = models.DateTimeField(null=True, blank=True)


class Position(Record):
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="positions"
    )
    title = models.CharField(max_length=160)
    description = models.TextField(blank=True, max_length=4000)
    experience = models.CharField(max_length=50, default="Mid-level")
    skills = models.JSONField(default=list)
    difficulty_min = models.IntegerField(default=-1)
    difficulty_max = models.IntegerField(default=1)
    archived = models.BooleanField(default=False)


class Question(Record):
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="questions"
    )
    title = models.CharField(max_length=180)
    topic = models.CharField(max_length=60)
    difficulty = models.IntegerField(default=0)
    kind = models.CharField(max_length=10, choices=[("text", "Text"), ("code", "Code")])
    language = models.CharField(max_length=20, default="javascript")
    prompt = models.TextField(max_length=6000)
    expected_answer = models.TextField(max_length=6000)
    concepts = models.JSONField(default=list)
    reasoning_criteria = models.TextField(max_length=2000, blank=True)
    code_checks = models.JSONField(default=list)
    starter_code = models.TextField(blank=True, max_length=4000)
    weight = models.FloatField(default=1)
    expected_seconds = models.PositiveIntegerField(default=150)
    version = models.PositiveIntegerField(default=1)
    archived = models.BooleanField(default=False)
    track = models.CharField(max_length=80, blank=True, default="")
    competency = models.CharField(max_length=100, blank=True, default="")
    level = models.CharField(max_length=20, blank=True, default="intermediate")
    style = models.CharField(max_length=20, blank=True, default="explain")
    calibration = models.JSONField(default=dict)
    role_tags = models.JSONField(default=list)
    misconceptions = models.JSONField(default=list)
    quality_status = models.CharField(max_length=20, default="active")
    quality_issues = models.JSONField(default=list)
    catalog_key = models.CharField(max_length=180, blank=True, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "catalog_key"],
                name="unique_organization_catalog_key",
            )
        ]


class Drive(Record):
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="drives")
    position = models.ForeignKey(Position, on_delete=models.PROTECT, related_name="drives")
    name = models.CharField(max_length=180)
    status = models.CharField(max_length=15, default="draft")
    opens_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    question_count = models.PositiveIntegerField(default=12)
    duration_minutes = models.PositiveIntegerField(default=35)
    question_pool = models.JSONField(default=list)
    policy = models.JSONField(default=dict)
    instructions = models.TextField(
        default="Answer independently, without external tools or assistance. Explain your reasoning. Your work is saved as you go."
    )
    demo_data = models.BooleanField(default=True)


class Invitation(Record):
    drive = models.ForeignKey(Drive, on_delete=models.CASCADE, related_name="invitations")
    email = models.EmailField()
    name = models.CharField(max_length=120)
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    redeemed_at = models.DateTimeField(null=True, blank=True)
    accommodation_multiplier = models.FloatField(default=1)

    class Meta:
        constraints = [models.UniqueConstraint("drive", Lower("email"), name="unique_drive_email")]


class Interview(Record):
    invitation = models.OneToOneField(
        Invitation, on_delete=models.CASCADE, related_name="interview"
    )
    candidate = models.ForeignKey(User, on_delete=models.CASCADE, related_name="interviews")
    status = models.CharField(max_length=20, default="in_progress", db_index=True)
    completed_at = models.DateTimeField(null=True)
    answering_seconds = models.FloatField(default=0)
    ability = models.JSONField(default=dict)
    active_tab = models.UUIDField(null=True)
    tab_seen_at = models.DateTimeField(null=True)
    stop_reason = models.CharField(max_length=40, blank=True)
    integrity_events = models.PositiveIntegerField(default=0)


class Attempt(Record):
    interview = models.ForeignKey(Interview, on_delete=models.CASCADE, related_name="attempts")
    ordinal = models.PositiveIntegerField()
    question = models.JSONField()
    issued_at = models.DateTimeField(default=timezone.now)
    submitted_at = models.DateTimeField(null=True, db_index=True)
    draft = models.TextField(blank=True)
    answer = models.TextField(blank=True)
    elapsed_seconds = models.FloatField(default=0)
    submission_id = models.UUIDField(null=True, unique=True)
    selection_reason = models.JSONField(default=dict)
    clarification_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["ordinal"]
        constraints = [
            models.UniqueConstraint(fields=["interview", "ordinal"], name="unique_attempt_order")
        ]


class Evaluation(Record):
    attempt = models.OneToOneField(Attempt, on_delete=models.CASCADE, related_name="evaluation")
    score = models.FloatField()
    technical = models.FloatField()
    reasoning = models.FloatField()
    communication = models.FloatField()
    efficiency = models.FloatField()
    semantic = models.FloatField()
    coverage = models.FloatField()
    code_structure = models.FloatField(null=True)
    evidence = models.JSONField(default=list)
    feedback = models.TextField()
    confidence = models.CharField(max_length=20, default="medium")
    flags = models.JSONField(default=list)
    model = models.CharField(max_length=100)
    rubric_version = models.CharField(max_length=40, default="2026-09-v1")


class Report(Record):
    interview = models.OneToOneField(Interview, on_delete=models.CASCADE, related_name="report")
    overall = models.FloatField()
    recommendation = models.CharField(max_length=20)
    confidence = models.CharField(max_length=20)
    components = models.JSONField()
    topics = models.JSONField()
    strengths = models.JSONField(default=list)
    weaknesses = models.JSONField(default=list)
    summary = models.TextField(blank=True)
    narrative_status = models.CharField(max_length=20, default="pending")
    source = models.CharField(max_length=20, default="gemini")


class ReviewDecision(Record):
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name="reviews")
    reviewer = models.ForeignKey(User, on_delete=models.PROTECT)
    decision = models.CharField(max_length=20)
    note = models.TextField(max_length=3000)


class Job(Record):
    kind = models.CharField(max_length=20)
    target_id = models.UUIDField()
    payload = models.JSONField(default=dict)
    state = models.CharField(max_length=15, default="pending", db_index=True)
    attempts = models.PositiveIntegerField(default=0)
    available_at = models.DateTimeField(default=timezone.now)
    lease_until = models.DateTimeField(null=True)
    lease_token = models.UUIDField(null=True)
    error_code = models.CharField(max_length=80, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["kind", "target_id"], name="unique_job_target")
        ]


class AuthToken(Record):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    purpose = models.CharField(max_length=15)
    digest = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True)


class RateBucket(models.Model):
    key = models.CharField(primary_key=True, max_length=100)
    count = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField(db_index=True)


class Embedding(Record):
    digest = models.CharField(max_length=64, unique=True)
    vector = models.JSONField()


class AuditEvent(Record):
    actor_id = models.UUIDField(null=True)
    event = models.CharField(max_length=60)
    object_id = models.CharField(max_length=64, blank=True)
    network_hash = models.CharField(max_length=64, blank=True)


class WorkerStatus(models.Model):
    name = models.CharField(primary_key=True, max_length=40)
    seen_at = models.DateTimeField(default=timezone.now)
