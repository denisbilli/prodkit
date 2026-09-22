import logging

from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


class StatusView(APIView):
    def get(self, request):
        logger.info("status requested")
        return Response({"django-version": "5.0.8", "installed-apps": [], "plugins": {}})


class DeviceListView(APIView):
    def get(self, request):
        return Response([])


class DeviceStatusView(APIView):
    def get(self, request, pk):
        return Response({"status": "active"})
