<?php

use App\Http\Controllers\EntryController;
use Illuminate\Support\Facades\Route;

Route::get('/entries', [EntryController::class, 'index']);
Route::post('/entries', [EntryController::class, 'store']);
