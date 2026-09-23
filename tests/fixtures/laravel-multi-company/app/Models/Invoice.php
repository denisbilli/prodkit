<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Invoice extends Model
{
    protected $fillable = ['company_id', 'amount'];

    public function scopeCompanyId($query, $company_id)
    {
        return $query->where('company_id', '=', $company_id);
    }
}
