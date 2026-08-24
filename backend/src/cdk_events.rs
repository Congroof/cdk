use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use chrono::{DateTime, Utc};
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

    fn usage_key(&self) -> CdkUsageKey {
        CdkUsageKey {
            owner_id: self.owner_id,
            machine_code: self.machine_code.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct CdkUsageKey {
    owner_id: i64,
    machine_code: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CdkUsageInterval {
    pub owner_id: i64,
    pub machine_code: String,
    pub started_at: DateTime<Utc>,
    pub ended_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CdkInvalidationReason {
    Rebound,
    Expired,
    Disabled,
    Banned,
    Invalid,
}

impl CdkInvalidationReason {
    fn as_str(self) -> &'static str {
        match self {
            Self::Rebound => "rebound",
            Self::Expired => "expired",
            Self::Disabled => "disabled",
            Self::Banned => "banned",
            Self::Invalid => "invalid",
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
    fn new(reason: CdkInvalidationReason) -> Self {
        Self {
            version: 1,
            event_id: Uuid::new_v4().to_string(),
            event_type: "cdkBindingInvalidated",
            occurred_at: Utc::now().to_rfc3339(),
            payload: CdkInvalidationPayload {
                reason: reason.as_str(),
            },
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

#[derive(Debug, Default)]
pub struct CdkInvalidationOutcome {
    pub connection_count: usize,
    pub usage_intervals: Vec<CdkUsageInterval>,
}

struct UsageState {
    socket_count: usize,
    last_checkpoint_at: DateTime<Utc>,
}

#[derive(Default)]
struct RegistryState {
    connections: HashMap<CdkConnectionKey, HashMap<Uuid, mpsc::Sender<CdkConnectionCommand>>>,
    usage: HashMap<CdkUsageKey, UsageState>,
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
        self.register_at(key, Utc::now())
    }

    fn register_at(
        &self,
        key: CdkConnectionKey,
        now: DateTime<Utc>,
    ) -> Option<CdkConnectionRegistration> {
        let mut state = self.state.lock().ok()?;
        if state.connection_count >= MAX_CONNECTIONS {
            return None;
        }

        let connection_id = Uuid::new_v4();
        let (sender, receiver) = mpsc::channel(CONNECTION_QUEUE_CAPACITY);
        let usage_key = key.usage_key();
        state
            .connections
            .entry(key)
            .or_default()
            .insert(connection_id, sender);
        let usage = state.usage.entry(usage_key).or_insert(UsageState {
            socket_count: 0,
            last_checkpoint_at: now,
        });
        usage.socket_count += 1;
        state.connection_count += 1;

        Some(CdkConnectionRegistration {
            connection_id,
            receiver,
        })
    }

    pub fn remove(&self, key: &CdkConnectionKey, connection_id: Uuid) -> Option<CdkUsageInterval> {
        self.remove_at(key, connection_id, Utc::now())
    }

    fn remove_at(
        &self,
        key: &CdkConnectionKey,
        connection_id: Uuid,
        now: DateTime<Utc>,
    ) -> Option<CdkUsageInterval> {
        let Ok(mut state) = self.state.lock() else {
            return None;
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
        if !removed {
            return None;
        }

        state.connection_count = state.connection_count.saturating_sub(1);
        finish_usage_sockets(&mut state, &key.usage_key(), 1, now)
    }

    pub fn checkpoint_usage(
        &self,
        key: &CdkConnectionKey,
        now: DateTime<Utc>,
        minimum_interval: Duration,
    ) -> Option<CdkUsageInterval> {
        let Ok(minimum_interval) = chrono::Duration::from_std(minimum_interval) else {
            return None;
        };
        let Ok(mut state) = self.state.lock() else {
            return None;
        };
        let usage_key = key.usage_key();
        let usage = state.usage.get_mut(&usage_key)?;
        if now <= usage.last_checkpoint_at || now - usage.last_checkpoint_at < minimum_interval {
            return None;
        }

        let interval = usage_interval(&usage_key, usage.last_checkpoint_at, now)?;
        usage.last_checkpoint_at = now;
        Some(interval)
    }

    pub fn pending_usage(
        &self,
        owner_id: i64,
        machine_code: &str,
        now: DateTime<Utc>,
    ) -> Option<CdkUsageInterval> {
        let state = self.state.lock().ok()?;
        let usage_key = CdkUsageKey {
            owner_id,
            machine_code: machine_code.to_string(),
        };
        let usage = state.usage.get(&usage_key)?;
        usage_interval(&usage_key, usage.last_checkpoint_at, now)
    }

    pub fn restore_checkpoint(&self, interval: &CdkUsageInterval) {
        let Ok(mut state) = self.state.lock() else {
            return;
        };
        let usage_key = CdkUsageKey {
            owner_id: interval.owner_id,
            machine_code: interval.machine_code.clone(),
        };
        let Some(usage) = state.usage.get_mut(&usage_key) else {
            return;
        };
        if usage.last_checkpoint_at == interval.ended_at {
            usage.last_checkpoint_at = interval.started_at;
        }
    }

    pub fn invalidate_binding(
        &self,
        owner_id: i64,
        cdk_id: i64,
        machine_code: &str,
        reason: CdkInvalidationReason,
    ) -> CdkInvalidationOutcome {
        let key = CdkConnectionKey::new(owner_id, cdk_id, machine_code);
        let now = Utc::now();
        let (senders, usage_interval) = {
            let Ok(mut state) = self.state.lock() else {
                return CdkInvalidationOutcome::default();
            };
            let Some(connections) = state.connections.remove(&key) else {
                return CdkInvalidationOutcome::default();
            };
            state.connection_count = state.connection_count.saturating_sub(connections.len());
            let usage_interval =
                finish_usage_sockets(&mut state, &key.usage_key(), connections.len(), now);
            (
                connections.into_values().collect::<Vec<_>>(),
                usage_interval,
            )
        };

        send_invalidation(&senders, reason);
        CdkInvalidationOutcome {
            connection_count: senders.len(),
            usage_intervals: usage_interval.into_iter().collect(),
        }
    }

    pub fn invalidate_machine(
        &self,
        owner_id: i64,
        machine_code: &str,
        reason: CdkInvalidationReason,
    ) -> CdkInvalidationOutcome {
        let now = Utc::now();
        let (senders, usage_interval) = {
            let Ok(mut state) = self.state.lock() else {
                return CdkInvalidationOutcome::default();
            };
            let keys = state
                .connections
                .keys()
                .filter(|key| key.owner_id == owner_id && key.machine_code == machine_code)
                .cloned()
                .collect::<Vec<_>>();
            let mut senders = Vec::new();
            for key in keys {
                if let Some(connections) = state.connections.remove(&key) {
                    state.connection_count =
                        state.connection_count.saturating_sub(connections.len());
                    senders.extend(connections.into_values());
                }
            }
            let usage_key = CdkUsageKey {
                owner_id,
                machine_code: machine_code.to_string(),
            };
            let usage_interval = state
                .usage
                .remove(&usage_key)
                .and_then(|usage| usage_interval(&usage_key, usage.last_checkpoint_at, now));
            (senders, usage_interval)
        };

        send_invalidation(&senders, reason);
        CdkInvalidationOutcome {
            connection_count: senders.len(),
            usage_intervals: usage_interval.into_iter().collect(),
        }
    }

    pub fn connection_count(&self) -> usize {
        self.state
            .lock()
            .map(|state| state.connection_count)
            .unwrap_or_default()
    }

    pub fn online_device_count(&self, owner_id: i64) -> usize {
        self.state
            .lock()
            .map(|state| {
                state
                    .connections
                    .keys()
                    .filter(|key| key.owner_id == owner_id)
                    .count()
            })
            .unwrap_or_default()
    }
}

fn finish_usage_sockets(
    state: &mut RegistryState,
    usage_key: &CdkUsageKey,
    removed_count: usize,
    now: DateTime<Utc>,
) -> Option<CdkUsageInterval> {
    let usage = state.usage.get_mut(usage_key)?;
    usage.socket_count = usage.socket_count.saturating_sub(removed_count);
    if usage.socket_count > 0 {
        return None;
    }

    let usage = state.usage.remove(usage_key)?;
    usage_interval(usage_key, usage.last_checkpoint_at, now)
}

fn usage_interval(
    usage_key: &CdkUsageKey,
    started_at: DateTime<Utc>,
    ended_at: DateTime<Utc>,
) -> Option<CdkUsageInterval> {
    (ended_at > started_at).then(|| CdkUsageInterval {
        owner_id: usage_key.owner_id,
        machine_code: usage_key.machine_code.clone(),
        started_at,
        ended_at,
    })
}

fn send_invalidation(
    senders: &[mpsc::Sender<CdkConnectionCommand>],
    reason: CdkInvalidationReason,
) {
    let event = CdkInvalidationEvent::new(reason);
    for sender in senders {
        let _ = sender.try_send(CdkConnectionCommand::Invalidate(event.clone()));
    }
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;

    use super::*;

    fn at(minute: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 8, 24, 10, minute, 0).unwrap()
    }

    #[test]
    fn invalidation_targets_every_connection_for_one_binding() {
        let registry = CdkConnectionRegistry::new();
        let key = CdkConnectionKey::new(1, 7, "OLD");
        let mut first = registry.register(key.clone()).expect("first registration");
        let mut second = registry.register(key).expect("second registration");
        let _other = registry
            .register(CdkConnectionKey::new(1, 7, "OTHER"))
            .expect("other registration");

        let outcome = registry.invalidate_binding(1, 7, "OLD", CdkInvalidationReason::Rebound);
        assert_eq!(outcome.connection_count, 2);
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
    fn overlapping_connections_share_one_usage_interval() {
        let registry = CdkConnectionRegistry::new();
        let key = CdkConnectionKey::new(1, 7, "MACHINE");
        let first = registry
            .register_at(key.clone(), at(0))
            .expect("first registration");
        let second = registry
            .register_at(key.clone(), at(1))
            .expect("second registration");

        assert!(registry
            .remove_at(&key, first.connection_id, at(2))
            .is_none());
        let interval = registry
            .remove_at(&key, second.connection_id, at(3))
            .expect("final tail interval");

        assert_eq!(interval.started_at, at(0));
        assert_eq!(interval.ended_at, at(3));
    }

    #[test]
    fn checkpoint_is_rate_limited_and_pending_starts_after_checkpoint() {
        let registry = CdkConnectionRegistry::new();
        let key = CdkConnectionKey::new(1, 7, "MACHINE");
        registry
            .register_at(key.clone(), at(0))
            .expect("registration");

        assert!(registry
            .checkpoint_usage(&key, at(4), Duration::from_secs(300))
            .is_none());
        let checkpoint = registry
            .checkpoint_usage(&key, at(5), Duration::from_secs(300))
            .expect("five minute checkpoint");
        assert_eq!(checkpoint.started_at, at(0));
        assert_eq!(checkpoint.ended_at, at(5));

        let pending = registry
            .pending_usage(1, "MACHINE", at(7))
            .expect("pending tail");
        assert_eq!(pending.started_at, at(5));
        assert_eq!(pending.ended_at, at(7));
    }

    #[test]
    fn failed_checkpoint_can_be_restored_without_overwriting_newer_progress() {
        let registry = CdkConnectionRegistry::new();
        let key = CdkConnectionKey::new(1, 7, "MACHINE");
        registry
            .register_at(key.clone(), at(0))
            .expect("registration");
        let checkpoint = registry
            .checkpoint_usage(&key, at(5), Duration::from_secs(300))
            .expect("checkpoint");

        registry.restore_checkpoint(&checkpoint);
        let restored = registry
            .pending_usage(1, "MACHINE", at(6))
            .expect("restored pending interval");
        assert_eq!(restored.started_at, at(0));
    }

    #[test]
    fn machine_usage_is_deduplicated_across_different_cdks() {
        let registry = CdkConnectionRegistry::new();
        let first_key = CdkConnectionKey::new(1, 7, "MACHINE");
        let second_key = CdkConnectionKey::new(1, 8, "MACHINE");
        let first = registry
            .register_at(first_key.clone(), at(0))
            .expect("first binding");
        let second = registry
            .register_at(second_key.clone(), at(1))
            .expect("second binding");

        assert!(registry
            .remove_at(&first_key, first.connection_id, at(2))
            .is_none());
        let interval = registry
            .remove_at(&second_key, second.connection_id, at(3))
            .expect("machine tail");
        assert_eq!(interval.started_at, at(0));
        assert_eq!(interval.ended_at, at(3));
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
    fn online_devices_are_deduplicated_and_tenant_scoped() {
        let registry = CdkConnectionRegistry::new();
        let shared_key = CdkConnectionKey::new(1, 7, "MACHINE-A");
        let first = registry
            .register(shared_key.clone())
            .expect("first connection");
        let second = registry
            .register(shared_key.clone())
            .expect("second connection");
        let other_binding = registry
            .register(CdkConnectionKey::new(1, 8, "MACHINE-B"))
            .expect("other binding");
        let other_tenant = registry
            .register(CdkConnectionKey::new(2, 9, "MACHINE-C"))
            .expect("other tenant");

        assert_eq!(registry.connection_count(), 4);
        assert_eq!(registry.online_device_count(1), 2);
        assert_eq!(registry.online_device_count(2), 1);
        assert_eq!(registry.online_device_count(3), 0);

        registry.remove(&shared_key, first.connection_id);
        assert_eq!(registry.online_device_count(1), 2);
        registry.remove(&shared_key, second.connection_id);
        assert_eq!(registry.online_device_count(1), 1);

        registry.remove(
            &CdkConnectionKey::new(1, 8, "MACHINE-B"),
            other_binding.connection_id,
        );
        registry.remove(
            &CdkConnectionKey::new(2, 9, "MACHINE-C"),
            other_tenant.connection_id,
        );
        assert_eq!(registry.online_device_count(1), 0);
        assert_eq!(registry.online_device_count(2), 0);
    }

    #[test]
    fn invalidation_event_uses_public_contract_without_credentials() {
        let value = serde_json::to_value(CdkInvalidationEvent::new(CdkInvalidationReason::Expired))
            .expect("serialize");

        assert_eq!(value["version"], 1);
        assert_eq!(value["type"], "cdkBindingInvalidated");
        assert_eq!(value["payload"]["reason"], "expired");
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
