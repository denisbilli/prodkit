use std::sync::mpsc::Sender;

// An in-process bus. Nothing here is written down: subscribers react and the message is
// gone. The name is the same as a trail's; the thing is not.
pub enum AppEvent {
    CipherUpdated(String),
    VaultSynced(String),
}

pub fn emit_event(bus: &Sender<AppEvent>, event: AppEvent) {
    let _ = bus.send(event);
}

pub fn record_event(bus: &Sender<AppEvent>, event: AppEvent) {
    emit_event(bus, event);
}
