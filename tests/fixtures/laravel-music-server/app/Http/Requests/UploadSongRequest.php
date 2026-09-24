<?php

namespace App\Http\Requests;

use App\Rules\SupportedAudioFile;
use Illuminate\Foundation\Http\FormRequest;

class UploadSongRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'file' => ['required', 'file', new SupportedAudioFile()],
        ];
    }
}
