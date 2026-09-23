<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class Order
{
    #[ORM\ManyToOne(targetEntity: Customer::class)]
    private Customer $buyer;

    public function getBuyer(): Customer
    {
        return $this->buyer;
    }
}
