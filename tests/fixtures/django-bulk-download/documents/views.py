from django.http import FileResponse
from rest_framework.views import APIView

from .bulk import build_archive


class BulkDownloadView(APIView):
    def post(self, request, format=None):
        archive = build_archive(
            user=request.user,
            document_ids=request.data["documents"],
            compression="deflated",
        )
        return FileResponse(
            open(archive, "rb"),
            as_attachment=True,
            filename="documents.zip",
        )
