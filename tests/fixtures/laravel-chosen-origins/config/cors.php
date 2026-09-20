<?php

return [
    'paths' => ['api/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => ['https://ledger.example.com', 'https://admin.example.com'],

    'allowed_headers' => ['*'],

    'supports_credentials' => false,
];
