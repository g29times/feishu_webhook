// 划线取词助手 - Background Script
// 用于处理跨域请求

// 默认 Webhook 地址
const DEFAULT_WEBHOOK_URL = 'https://www.feishu.cn/flow/api/trigger-webhook/f0b419896d69c20daf099813dfcf3126';
// 默认请求体模版
const DEFAULT_REQUEST_BODY = JSON.stringify({
  idea: "{{text}}",
  url: "{{url}}"
}, null, 2);

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

// 获取 Webhook 配置
async function getWebhookConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['webhookUrl', 'requestBody'], function(result) {
      resolve({
        url: result.webhookUrl || DEFAULT_WEBHOOK_URL,
        bodyTemplate: result.requestBody || DEFAULT_REQUEST_BODY
      });
    });
  });
}

// 递归替换对象中的占位符
function processTemplate(obj, data) {
  if (typeof obj === 'string') {
    return obj
      .replace(/{{text}}/g, data.text || '')
      .replace(/{{title}}/g, data.title || '')
      .replace(/{{labels}}/g, data.labels || '') // 支持复数
      .replace(/{{label}}/g, data.labels || '')  // 支持单数别名
      .replace(/{{url}}/g, data.url || '');
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => processTemplate(item, data));
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const result = {};
    for (const key in obj) {
      result[key] = processTemplate(obj[key], data);
    }
    return result;
  }
  
  return obj;
}

// 发送到Webhook的函数
async function sendToWebhook(idea, url) {
  try {
    const config = await getWebhookConfig();
    
    // 准备模板数据
    let templateData = {
      url: url
    };

    if (typeof idea === 'object' && idea !== null) {
      // 来自笔记的丰富数据
      templateData.text = idea.idea || '';
      templateData.title = idea.title || '';
      templateData.labels = idea.labels || '';
    } else {
      // 来自划线的简单文本
      templateData.text = idea;
      templateData.title = '';
      templateData.labels = '';
    }
    
    // 解析模板并替换数据
    let requestBody;
    try {
      const templateObj = JSON.parse(config.bodyTemplate);
      requestBody = processTemplate(templateObj, templateData);
    } catch (e) {
      console.error('模板解析失败，使用默认格式', e);
      requestBody = {
        idea: templateData.text,
        title: templateData.title,
        labels: templateData.labels,
        url: url
      };
    }

    console.log('准备发送到 Webhook:', { 
      webhookUrl: config.url, 
      body: requestBody 
    });
    
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
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
