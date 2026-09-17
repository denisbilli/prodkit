package com.example

import android.content.Context
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

/**
 * Deliberately incomplete, and in the ways the mobile profile is meant to notice: the
 * permissions are declared in the manifest and never requested at the point of use,
 * the session token is written to shared preferences, and there is nothing local for
 * the app to read when the network is gone.
 */
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = getSharedPreferences("session", Context.MODE_PRIVATE)
        prefs.edit().putString("auth_token", fetchToken()).apply()
    }

    private fun fetchToken(): String = "token-from-the-server"
}
