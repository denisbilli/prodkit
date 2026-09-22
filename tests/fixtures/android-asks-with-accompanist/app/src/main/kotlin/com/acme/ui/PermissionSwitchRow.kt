package com.acme.ui

import androidx.compose.runtime.Composable
import com.google.accompanist.permissions.rememberMultiplePermissionsState

@Composable
fun PermissionSwitchRow(permissions: List<String>, explanation: String) {
    val state = rememberMultiplePermissionsState(permissions)

    SwitchRow(
        text = explanation,
        checked = state.allPermissionsGranted,
        onLaunchRequest = state::launchMultiplePermissionRequest,
    )
}
