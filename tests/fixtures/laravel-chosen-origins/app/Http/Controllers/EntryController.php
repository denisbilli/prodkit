<?php

namespace App\Http\Controllers;

use App\Models\Entry;
use Illuminate\Http\Request;

class EntryController extends Controller
{
    public function index()
    {
        return Entry::query()->latest()->get();
    }

    public function store(Request $request)
    {
        return Entry::create($request->validate([
            'amount' => 'required|numeric',
            'memo' => 'nullable|string',
        ]));
    }
}
