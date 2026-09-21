<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;

class TimesheetController extends AbstractController
{
    public function index(): JsonResponse
    {
        return $this->json($this->repository->findForUser($this->getUser()));
    }
}
