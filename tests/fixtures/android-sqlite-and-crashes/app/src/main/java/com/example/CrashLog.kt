package com.example

import java.io.File

object CrashLog {
    fun write(error: Throwable) {
        File("/data/data/com.example.mail/crash.log").appendText(error.stackTraceToString())
    }
}
