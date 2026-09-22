from django.urls import path

from app.views import StatusView, DeviceListView, DeviceStatusView

urlpatterns = [
    path('api/status/', StatusView.as_view(), name='api-status'),
    path('api/devices/', DeviceListView.as_view(), name='device-list'),
    # A thing's status, not the service's. This one must not answer the question.
    path('api/devices/<int:pk>/status/', DeviceStatusView.as_view(), name='device-status'),
]
