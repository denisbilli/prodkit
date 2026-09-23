<?php

namespace Tiny\Router;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class App
{
    public function handle(ServerRequestInterface $request): ?ResponseInterface
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        return null;
    }
}
