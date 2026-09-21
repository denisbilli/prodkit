from django.http import JsonResponse


def orders(request):
    return JsonResponse({"orders": []})
