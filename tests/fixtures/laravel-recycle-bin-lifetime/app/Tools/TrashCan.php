<?php

namespace App\Tools;

use App\Models\Deletion;
use Illuminate\Support\Carbon;

class TrashCan
{
    public function autoClearOld(): int
    {
        $lifetime = intval(config('app.recycle_bin_lifetime'));
        if ($lifetime < 0) {
            return 0;
        }

        $clearBeforeDate = Carbon::now()->subDays($lifetime);
        $deleteCount = 0;

        $deletionsToRemove = Deletion::query()->where('created_at', '<', $clearBeforeDate)->get();
        foreach ($deletionsToRemove as $deletion) {
            $deleteCount += $this->destroyFromDeletion($deletion);
        }

        return $deleteCount;
    }

    protected function destroyFromDeletion(Deletion $deletion): int
    {
        $deletion->deletable->forceDelete();
        $deletion->delete();

        return 1;
    }
}
