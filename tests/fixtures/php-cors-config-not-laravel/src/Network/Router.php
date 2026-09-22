<?php

namespace Acme\Network;

class Router
{
    public function handle(Request $request, Response $response): void
    {
        $response->setStatusCode(200)->json($this->dispatch($request));
    }
}
