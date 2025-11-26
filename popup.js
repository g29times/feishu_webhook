// 划线取词助手 - Popup Script

// 默认 Webhook 地址
const DEFAULT_WEBHOOK_URL = 'https://www.feishu.cn/flow/api/trigger-webhook/f0b419896d69c20daf099813dfcf3126';
// 默认请求体模版
const DEFAULT_REQUEST_BODY = JSON.stringify({
  idea: "{{text}}",
  url: "{{url}}"
}, null, 2);

document.addEventListener('DOMContentLoaded', function() {
  console.log('划线取词助手 Popup 已加载');
  
  const webhookInput = document.getElementById('webhookUrl');
  const requestBodyInput = document.getElementById('requestBody');
  const saveBtn = document.getElementById('saveBtn');
  const message = document.getElementById('message');

  // 加载已保存的配置
  loadConfig();

  // 保存按钮点击事件
  saveBtn.addEventListener('click', saveConfig);

  // 支持回车键保存 (仅针对单行输入框)
  webhookInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      saveConfig();
    }
  });

  // 加载配置
  function loadConfig() {
    chrome.storage.local.get(['webhookUrl', 'requestBody'], function(result) {
      webhookInput.value = result.webhookUrl || DEFAULT_WEBHOOK_URL;
      requestBodyInput.value = result.requestBody || DEFAULT_REQUEST_BODY;
    });
  }

  // 保存配置
  function saveConfig() {
    const url = webhookInput.value.trim();
    const bodyStr = requestBodyInput.value.trim();

    // 验证 URL 格式
    if (!url) {
      showMessage('❌ 请输入 Webhook 地址', 'error');
      return;
    }

    if (!isValidUrl(url)) {
      showMessage('❌ 请输入有效的 URL', 'error');
      return;
    }

    // 验证 JSON 格式
    try {
      JSON.parse(bodyStr);
    } catch (e) {
      showMessage('❌ JSON 格式错误', 'error');
      return;
    }

    // 保存到 storage
    chrome.storage.local.set({ 
      webhookUrl: url,
      requestBody: bodyStr
    }, function() {
      showMessage('✅ 保存成功', 'success');
      console.log('配置已保存');
    });
  }

  // 验证 URL 格式
  function isValidUrl(string) {
    try {
      const url = new URL(string);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  // 显示消息提示
  function showMessage(text, type) {
    message.textContent = text;
    message.className = 'message show';
    
    setTimeout(() => {
      message.classList.remove('show');
    }, 2000);
  }
});
