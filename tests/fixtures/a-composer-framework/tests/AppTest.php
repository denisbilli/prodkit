<?php

use PHPUnit\Framework\TestCase;
use Tiny\Router\Factory\AppFactory;

final class AppTest extends TestCase
{
    public function testCreate(): void
    {
        $app = AppFactory::create();
        $this->assertNotNull($app);
    }
}
