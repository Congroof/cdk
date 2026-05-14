use serde::{Deserialize, Serialize};
use std::io::{self, Write};

#[derive(Serialize)]
struct ActivateRequest {
    code: String,
    machine_code: String,
}

#[derive(Deserialize)]
struct ApiResponse {
    success: bool,
    data: Option<serde_json::Value>,
    error: Option<String>,
}

fn get_machine_code() -> String {
    machine_uid::get().unwrap_or_else(|_| "unknown".to_string())
}

fn main() {
    let server = std::env::var("CDK_SERVER")
        .unwrap_or_else(|_| "http://127.0.0.1:80".to_string());

    println!("=================================");
    println!("       CDK 激活工具 v0.1.0");
    println!("=================================");
    println!();

    let machine_code = get_machine_code();
    println!("机器码: {}", machine_code);
    println!("服务器: {}", server);
    println!();

    print!("请输入激活码: ");
    io::stdout().flush().unwrap();

    let mut code = String::new();
    io::stdin().read_line(&mut code).unwrap();
    let code = code.trim().to_string();

    if code.is_empty() {
        println!("错误: 激活码不能为空");
        return;
    }

    println!();
    println!("正在激活...");

    let client = reqwest::blocking::Client::new();
    let url = format!("{}/api/client/activate", server);

    match client
        .post(&url)
        .json(&ActivateRequest {
            code: code.clone(),
            machine_code: machine_code.clone(),
        })
        .send()
    {
        Ok(resp) => {
            let status = resp.status();
            match resp.json::<ApiResponse>() {
                Ok(body) => {
                    if body.success {
                        println!("激活成功!");
                        if let Some(data) = body.data {
                            if let Some(msg) = data.get("message").and_then(|v| v.as_str()) {
                                println!("  {}", msg);
                            }
                            if let Some(exp) = data.get("expires_at").and_then(|v| v.as_str()) {
                                println!("  过期时间: {}", exp);
                            }
                        }
                    } else {
                        println!("激活失败 ({})", status);
                        if let Some(err) = body.error {
                            println!("  原因: {}", err);
                        }
                    }
                }
                Err(e) => println!("解析响应失败: {}", e),
            }
        }
        Err(e) => println!("请求失败: {}", e),
    }

    println!();
    println!("按回车键退出...");
    let mut buf = String::new();
    io::stdin().read_line(&mut buf).ok();
}
