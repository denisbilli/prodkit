<?php

final class Version20251031142000
{
    public function up(): void
    {
        $this->addSql('ALTER TABLE customers ADD buyer_reference VARCHAR(50) DEFAULT NULL');
    }
}
