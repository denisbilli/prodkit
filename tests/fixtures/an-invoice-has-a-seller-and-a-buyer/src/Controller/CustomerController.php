<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\Routing\Attribute\Route;

class CustomerController extends AbstractController
{
    #[Route('/customers/{id}/buyer', name: 'customer_buyer')]
    public function buyer(int $id)
    {
        return $this->json(['buyer' => $id]);
    }
}
