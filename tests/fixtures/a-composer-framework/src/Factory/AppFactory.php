<?php

namespace Tiny\Router\Factory;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Tiny\Router\App;

final class AppFactory
{
    public static function create(): App
    {
        if (!class_exists(ServerRequestInterface::class)) {
            throw new \RuntimeException('Install a PSR-7 implementation to use `AppFactory::create()`.');
        }
        return new App();
    }
}
