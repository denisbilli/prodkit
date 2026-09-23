<?php

namespace App\Http\Controllers;

use App\Models\Invoice;
use Illuminate\Http\Request;

class ReportsController extends Controller
{
    public function all(Request $request)
    {
        abort_unless($request->user()->can('export-reports'), 403);

        return response()->streamDownload(function () {
            echo Invoice::all()->toJson();
        }, 'invoices.json');
    }
}
