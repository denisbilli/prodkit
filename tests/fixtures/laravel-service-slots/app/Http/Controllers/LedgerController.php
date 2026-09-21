<?php

namespace App\Http\Controllers;

use App\Models\Entry;

class LedgerController extends Controller
{
    public function index()
    {
        return Entry::where('user_id', auth()->id())->paginate(50);
    }
}
