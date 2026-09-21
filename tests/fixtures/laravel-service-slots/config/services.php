<?php

return [
    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'stripe'   => [
        'model'  => User::class,
        'key'    => env('STRIPE_KEY'),
        'secret' => env('STRIPE_SECRET'),
    ],

    'pushover' => [
        'secret' => env('PUSHOVER_SECRET'),
    ],
];
