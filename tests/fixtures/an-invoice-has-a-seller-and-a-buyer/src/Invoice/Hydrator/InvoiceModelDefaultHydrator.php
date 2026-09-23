<?php

namespace App\Invoice\Hydrator;

final class InvoiceModelDefaultHydrator
{
    public function hydrate(InvoiceModel $model): array
    {
        $seller = $model->getTemplate()->getCustomer();
        $buyer = $model->getCustomer();

        return ['seller.country' => $seller?->getCountry(), 'buyer.name' => $buyer->getName()];
    }
}
