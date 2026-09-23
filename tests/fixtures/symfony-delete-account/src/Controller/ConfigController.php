<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

class ConfigController extends AbstractController
{
    public function __construct(private readonly UserManager $userManager)
    {
    }

    #[Route(path: '/account/close', name: 'close_account', methods: ['POST'])]
    public function closeAccountAction(Request $request)
    {
        $user = $this->getUser();

        $request->getSession()->invalidate();
        $this->userManager->deleteUser($user);

        return $this->redirectToRoute('app_login');
    }
}
