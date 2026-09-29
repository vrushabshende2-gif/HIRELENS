import math
from rest_framework import serializers
from .models import Position, Question, Drive


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError("Expected an object.")
        extra = set(data) - set(self.fields)
        if extra:
            raise serializers.ValidationError({k: "Unknown field." for k in extra})
        return super().to_internal_value(data)


class FiniteFloatField(serializers.FloatField):
    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        if not math.isfinite(value):
            self.fail("invalid")
        return value


class AuthInput(StrictSerializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(max_length=256, trim_whitespace=False)
    totp_code = serializers.RegexField(r"^\d{6}$", required=False, allow_blank=True)


class SignupInput(AuthInput):
    name = serializers.CharField(max_length=120)
    role = serializers.ChoiceField(choices=["candidate", "recruiter"])
    organization = serializers.CharField(max_length=120, required=False, default="My workspace")


class EmailInput(StrictSerializer):
    email = serializers.EmailField(max_length=254)


class TokenInput(StrictSerializer):
    token = serializers.CharField(max_length=200)


class ResetInput(TokenInput):
    password = serializers.CharField(max_length=256, trim_whitespace=False)


class ProfileInput(StrictSerializer):
    name = serializers.CharField(max_length=120, required=False)
    phone = serializers.CharField(max_length=30, required=False, allow_blank=True)
    timezone = serializers.CharField(max_length=80, required=False)
    resume_url = serializers.URLField(max_length=500, required=False, allow_blank=True)
    portfolio_url = serializers.URLField(max_length=500, required=False, allow_blank=True)
    github_url = serializers.URLField(max_length=500, required=False, allow_blank=True)
    linkedin_url = serializers.URLField(max_length=500, required=False, allow_blank=True)
    accommodation_preferences = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    notification_preferences = serializers.DictField(required=False)
    interview_consent = serializers.BooleanField(required=False)
    transcript_retention_days = serializers.IntegerField(min_value=30, max_value=730, required=False)
    mfa_enabled = serializers.BooleanField(required=False, read_only=True)


class PasswordChangeInput(StrictSerializer):
    current_password = serializers.CharField(max_length=256, trim_whitespace=False)
    password = serializers.CharField(max_length=256, trim_whitespace=False)


class MfaCodeInput(StrictSerializer):
    code = serializers.RegexField(r"^\d{6}$")


class MembershipInput(StrictSerializer):
    email = serializers.EmailField(max_length=254)
    role = serializers.ChoiceField(choices=["admin", "recruiter", "reviewer", "auditor"])


class PrivacyRequestInput(StrictSerializer):
    kind = serializers.ChoiceField(choices=["export", "deletion"])


class SkillInput(StrictSerializer):
    topic = serializers.CharField(max_length=60)
    weight = FiniteFloatField(min_value=0.1, max_value=10, default=1)
    minimum = serializers.IntegerField(min_value=0, max_value=100, default=40)


class PositionInput(serializers.ModelSerializer):
    skills = SkillInput(many=True, min_length=1, max_length=6)
    difficulty_min = serializers.IntegerField(min_value=-1, max_value=0)
    difficulty_max = serializers.IntegerField(min_value=0, max_value=1)

    class Meta:
        model = Position
        fields = [
            "id",
            "title",
            "description",
            "experience",
            "skills",
            "difficulty_min",
            "difficulty_max",
            "archived",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate_skills(self, value):
        topics = [s["topic"].lower() for s in value]
        if len(topics) != len(set(topics)):
            raise serializers.ValidationError("Each topic must be unique.")
        return value


class ConceptInput(StrictSerializer):
    name = serializers.CharField(max_length=120)
    description = serializers.CharField(max_length=1000)
    weight = FiniteFloatField(min_value=0.1, max_value=10, default=1)
    critical = serializers.BooleanField(default=False)


class CheckInput(StrictSerializer):
    kind = serializers.ChoiceField(
        choices=["function", "loop", "conditional", "return", "exception", "async"]
    )
    description = serializers.CharField(max_length=300)


class QuestionInput(serializers.ModelSerializer):
    difficulty = serializers.IntegerField(min_value=-1, max_value=1)
    concepts = ConceptInput(many=True, min_length=1, max_length=15)
    code_checks = CheckInput(many=True, max_length=10, required=False)
    weight = FiniteFloatField(min_value=0.1, max_value=5)
    expected_seconds = serializers.IntegerField(min_value=30, max_value=900)
    language = serializers.ChoiceField(choices=["javascript", "typescript", "python"])

    class Meta:
        model = Question
        fields = [
            "id",
            "title",
            "topic",
            "difficulty",
            "kind",
            "language",
            "prompt",
            "expected_answer",
            "concepts",
            "reasoning_criteria",
            "code_checks",
            "starter_code",
            "weight",
            "expected_seconds",
            "version",
            "archived",
            "created_at",
            "track",
            "competency",
            "level",
            "style",
            "calibration",
            "role_tags",
            "misconceptions",
            "quality_status",
            "quality_issues",
            "catalog_key",
        ]
        read_only_fields = [
            "id",
            "version",
            "created_at",
            "quality_status",
            "quality_issues",
            "catalog_key",
        ]


class DriveInput(serializers.ModelSerializer):
    position_id = serializers.UUIDField()
    question_count = serializers.IntegerField(min_value=3, max_value=24)
    duration_minutes = serializers.IntegerField(min_value=5, max_value=90)
    instructions = serializers.CharField(max_length=6000)

    class Meta:
        model = Drive
        fields = [
            "id",
            "name",
            "position_id",
            "opens_at",
            "expires_at",
            "question_count",
            "duration_minutes",
            "instructions",
            "demo_data",
        ]
        read_only_fields = ["id"]

    def validate(self, data):
        from django.utils import timezone

        start = data.get("opens_at", self.instance.opens_at if self.instance else timezone.now())
        end = data.get("expires_at", self.instance.expires_at if self.instance else None)
        if not end or end <= start or end <= timezone.now():
            raise serializers.ValidationError("Expiry must be after opening and in the future.")
        return data


class InviteInput(StrictSerializer):
    email = serializers.EmailField()
    name = serializers.CharField(max_length=120)
    accommodation_multiplier = FiniteFloatField(min_value=1, max_value=3, default=1)
    send_email = serializers.BooleanField(default=False)


class StartInput(StrictSerializer):
    token = serializers.CharField(max_length=200)
    tab_id = serializers.UUIDField()
    consent = serializers.BooleanField()
    demo_acknowledged = serializers.BooleanField(default=False)


class AnswerInput(StrictSerializer):
    attempt_id = serializers.UUIDField()
    answer = serializers.CharField(max_length=16000, allow_blank=True, trim_whitespace=False)
    tab_id = serializers.UUIDField()
    submission_id = serializers.UUIDField(required=False)


class TabInput(StrictSerializer):
    tab_id = serializers.UUIDField()
    take_over = serializers.BooleanField(default=False)
    focus_lost = serializers.BooleanField(default=False)


class LiveTokenInput(StrictSerializer):
    tab_id = serializers.UUIDField()


class ReviewInput(StrictSerializer):
    decision = serializers.ChoiceField(choices=["hire", "borderline", "no_hire", "needs_review"])
    note = serializers.CharField(max_length=3000)


def validated(cls, request, **kwargs):
    serializer = cls(data=request.data, **kwargs)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data
