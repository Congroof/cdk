use std::collections::HashMap;
use std::sync::Mutex;

use chrono::Utc;
use serde::Serialize;
use tokio::sync::mpsc;
use uuid::Uuid;

pub const MAX_CONNECTIONS: usize = 3_000;
pub const CONNECTION_QUEUE_CAPACITY: usize = 32;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CdkConnectionKey {
    pub owner_id: i64,
    pub cdk_id: i64,
    pub machine_code: String,
}

impl CdkConnectionKey {
    pub fn new(owner_id: i64, cdk_id: i64, machine_code: impl Into<String>) -> Self {
        Self {
            owner_id,
            cdk_id,
            machine_code: machine_code.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CdkInvalidationEvent {
    pub version: u8,
    pub event_id: String,
    #[serde(rename = "type")]
    pub event_type: &'static str,
    pub occurred_at: String,
    pub payload: CdkInvalidationPayload,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CdkInvalidationPayload {
    pub reason: &'static str,
}

impl CdkInvalidationEvent {
    fn rebound() -> Self {
        Self {
            version: 1,
            event_id: Uuid::new_v4().to_string(),
            event_type: "cdkBindingInvalidated",
            occurred_at: Utc::now().to_rfc3339(),
            payload: CdkInvalidationPayload { reason: "rebound" },
        }
    }
}

#[derive(Debug)]
pub enum CdkConnectionCommand {
    Invalidate(CdkInvalidationEvent),
}

pub struct CdkConnectionRegistration {
    pub connection_id: Uuid,
    pub receiver: mpsc::Receiver<CdkConnectionCommand>,
}

#[derive(Default)]
struct RegistryState {
    connections: HashMap<CdkConnectionKey, HashMap<Uuid, mpsc::Sender<CdkConnectionCommand>>>,
    connection_count: usize,
}

#[derive(Default)]
pub struct CdkConnectionRegistry {
    state: Mutex<RegistryState>,
}

impl CdkConnectionRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&self, key: CdkConnectionKey) -> Option<CdkConnectionRegistration> {
        let mut state = self.state.lock().ok()?;
        if state.connection_count >= MAX_CONNECTIONS {
            return None;
        }

        let connection_id = Uuid::new_v4();
        let (sender, receiver) = mpsc::channel(CONNECTION_QUEUE_CAPACITY);
        state
            .connections
            .entry(key)
            .or_default()
            .insert(connection_id, sender);
        state.connection_count += 1;

        Some(CdkConnectionRegistration {
            connection_id,
            receiver,
        })
    }

    pub fn remove(&self, key: &CdkConnectionKey, connection_id: Uuid) {
        let Ok(mut state) = self.state.lock() else {
            return;
        };

        let mut removed = false;
        let mut remove_key = false;
        if let Some(connections) = state.connections.get_mut(key) {
            removed = connections.remove(&connection_id).is_some();
            remove_key = connections.is_empty();
        }
        if remove_key {
            state.connections.remove(key);
        }
        if removed {
            state.connection_count = state.connection_count.saturating_sub(1);
        }
    }

    pub fn invalidate_binding(&self, owner_id: i64, cdk_id: i64, machine_code: &str) -> usize {
        let key = CdkConnectionKey::new(owner_id, cdk_id, machine_code);
        let senders = {
            let Ok(mut state) = self.state.lock() else {
                return 0;
            };
            let Some(connections) = state.connections.remove(&key) else {
                return 0;
            };
            state.connection_count = state.connection_count.saturating_sub(connections.len());
            connections.into_values().collect::<Vec<_>>()
        };

        let event = CdkInvalidationEvent::rebound();
        for sender in &senders {
            let _ = sender.try_send(CdkConnectionCommand::Invalidate(event.clone()));
        }
        senders.len()
    }

    pub fn connection_count(&self) -> usize {
        self.state
            .lock()
            .map(|state| state.connection_count)
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalidation_targets_every_connection_for_one_binding() {
        let registry = CdkConnectionRegistry::new();
        let key = CdkConnectionKey::new(1, 7, "OLD");
        let mut first = registry.register(key.clone()).expect("first registration");
        let mut second = registry.register(key).expect("second registration");
        let _other = registry
            .register(CdkConnectionKey::new(1, 7, "OTHER"))
            .expect("other registration");

        assert_eq!(registry.invalidate_binding(1, 7, "OLD"), 2);
        assert_eq!(registry.connection_count(), 1);
        assert!(matches!(
            first.receiver.try_recv(),
            Ok(CdkConnectionCommand::Invalidate(_))
        ));
        assert!(matches!(
            second.receiver.try_recv(),
            Ok(CdkConnectionCommand::Invalidate(_))
        ));
    }

    #[test]
    fn remove_is_idempotent() {
        let registry = CdkConnectionRegistry::new();
        let key = CdkConnectionKey::new(1, 7, "MACHINE");
        let registration = registry.register(key.clone()).expect("registration");

        registry.remove(&key, registration.connection_id);
        registry.remove(&key, registration.connection_id);

        assert_eq!(registry.connection_count(), 0);
    }

    #[test]
    fn invalidation_event_uses_public_contract_without_credentials() {
        let value = serde_json::to_value(CdkInvalidationEvent::rebound()).expect("serialize");

        assert_eq!(value["version"], 1);
        assert_eq!(value["type"], "cdkBindingInvalidated");
        assert_eq!(value["payload"]["reason"], "rebound");
        assert!(value.get("cdk").is_none());
        assert!(value.get("machineCode").is_none());
    }

    #[test]
    fn registration_stops_at_the_global_capacity() {
        let registry = CdkConnectionRegistry::new();
        let mut registrations = Vec::with_capacity(MAX_CONNECTIONS);
        for index in 0..MAX_CONNECTIONS {
            registrations.push(
                registry
                    .register(CdkConnectionKey::new(1, index as i64, "MACHINE"))
                    .expect("connection below capacity"),
            );
        }

        assert_eq!(registry.connection_count(), MAX_CONNECTIONS);
        assert!(registry
            .register(CdkConnectionKey::new(1, 10_001, "MACHINE"))
            .is_none());
    }
}
