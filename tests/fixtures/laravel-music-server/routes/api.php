<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\UploadSongController;
use Illuminate\Support\Facades\Route;

Route::middleware('throttle:10,1')->group(static function (): void {
    Route::post('me', [AuthController::class, 'login']);
});

Route::post('upload', UploadSongController::class)->middleware('auth');
