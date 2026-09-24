<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\File;

class SupportedAudioFile implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (!in_array(File::mimeType($value->getRealPath()), ['audio/mpeg', 'audio/flac'], true)) {
            $fail('Unsupported audio file');
        }
    }
}
