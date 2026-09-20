from django.http import JsonResponse


def documents(request):
    return JsonResponse({"documents": []})
