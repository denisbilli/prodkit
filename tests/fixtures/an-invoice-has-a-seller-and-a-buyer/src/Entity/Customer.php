<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class Customer
{
    #[ORM\Column(name: 'buyer_reference', nullable: true)]
    private ?string $buyerReference = null;

    #[ORM\Column(name: 'organization_id')]
    private int $organizationId;

    public function getBuyerReference(): ?string
    {
        return $this->buyerReference;
    }
}
