<?php

use App\Http\Controllers\EntryController;
use Illuminate\Support\Facades\Route;

// The limit is defined in the provider; no alias is applied here.
Route::get('/entries', [EntryController::class, 'index']);
