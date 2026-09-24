<?php

namespace App\Http\Controllers;

use App\Http\Requests\UploadSongRequest;

class UploadSongController extends Controller
{
    public function __invoke(UploadSongRequest $request)
    {
        $file = $request->file->move(storage_path('uploads'), $request->file->getClientOriginalName());

        return response()->json(['path' => $file->getPathname()]);
    }
}
