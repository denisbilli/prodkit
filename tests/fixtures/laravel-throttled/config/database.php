<?php

return [
    'default' => env('DB_CONNECTION', 'pgsql'),

    'connections' => [
        'sqlite' => ['driver' => 'sqlite', 'database' => env('DB_DATABASE')],
        'mysql'  => ['driver' => 'mysql', 'host' => env('DB_HOST', '127.0.0.1')],
        'pgsql'  => ['driver' => 'pgsql', 'host' => env('DB_HOST', '127.0.0.1')],
    ],
];
