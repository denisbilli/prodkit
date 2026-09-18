<?php

namespace App\Core;

class ErrorHandler
{
    public static function handle(\Throwable $exception): void
    {
        error_log((string) $exception);
        http_response_code(500);
    }
}
