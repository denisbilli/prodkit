from django.urls import path

from app.views import OrderListView, OrderStatusView

urlpatterns = [
    path('api/orders/', OrderListView.as_view(), name='order-list'),
    path('api/orders/<int:pk>/status/', OrderStatusView.as_view(), name='order-status'),
]
