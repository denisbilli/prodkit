from django.http import JsonResponse


def inventory(request):
    return JsonResponse({"items": []})
