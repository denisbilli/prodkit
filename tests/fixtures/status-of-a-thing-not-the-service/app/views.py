import logging

from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


class OrderListView(APIView):
    def get(self, request):
        return Response({"status": "ok", "results": []})


class OrderStatusView(APIView):
    def get(self, request, pk):
        logger.info("order status requested")
        return Response({"status": "shipped"})
