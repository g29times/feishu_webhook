// 划线取词助手 - Background Script
// 用于处理跨域请求

const WEBHOOK_URL = 'https://www.feishu.cn/flow/api/trigger-webhook/f0b419896d69c20daf099813dfcf3126';

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sendToWebhook') {
    // 发送到Webhook
    sendToWebhook(request.idea, request.url)
      .then(result => {
        sendResponse({ success: true, result: result });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    
    // 返回true表示会异步发送响应
    return true;
  }
});

// 发送到Webhook的函数
async function sendToWebhook(idea, url) {
  try {
    console.log('准备发送到 Webhook:', { idea, url });
    
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        idea: idea,
        url: url
      })
    });
    
    console.log('Webhook 响应状态:', response.status, response.statusText);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.text();
    console.log('发送成功:', data);
    return data;
  } catch (error) {
    console.error('发送失败:', error);
    throw error;
  }
}

console.log('划线取词助手 Background Script 已加载');
