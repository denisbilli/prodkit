package com.example.notifier

import android.Manifest
import android.os.Build
import androidx.appcompat.app.AppCompatActivity
import com.livinglifetechway.quickpermissionskotlin.runWithPermissions
import com.livinglifetechway.quickpermissionskotlin.util.QuickPermissionsOptions
import com.livinglifetechway.quickpermissionskotlin.util.QuickPermissionsRequest

class InitializationActivity : AppCompatActivity() {

    private fun withNotificationPermission(action: () -> Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val options = QuickPermissionsOptions(
                handleRationale = true,
                handlePermanentlyDenied = true,
                rationaleMethod = { req -> explain(req) },
                permanentDeniedMethod = { req -> explain(req) }
            )
            runWithPermissions(
                Manifest.permission.POST_NOTIFICATIONS,
                options = options,
                callback = action
            )
        } else {
            action()
        }
    }

    private fun explain(req: QuickPermissionsRequest) {
        // Shown before the system dialog: why this app needs to post notifications.
        req.proceed()
    }
}
