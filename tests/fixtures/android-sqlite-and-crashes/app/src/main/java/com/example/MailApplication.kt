package com.example

import android.app.Application
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class MailStore(application: Application) : SQLiteOpenHelper(application, "mail.db", null, 1) {
    override fun onCreate(database: SQLiteDatabase) {
        database.execSQL("CREATE TABLE message (id INTEGER PRIMARY KEY, subject TEXT, body TEXT)")
    }

    override fun onUpgrade(database: SQLiteDatabase, from: Int, to: Int) = Unit

    fun store(subject: String, body: String) {
        writableDatabase.execSQL("INSERT INTO message (subject, body) VALUES (?, ?)", arrayOf(subject, body))
    }
}

class MailApplication : Application() {
    override fun onCreate() {
        super.onCreate()

        val original = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            CrashLog.write(error)
            original?.uncaughtException(thread, error)
        }
    }
}
