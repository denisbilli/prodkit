<?php

use App\Http\Controllers\EntryController;
use Illuminate\Support\Facades\Route;

Route::middleware(['throttle:api'])->group(function () {
    Route::get('/entries', [EntryController::class, 'index']);
    Route::post('/entries', [EntryController::class, 'store']);
});
