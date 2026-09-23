<?php

use Slim\Factory\AppFactory;

require __DIR__ . '/../vendor/autoload.php';

$app = AppFactory::create();
$app->get('/health', function ($request, $response) {
    $response->getBody()->write('ok');
    return $response;
});
$app->run();
