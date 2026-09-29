from django.conf import settings
from django.http import FileResponse, JsonResponse
from django.urls import path, re_path
from backend.core import auth, views, interviews


def frontend(request):
    index = settings.BASE_DIR / "frontend" / "dist" / "index.html"
    if not index.exists():
        return JsonResponse(
            {"detail": "Build the frontend with npm run build in frontend/."},
            status=503,
        )
    return FileResponse(index.open("rb"), content_type="text/html")


def favicon(request):
    return FileResponse(
        (settings.BASE_DIR / "frontend" / "dist" / "favicon.svg").open("rb"),
        content_type="image/svg+xml",
    )


urlpatterns = [
    path("api/health/", views.health),
    path("api/auth/session/", auth.session),
    path("api/auth/signup/", auth.signup),
    path("api/auth/login/", auth.signin),
    path("api/auth/logout/", auth.signout),
    path("api/auth/logout-all/", auth.signout_all),
    path("api/auth/profile/", auth.profile),
    path("api/auth/password/", auth.change_password),
    path("api/auth/mfa/setup/", auth.mfa_setup),
    path("api/auth/mfa/enable/", auth.mfa_enable),
    path("api/auth/mfa/disable/", auth.mfa_disable),
    path("api/auth/privacy/", auth.privacy),
    path("api/auth/privacy/export/", auth.privacy_export),
    path("api/auth/verify/", auth.verify),
    path("api/auth/resend/", auth.resend_verification),
    path("api/auth/forgot/", auth.request_reset),
    path("api/auth/reset/", auth.reset),
    path("api/overview/", views.overview),
    path("api/positions/", views.positions),
    path("api/workspace/members/", views.workspace_members),
    path("api/workspace/members/<uuid:pk>/", views.workspace_member_detail),
    path("api/positions/<uuid:pk>/", views.position_detail),
    path("api/questions/", views.questions),
    path("api/questions/<uuid:pk>/", views.question_detail),
    path("api/drives/", views.drives),
    path("api/drives/<uuid:pk>/", views.drive_detail),
    path("api/drives/<uuid:pk>/publish/", views.publish),
    path("api/drives/<uuid:pk>/close/", views.close_drive),
    path("api/drives/<uuid:pk>/invite/", views.invite),
    path("api/candidates/", views.candidates),
    path("api/analytics/", views.analytics),
    path("api/reports/<uuid:pk>/", views.report),
    path("api/reports/<uuid:pk>/review/", views.review),
    path("api/reports/<uuid:pk>/retry/", views.retry_report),
    path("api/reports/<uuid:pk>/export/<str:kind>/", views.export_report),
    path("api/invite/preview/", interviews.preview_invitation),
    path("api/interviews/", interviews.my_interviews),
    path("api/interviews/start/", interviews.start),
    path("api/interviews/<uuid:pk>/", interviews.interview_state),
    path("api/interviews/<uuid:pk>/heartbeat/", interviews.heartbeat),
    path("api/interviews/<uuid:pk>/live-token/", interviews.live_token),
    path("api/interviews/<uuid:pk>/answer/", interviews.answer),
    path("api/interviews/<uuid:pk>/retry/", interviews.retry_evaluation),
    path("favicon.svg", favicon),
    re_path(r"^(?!api/|assets/).*$", frontend),
]
