use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use chrono::Utc;
use rand::Rng;
use serde_json::json;
use sha2::{Digest, Sha256};

use crate::auth::{
    models::{LoginRequest, LoginResponse, RefreshResponse, RegisterRequest, RegisterResponse, User, UserInfo},
    token::create_access_token,
};
use crate::state::AppState;

pub(crate) fn cookie_flags(expiry_days: i64) -> String {
    let secure = std::env::var("COOKIE_SECURE").unwrap_or_else(|_| "true".to_string()) == "true";
    let secure_str = if secure { "Secure; " } else { "" };
    let samesite = if secure { "SameSite=Strict" } else { "SameSite=Lax" };
    format!("HttpOnly; {}{}; Path=/; Max-Age={}", secure_str, samesite, expiry_days * 86400)
}

pub async fn register(
    State(state): State<AppState>,
    Json(payload): Json<RegisterRequest>,
) -> impl IntoResponse {
    let argon2 = Argon2::default();
    let salt = SaltString::generate(&mut OsRng);
    let password_hash = match argon2.hash_password(payload.password.as_bytes(), &salt) {
        Ok(h) => h.to_string(),
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Failed to hash password"})),
            )
                .into_response();
        }
    };

    let result = sqlx::query_as::<_, User>(
        "INSERT INTO users (email, password_hash) VALUES ($1, $2)
         RETURNING id, email, password_hash, role, created_at",
    )
    .bind(&payload.email)
    .bind(&password_hash)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(user) => (
            StatusCode::CREATED,
            Json(json!(RegisterResponse {
                user_id: user.id,
                email: user.email,
                role: user.role,
            })),
        )
            .into_response(),
        Err(e) if e.to_string().contains("duplicate") || e.to_string().contains("unique") => (
            StatusCode::CONFLICT,
            Json(json!({"error": "Email already registered"})),
        )
            .into_response(),
        Err(_) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Failed to create user"})),
        )
            .into_response(),
    }
}

pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> impl IntoResponse {
    let user = match sqlx::query_as::<_, User>(
        "SELECT id, email, password_hash, role, created_at FROM users WHERE email = $1",
    )
    .bind(&payload.email)
    .fetch_optional(&state.db)
    .await
    {
        Ok(Some(u)) => u,
        Ok(None) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "Invalid credentials"})),
            )
                .into_response();
        }
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Database error"})),
            )
                .into_response();
        }
    };

    let parsed_hash = match PasswordHash::new(&user.password_hash) {
        Ok(h) => h,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Internal error"})),
            )
                .into_response();
        }
    };

    if Argon2::default()
        .verify_password(payload.password.as_bytes(), &parsed_hash)
        .is_err()
    {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "Invalid credentials"})),
        )
            .into_response();
    }

    let access_token = match create_access_token(&user) {
        Ok(t) => t,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Failed to create token"})),
            )
                .into_response();
        }
    };

    // Generate refresh token
    let raw_token: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(64)
        .map(char::from)
        .collect();
    let token_hash = format!("{:x}", Sha256::digest(raw_token.as_bytes()));

    let expiry_days: i64 = std::env::var("REFRESH_TOKEN_EXPIRY_DAYS")
        .unwrap_or_else(|_| "30".to_string())
        .parse()
        .unwrap_or(30);
    let expires_at = Utc::now() + chrono::Duration::days(expiry_days);

    let insert_result = sqlx::query(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    )
    .bind(user.id)
    .bind(&token_hash)
    .bind(expires_at)
    .execute(&state.db)
    .await;

    if insert_result.is_err() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Failed to create session"})),
        )
            .into_response();
    }

    let cookie = format!("refresh_token={}; {}", raw_token, cookie_flags(expiry_days));

    let mut headers = HeaderMap::new();
    headers.insert(header::SET_COOKIE, cookie.parse().unwrap());

    (
        StatusCode::OK,
        headers,
        Json(json!(LoginResponse {
            access_token,
            user: UserInfo {
                id: user.id,
                email: user.email,
                role: user.role,
            },
        })),
    )
        .into_response()
}

pub async fn refresh(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let raw_token = extract_refresh_cookie(&headers);
    let raw_token = match raw_token {
        Some(t) => t,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "No refresh token"})),
            )
                .into_response();
        }
    };

    let token_hash = format!("{:x}", Sha256::digest(raw_token.as_bytes()));

    let row = sqlx::query_as::<_, crate::auth::models::RefreshToken>(
        "SELECT id, user_id, token_hash, expires_at, created_at FROM refresh_tokens WHERE token_hash = $1",
    )
    .bind(&token_hash)
    .fetch_optional(&state.db)
    .await;

    let refresh_record = match row {
        Ok(Some(r)) => r,
        _ => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "Invalid refresh token"})),
            )
                .into_response();
        }
    };

    if refresh_record.expires_at < Utc::now() {
        let _ = sqlx::query("DELETE FROM refresh_tokens WHERE id = $1")
            .bind(refresh_record.id)
            .execute(&state.db)
            .await;
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "Refresh token expired"})),
        )
            .into_response();
    }

    let user = match sqlx::query_as::<_, User>(
        "SELECT id, email, password_hash, role, created_at FROM users WHERE id = $1",
    )
    .bind(refresh_record.user_id)
    .fetch_optional(&state.db)
    .await
    {
        Ok(Some(u)) => u,
        _ => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "User not found"})),
            )
                .into_response();
        }
    };

    // Rotate: delete old token, insert new one
    let _ = sqlx::query("DELETE FROM refresh_tokens WHERE id = $1")
        .bind(refresh_record.id)
        .execute(&state.db)
        .await;

    let new_raw: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(64)
        .map(char::from)
        .collect();
    let new_hash = format!("{:x}", Sha256::digest(new_raw.as_bytes()));
    let expiry_days: i64 = std::env::var("REFRESH_TOKEN_EXPIRY_DAYS")
        .unwrap_or_else(|_| "30".to_string())
        .parse()
        .unwrap_or(30);
    let expires_at = Utc::now() + chrono::Duration::days(expiry_days);

    if sqlx::query(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    )
    .bind(user.id)
    .bind(&new_hash)
    .bind(expires_at)
    .execute(&state.db)
    .await
    .is_err()
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Failed to rotate session"})),
        )
            .into_response();
    }

    let access_token = match create_access_token(&user) {
        Ok(t) => t,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Failed to create token"})),
            )
                .into_response();
        }
    };

    let cookie = format!("refresh_token={}; {}", new_raw, cookie_flags(expiry_days));

    let mut resp_headers = HeaderMap::new();
    resp_headers.insert(header::SET_COOKIE, cookie.parse().unwrap());

    (
        StatusCode::OK,
        resp_headers,
        Json(json!(RefreshResponse { access_token })),
    )
        .into_response()
}

pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> impl IntoResponse {
    if let Some(raw_token) = extract_refresh_cookie(&headers) {
        let token_hash = format!("{:x}", Sha256::digest(raw_token.as_bytes()));
        let _ = sqlx::query("DELETE FROM refresh_tokens WHERE token_hash = $1")
            .bind(&token_hash)
            .execute(&state.db)
            .await;
    }

    let clear_cookie = format!("refresh_token=; {}", cookie_flags(0));

    let mut resp_headers = HeaderMap::new();
    resp_headers.insert(header::SET_COOKIE, clear_cookie.parse().unwrap());

    (StatusCode::NO_CONTENT, resp_headers).into_response()
}

fn extract_refresh_cookie(headers: &HeaderMap) -> Option<String> {
    let cookie_header = headers.get(header::COOKIE)?.to_str().ok()?;
    cookie_header
        .split(';')
        .map(|s| s.trim())
        .find(|s| s.starts_with("refresh_token="))
        .map(|s| s["refresh_token=".len()..].to_string())
}
