"""TapTap 认证相关 API 文档"""

AUTH_DOCUMENTATION = {
    "title": "TapTap 认证系统",
    "description": "TapTap 小游戏平台的用户认证和授权机制",
    "categories": {
        "oauth": {
            "title": "OAuth 2.0 认证",
            "description": "使用 OAuth 2.0 标准进行用户授权登录",
            "methods": [
                {
                    "name": "授权码流程",
                    "description": "标准的 OAuth 2.0 授权码流程",
                    "example": """
// 1. 跳转到 TapTap 授权页面
const authUrl = 'https://www.taptap.com/oauth2/v1/authorize?' +
  'client_id=YOUR_CLIENT_ID&' +
  'redirect_uri=YOUR_REDIRECT_URI&' +
  'response_type=code&' +
  'scope=basic_info';

window.location.href = authUrl;

// 2. 在回调页面获取授权码并换取访问令牌
const code = new URLSearchParams(window.location.search).get('code');

const tokenResponse = await fetch('https://www.taptap.com/oauth2/v1/token', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
        client_id: 'YOUR_CLIENT_ID',
        client_secret: 'YOUR_CLIENT_SECRET',
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: 'YOUR_REDIRECT_URI'
    })
});

const tokens = await tokenResponse.json();
console.log('Access Token:', tokens.access_token);
"""
                }
            ]
        },
        "api_key": {
            "title": "API Key 认证",
            "description": "使用 API Key 进行服务器到服务器的认证",
            "methods": [
                {
                    "name": "Bearer Token",
                    "description": "在请求头中添加 Authorization: Bearer {api_key}",
                    "example": """
// JavaScript 示例
const response = await fetch('https://api.taptap.com/v1/user/profile', {
    headers: {
        'Authorization': 'Bearer YOUR_API_KEY',
        'Content-Type': 'application/json'
    }
});

const userProfile = await response.json();
"""
                }
            ]
        },
        "token_management": {
            "title": "令牌管理",
            "description": "访问令牌的刷新和管理",
            "best_practices": [
                "定期刷新访问令牌以保持会话有效",
                "安全存储刷新令牌，避免明文存储",
                "实现令牌过期的自动处理机制",
                "为不同的 API 范围使用合适的权限"
            ],
            "example": """
// 刷新访问令牌
async function refreshAccessToken(refreshToken) {
    const response = await fetch('https://www.taptap.com/oauth2/v1/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            client_id: 'YOUR_CLIENT_ID',
            client_secret: 'YOUR_CLIENT_SECRET',
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        })
    });

    return await response.json();
}
"""
        }
    }
}

AUTH_SEARCH_INDEX = {
    "keywords": {
        "认证": ["oauth", "api_key", "token_management"],
        "授权": ["oauth", "token_management"],
        "登录": ["oauth"],
        "令牌": ["oauth", "token_management"],
        "token": ["oauth", "token_management"],
        "api_key": ["api_key"],
        "oauth": ["oauth"],
        "刷新": ["token_management"]
    }
}