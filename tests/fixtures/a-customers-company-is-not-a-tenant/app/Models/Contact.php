<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Contact extends Model
{
    protected $fillable = ['company_id', 'email'];

    public function company()
    {
        return $this->belongsTo(Company::class, 'company_id');
    }
}
