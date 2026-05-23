mod config;
mod db;
mod errors;
mod handlers;
mod middleware;
mod models;

use axum::http::Method;
use axum::routing::{get, post};
use axum::{middleware as axum_mw, Router};
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::MySqlPool,
    pub jwt_secret: String,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    dotenvy::dotenv().ok();

    let cfg = config::Config::from_env();
    let pool = db::create_pool(&cfg.database_url).await;
    let state = AppState {
        db: pool,
        jwt_secret: cfg.jwt_secret.clone(),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any);

    let protected = Router::new()
        .route("/cdk/generate", post(handlers::cdk::generate))
        .route("/cdk/list", get(handlers::cdk::list))
        .route("/cdk/stats", get(handlers::cdk::stats))
        .route("/cdk/export", get(handlers::cdk::export))
        .route("/cdk/validate", post(handlers::cdk::validate))
        .route("/cdk/activate", post(handlers::cdk::activate))
        .route("/cdk/disable", post(handlers::cdk::disable))
        .route_layer(axum_mw::from_fn_with_state(
            state.clone(),
            middleware::auth::auth_middleware,
        ));

    let client_routes = Router::new()
        .route("/client/validate", post(handlers::cdk::validate))
        .route("/client/activate", post(handlers::cdk::activate));

    let user_client_routes = Router::new()
        .route("/client/u/{username}/validate", post(handlers::cdk::user_validate))
        .route("/client/u/{username}/activate", post(handlers::cdk::user_activate));

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
