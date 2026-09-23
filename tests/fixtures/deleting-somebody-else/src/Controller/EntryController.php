<?php

namespace App\Controller;

use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\Routing\Attribute\Route;

class EntryController extends AbstractController
{
    #[Route(path: '/entries/{id}/delete', methods: ['POST'])]
    public function deleteEntry(Entry $entry, EntityManagerInterface $em)
    {
        $user = $this->getUser();
        if ($entry->getUser() !== $user) {
            throw $this->createAccessDeniedException();
        }
        $em->remove($entry);
        $em->flush();

        return $this->redirectToRoute('homepage');
    }

    #[Route(path: '/admin/users/{id}/delete', methods: ['POST'])]
    public function deleteUser(User $other, EntityManagerInterface $em)
    {
        $user = $this->getUser();
        $this->denyAccessUnlessGranted('ROLE_ADMIN', $user);
        $em->remove($other);
        $em->flush();

        return $this->redirectToRoute('admin_users');
    }
}
