<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class DataController extends Controller
{
    public function download(Request $request)
    {
        $bookmarks = $request->user()->bookmarks()->get();

        return response()->streamDownload(function () use ($bookmarks) {
            echo $bookmarks->toJson();
        }, 'bookmarks.json');
    }
}
