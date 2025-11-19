// 划线取词助手 - Content Script
(function() {
  'use strict';

  let floatingButton = null;
  let selectedText = '';

  // 创建浮动按钮
  function createFloatingButton() {
    if (floatingButton) {
      return floatingButton;
    }

    const button = document.createElement('div');
    button.id = 'text-selector-floating-btn';
    button.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 17L12 22L22 17" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 12L12 17L22 12" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    button.style.display = 'none';
    document.body.appendChild(button);
    
    // 点击按钮发送数据
    button.addEventListener('click', async function(e) {
      e.stopPropagation();
      if (selectedText) {
        await sendToWebhook(selectedText);
      }
      hideFloatingButton();
    });

    floatingButton = button;
    return button;
  }

  // 显示浮动按钮
  function showFloatingButton(x, y, text) {
    const button = createFloatingButton();
    selectedText = text;
    
    // 设置按钮位置
    button.style.left = `${x}px`;
    button.style.top = `${y}px`;
    button.style.display = 'flex';
    
    // 添加动画效果
    button.classList.remove('fade-out');
    button.classList.add('fade-in');
  }

  // 隐藏浮动按钮
  function hideFloatingButton() {
    if (floatingButton) {
      floatingButton.classList.remove('fade-in');
      floatingButton.classList.add('fade-out');
      setTimeout(() => {
        floatingButton.style.display = 'none';
        selectedText = '';
      }, 200);
    }
  }

  // 发送到Webhook（通过background script）
  async function sendToWebhook(idea) {
    try {
      // 显示加载状态
      if (floatingButton) {
        floatingButton.classList.add('loading');
      }

      // 获取当前页面URL
      const pageUrl = window.location.href;

      // 发送消息给background script
      chrome.runtime.sendMessage(
        { action: 'sendToWebhook', idea: idea, url: pageUrl },
        function(response) {
          if (floatingButton) {
            floatingButton.classList.remove('loading');
          }

          if (chrome.runtime.lastError) {
            console.error('消息发送失败:', chrome.runtime.lastError);
            showNotification('✗ 发送失败', 'error');
            return;
          }

          if (response && response.success) {
            // 成功提示
            showNotification('✓ 已发送到飞书', 'success');
          } else {
            showNotification('✗ 发送失败', 'error');
          }
        }
      );
    } catch (error) {
      console.error('发送失败:', error);
      if (floatingButton) {
        floatingButton.classList.remove('loading');
      }
      showNotification('✗ 网络错误', 'error');
    }
  }

  // 显示通知
  function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `text-selector-notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 2000);
  }

  // 监听文本选择
  document.addEventListener('mouseup', function(e) {
    // 延迟一点获取选中文本，确保选择完成
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection.toString().trim();

      if (text.length > 0) {
        // 获取选中文本的位置
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // 计算按钮位置（在选中文本上方居中）
        const buttonX = rect.left + (rect.width / 2) - 25 + window.scrollX;
        const buttonY = rect.top - 60 + window.scrollY;

        showFloatingButton(buttonX, buttonY, text);
      } else {
        hideFloatingButton();
      }
    }, 10);
  });

  // 点击其他地方隐藏按钮
  document.addEventListener('mousedown', function(e) {
    if (floatingButton && !floatingButton.contains(e.target)) {
      // 延迟隐藏，避免与mouseup冲突
      setTimeout(() => {
        const selection = window.getSelection();
        if (selection.toString().trim().length === 0) {
          hideFloatingButton();
        }
      }, 100);
    }
  });

  // 监听滚动事件，隐藏按钮
  let scrollTimeout;
  document.addEventListener('scroll', function() {
    if (floatingButton && floatingButton.style.display !== 'none') {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        hideFloatingButton();
      }, 100);
    }
  }, true);

  console.log('划线取词助手已加载');
})();
