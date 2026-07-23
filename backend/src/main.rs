mod cdk_events;
mod config;
mod db;
mod errors;
mod handlers;
mod hash_sync;
mod kdocs;
mod middleware;
mod models;

use std::sync::Arc;

use axum::http::Method;
use axum::routing::{get, post};
use axum::{middleware as axum_mw, Router};
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::MySqlPool,
    pub jwt_secret: String,
    pub cdk_connections: Arc<cdk_events::CdkConnectionRegistry>,
    pub kdocs: kdocs::KdocsService,
    pub hash_sync: Arc<hash_sync::HashSyncController>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    dotenvy::dotenv().ok();

    let cfg = config::Config::from_env();
    let pool = db::create_pool(&cfg.database_url).await;
    let kdocs = kdocs::KdocsService::new(&cfg.kdocs_credential_key)
        .expect("KDOCS_CREDENTIAL_KEY must be a Base64-encoded 32-byte key");
    let hash_sync =
        hash_sync::HashSyncController::new(cfg.hash_sync.clone(), pool.clone(), kdocs.clone());
    let state = AppState {
        db: pool,
        jwt_secret: cfg.jwt_secret.clone(),
        cdk_connections: Arc::new(cdk_events::CdkConnectionRegistry::new()),
        kdocs,
        hash_sync: hash_sync.clone(),
    };
    hash_sync.spawn_schedule();

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any);

    let protected = Router::new()
        .route(
            "/announcement",
            get(handlers::announcement::get).post(handlers::announcement::save),
        )
        .route("/cdk/generate", post(handlers::cdk::generate))
        .route("/cdk/list", get(handlers::cdk::list))
        .route(
            "/cdk/multi-device-bindings",
            get(handlers::cdk::multi_device_bindings),
        )
        .route(
            "/cdk/{cdk_id}/binding-history",
            get(handlers::cdk::binding_history),
        )
        .route("/cdk/stats", get(handlers::cdk::stats))
        .route("/cdk/export", get(handlers::cdk::export))
        .route("/cdk/usage-stats", get(handlers::cdk::usage_stats))
        .route("/cdk/machine-usage", get(handlers::cdk::machine_usage))
        .route("/cdk/validate", post(handlers::cdk::validate))
        .route("/cdk/activate", post(handlers::cdk::activate))
        .route("/cdk/disable", post(handlers::cdk::disable))
        .route("/cdk/update-validity", post(handlers::cdk::update_validity))
        .route("/banned/list", get(handlers::banned::list))
        .route("/banned/ban", post(handlers::banned::ban))
        .route("/banned/unban", post(handlers::banned::unban))
        .route("/feedback/list", get(handlers::feedback::list))
        .route("/feedback/set-done", post(handlers::feedback::set_done))
        .route("/feedback/reply", post(handlers::feedback::reply))
        .route(
            "/skinforge/kdocs-settings",
            get(handlers::skinforge::get_kdocs_settings)
                .post(handlers::skinforge::save_kdocs_settings),
        )
        .route(
            "/skinforge/release",
            get(handlers::skinforge::get_release).post(handlers::skinforge::save_release),
        )
        .route(
            "/skinforge/hash-status",
            get(handlers::skinforge::get_hash_status),
        )
        .route(
            "/skinforge/hash-sync",
            post(handlers::skinforge::trigger_hash_sync),
        )
        .route_layer(axum_mw::from_fn_with_state(
            state.clone(),
            middleware::auth::auth_middleware,
        ));

    let client_routes = Router::new()
        .route("/client/validate", post(handlers::cdk::validate))
        .route("/client/activate", post(handlers::cdk::activate))
        .route("/client/feedback", post(handlers::feedback::submit))
        .route(
            "/client/feedback/query",
            post(handlers::feedback::query_for_client),
        );

    let user_client_routes = Router::new()
        .route(
            "/client/u/{username}/cdk-events",
            get(handlers::cdk_events::connect),
        )
        .route(
            "/client/u/{username}/announcement",
            get(handlers::announcement::get_for_client),
        )
        .route(
            "/client/u/{username}/validate",
            post(handlers::cdk::user_validate),
        )
        .route(
            "/client/u/{username}/activate",
            post(handlers::cdk::user_activate),
        )
        .route(
            "/client/u/{username}/feedback",
            post(handlers::feedback::submit_for_user),
        )
        .route(
            "/client/u/{username}/feedback/query",
            post(handlers::feedback::query_for_user_client),
        )
        .route(
            "/client/skinforge/update/{target}/{arch}/{current_version}",
            get(handlers::skinforge::updater),
        )
        .route(
            "/client/skinforge/hash",
            get(handlers::skinforge::public_hash),
        );

    let app = Router::new()
        .route("/api/auth/login", post(handlers::auth::login))
        .nest("/api", protected)
        .nest("/api", client_routes)
        .nest("/api", user_client_routes)
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&cfg.server_addr)
        .await
        .expect("Failed to bind address");

    tracing::info!("Server running on {}", cfg.server_addr);
    axum::serve(listener, app).await.unwrap();
}
